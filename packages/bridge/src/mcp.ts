// Slidesmith MCP server — exposes the bridge to Claude Code as tools.
//
// This process is EITHER the bridge itself (the classic terminal flow: `/slidesmith`
// in a Claude Code session starts it, it listens on 8765, the browser Studio connects)
// OR just a client of a bridge somebody else already owns (Slidesmith Studio.app owns
// a long-lived one; the `claude` it drives lands here).
//
// It probes the default port first and picks. See `remote.ts` for why the silent
// EADDRINUSE fallback made this mandatory rather than nice-to-have.
//
// NOTE: stdout is reserved for the MCP JSON-RPC stream. All human-facing logging
// MUST go to stderr.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolve } from 'node:path';
import { startBridge, type BridgeHandle, DEFAULT_PORT } from './bridge.js';
import { localFacade, probeRemote, type BridgeFacade } from './remote.js';

function log(...args: unknown[]): void { console.error('[slidesmith-bridge]', ...args); }

const text = (obj: unknown) => ({ content: [{ type: 'text' as const, text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });

export interface McpOptions {
  port?: number;
  studioPath?: string;
  /** 只当客户端：探不到已有桥就直接失败，不自己起一个。app 那条路用得上——
   *  app 的桥要是没起来，安静地起一个"影子桥"只会让问题更难查。 */
  attachOnly?: boolean;
}

export async function startMcp(opts: McpOptions = {}): Promise<void> {
  const port = opts.port ?? DEFAULT_PORT;

  // ① 先探：这个端口上已经有一个活着的 Slidesmith 桥吗？
  //    有 → 当它的客户端（Studio.app 那条路）。没有 → 自己就是桥（终端老路）。
  let bridge: BridgeFacade | null = await probeRemote(`http://127.0.0.1:${port}`);
  if (bridge) {
    log(`attached to an existing bridge at ${bridge.url} (someone else owns it — probably Slidesmith Studio.app)`);
  } else if (opts.attachOnly) {
    throw new Error(`--attach-only：${port} 上没有活着的 Slidesmith 桥。先启动 Slidesmith Studio.app（或 slidesmith serve）。`);
  } else {
    const own: BridgeHandle = await startBridge({ port, studioPath: opts.studioPath });
    bridge = localFacade(own);
    log(`bridge listening at ${own.url} (Studio connects here over WebSocket)`);
  }

  const server = new McpServer({ name: 'slidesmith-bridge', version: '0.2.0' });

  server.registerTool(
    'slidesmith_open',
    {
      title: '打开 deck 到 Studio',
      description:
        '在 Studio 里打开一个契约 HTML deck，并把它和这个会话「握手」绑定。' +
        '传入 deck 的文件路径；若本会话自己持有桥接，会自动在默认浏览器打开 Studio（已连接模式）；' +
        '若已接在 Slidesmith Studio.app 的桥上，则直接把 deck 推进那个 app 的窗口。' +
        'Studio 顶栏会显示「已连接会话 X · 端口 Y」。' +
        '握手后即进入自动协作环：用 slidesmith_wait 长轮询用户的修改请求，改好用 slidesmith_apply_patch 回写。',
      inputSchema: {
        deckPath: z.string().describe('契约 HTML deck 的路径（.html）。相对路径按 cwd 解析。'),
        openBrowser: z.boolean().optional().describe('是否自动打开浏览器（默认 true；接在 app 的桥上时无效）'),
        label: z.string().optional().describe('会话标识，显示在 Studio 顶栏（默认用 deck 文件名）。'),
      },
    },
    async ({ deckPath, openBrowser, label }) => {
      try {
        const abs = resolve(process.cwd(), deckPath);
        const r = await bridge.open(abs, openBrowser !== false);
        const owner = await bridge.handshake(label || r.name.replace(/\.html?$/i, '') || 'Claude');
        // give the browser a moment to connect, but don't hang if the user
        // hasn't opened it yet — report status either way.
        await bridge.waitForStudio(8000).catch(() => undefined);
        return text({ ok: true, opened: r.name, bytes: r.bytes, url: r.url, owner, status: await bridge.status(),
          hint: '已握手。现在进入自动环：调用 slidesmith_wait 等待用户从 Studio 提交的修改请求（会阻塞到有请求或超时），拿到后改写并 slidesmith_apply_patch 回写，再继续 wait。' });
      } catch (e) {
        return text({ ok: false, error: (e as Error).message });
      }
    },
  );

  server.registerTool(
    'slidesmith_connect',
    {
      title: '握手：把本会话绑定到桥接',
      description:
        '当 Studio 已经在运行（例如用户先从 Studio 端发起、deck 已经打开过、或用户开着 Slidesmith Studio.app），' +
        '用这个工具与它「握手」：把本会话登记为 owner，Studio 顶栏立刻显示「已连接会话 X」。' +
        '之后照常 slidesmith_wait → apply_patch 自动环。',
      inputSchema: {
        label: z.string().optional().describe('会话标识，显示在 Studio 顶栏（默认 Claude）。'),
      },
    },
    async ({ label }) => {
      const o = await bridge.handshake(label || 'Claude');
      return text({ ok: true, owner: o, status: await bridge.status(),
        hint: '已握手。调用 slidesmith_wait 进入自动环。' });
    },
  );

  server.registerTool(
    'slidesmith_wait',
    {
      title: '长轮询：等用户从 Studio 提交修改请求',
      description:
        '阻塞等待，直到用户在 Studio 点「发送给 Claude」就立刻返回那条请求（含指令 + 该页 HTML + 令牌 + 输出规范 + confirm 标记）；' +
        '若 timeout 毫秒内无人提交则返回 timedOut。这是自动协作环的心跳：拿到请求→改写→apply_patch→再 wait。' +
        'request.confirm=true 表示用户开了「改前先问我」，回写时请把 preview 设为 true（Studio 会以「保留/还原」预览呈现）。',
      inputSchema: {
        timeout: z.number().optional().describe('最长阻塞毫秒数（默认 25000，上限 290000）。'),
      },
    },
    async ({ timeout }) => {
      const reqs = await bridge.waitForRequests(Math.min(Math.max(timeout || 25000, 1000), 290000));
      if (!reqs.length) return text({ ok: true, count: 0, requests: [], timedOut: true, hint: '本轮无人提交，再次调用 slidesmith_wait 继续守候。' });
      return text({ ok: true, count: reqs.length, requests: reqs, timedOut: false });
    },
  );

  server.registerTool(
    'slidesmith_get_requests',
    {
      title: '读取用户的修改意见',
      description:
        '取回用户在 Studio 里提交的修改请求（每条是一份"给 AI 的 prompt"：指令 + 该页当前 HTML + 设计令牌 + 输出规范）。' +
        '默认取走后清空队列。按里面的「输出要求」改写对应页，再用 slidesmith_apply_patch 回写。',
      inputSchema: {
        drain: z.boolean().optional().describe('取走后是否清空队列（默认 true）'),
      },
    },
    async ({ drain }) => {
      const reqs = await bridge.getRequests(drain !== false);
      if (!reqs.length) return text({ ok: true, count: 0, requests: [], hint: '当前没有待处理的修改意见。等用户在 Studio 里点「发送给 Claude」。' });
      return text({ ok: true, count: reqs.length, requests: reqs });
    },
  );

  server.registerTool(
    'slidesmith_outline',
    {
      title: '看当前 deck 有哪些页（页号 · data-id · 标题）',
      description:
        '列出 Studio 里**当前载入的那份 deck** 的每一页：页号、data-id、标题、版式、字节数。' +
        '\n\n**改任何一页之前先调它。** 理由：`data-id` 是 Studio 导入时才生成的，' +
        '磁盘上的 deck 文件里通常根本没有这个属性（editorial-slides 出的片子写的是 data-seg）。' +
        '直接去读文件的话你拿不到任何合法的 id，而 slidesmith_apply_patch 正是靠 data-id 定位——' +
        '结果就是补丁被拒（「补丁的 data-id 不匹配任何页」）。' +
        '\n\nwithHtml 里点名页号或 data-id，就连整页 `<section>`（已补好 data-id）一起返回，' +
        '直接在它上面改再 apply_patch 即可，不用读文件、也不会猜错结构。',
      inputSchema: {
        withHtml: z.array(z.string()).optional()
          .describe('要连整页 HTML 一起拿的页：data-id 或 1 开始的页号，如 ["3"] 或 ["s3","s4"]。不传只要目录。'),
      },
    },
    async ({ withHtml }) => {
      const pages = await bridge.outline(withHtml || []);
      if (!pages.length) {
        return text({ ok: true, count: 0, pages: [],
          hint: 'Studio 里还没有载入 deck。用 slidesmith_open 打开一份，或让用户在 app 里「打开 deck」。' });
      }
      return text({ ok: true, count: pages.length, pages });
    },
  );

  server.registerTool(
    'slidesmith_apply_patch',
    {
      title: '把改好的页回写到 Studio',
      description:
        '把你改好的页推回 Studio 当场生效。sections 是一个或多个 <section class="slide" data-id="…">…</section>，' +
        'Studio 按 data-id 精准替换对应页，其它页不动。若当前没有 Studio 连接，会缓存，等下次连接自动应用。' +
        'preview=true 时作为「提议」呈现：Studio 顶栏弹「AI 提议 · 保留/还原」，让用户先看再定（对应请求的 confirm 模式）。',
      inputSchema: {
        sections: z.string().describe('一个或多个 <section ... data-id="…"> 整页 HTML（可含 ```html 围栏）。务必保留原 data-id。'),
        preview: z.boolean().optional().describe('是否作为「改前先问我」的提议预览呈现（默认 false=直接生效）。'),
      },
    },
    async ({ sections, preview }) => {
      const r = await bridge.applyPatch(sections, { preview: !!preview });
      return text({ ok: true, deliveredTo: r.clients, queuedForLater: r.queued, preview: !!preview, status: await bridge.status() });
    },
  );

  server.registerTool(
    'slidesmith_status',
    {
      title: '查看桥接状态',
      description: '查看本地桥接服务状态：Studio 是否连上、当前 deck、待处理请求数、桥接归谁所有。',
      inputSchema: {},
    },
    async () => text({ ...(await bridge.status()), bridgeOwnedByThisSession: bridge.local }),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP server ready on stdio. Tools: slidesmith_open, slidesmith_connect, slidesmith_wait, slidesmith_get_requests, slidesmith_outline, slidesmith_apply_patch, slidesmith_status');

  // 客户端模式下 `close()` 是空操作——**桥不是我们起的，就不能由我们关**（app 还在用）。
  const shutdown = async () => { try { await bridge.close(); } catch { /* noop */ } process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
