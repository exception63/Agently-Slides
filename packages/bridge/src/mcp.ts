// Slidesmith MCP server — exposes the bridge to Claude Code as tools.
//
// This process IS the bridge: it starts the local HTTP+WebSocket server (so the
// browser Studio can connect) and speaks MCP over stdio (so Claude Code can
// drive it). Tools map 1:1 onto the bridge's programmatic API.
//
// NOTE: stdout is reserved for the MCP JSON-RPC stream. All human-facing logging
// MUST go to stderr.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolve } from 'node:path';
import { startBridge, type BridgeHandle, DEFAULT_PORT } from './bridge.js';

function log(...args: unknown[]): void { console.error('[slidesmith-bridge]', ...args); }

const text = (obj: unknown) => ({ content: [{ type: 'text' as const, text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });

export interface McpOptions { port?: number; studioPath?: string }

export async function startMcp(opts: McpOptions = {}): Promise<void> {
  const bridge: BridgeHandle = await startBridge({
    port: opts.port ?? DEFAULT_PORT,
    studioPath: opts.studioPath,
  });
  log(`bridge listening at ${bridge.url} (Studio connects here over WebSocket)`);

  const server = new McpServer({ name: 'slidesmith-bridge', version: '0.1.0' });

  server.registerTool(
    'slidesmith_open',
    {
      title: '打开 deck 到 Studio',
      description:
        '在浏览器 Studio 里打开一个契约 HTML deck，并把它和这个会话「握手」绑定。' +
        '传入 deck 的文件路径；会自动在默认浏览器打开 Studio（已连接模式），并把本会话登记为该桥接的 owner，' +
        'Studio 顶栏会显示「已连接会话 X · 端口 Y」。' +
        '握手后即进入自动协作环：用 slidesmith_wait 长轮询用户的修改请求，改好用 slidesmith_apply_patch 回写。',
      inputSchema: {
        deckPath: z.string().describe('契约 HTML deck 的路径（.html）。相对路径按 cwd 解析。'),
        openBrowser: z.boolean().optional().describe('是否自动打开浏览器（默认 true）'),
        label: z.string().optional().describe('会话标识，显示在 Studio 顶栏（默认用 deck 文件名）。'),
      },
    },
    async ({ deckPath, openBrowser, label }) => {
      try {
        const abs = resolve(process.cwd(), deckPath);
        const r = bridge.open(abs, openBrowser !== false);
        bridge.handshake(label || r.name.replace(/\.html?$/i, '') || 'Claude'); // bind this session
        // give the browser a moment to connect, but don't hang if the user
        // hasn't opened it yet — report status either way.
        await bridge.waitForStudio(8000).catch(() => undefined);
        return text({ ok: true, opened: r.name, bytes: r.bytes, url: r.url, owner: bridge.owner(), status: bridge.status(),
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
        '当 Studio 已经在运行（例如用户先从 Studio 端发起、或 deck 已经打开过），用这个工具与它「握手」：' +
        '把本会话登记为 owner，Studio 顶栏立刻显示「已连接会话 X」。之后照常 slidesmith_wait → apply_patch 自动环。',
      inputSchema: {
        label: z.string().optional().describe('会话标识，显示在 Studio 顶栏（默认 Claude）。'),
      },
    },
    async ({ label }) => {
      const o = bridge.handshake(label || 'Claude');
      return text({ ok: true, owner: o, status: bridge.status(),
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
      const reqs = bridge.getRequests(drain !== false);
      if (!reqs.length) return text({ ok: true, count: 0, requests: [], hint: '当前没有待处理的修改意见。等用户在 Studio 里点「发送给 Claude」。' });
      return text({ ok: true, count: reqs.length, requests: reqs });
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
      const r = bridge.applyPatch(sections, { preview: !!preview });
      return text({ ok: true, deliveredTo: r.clients, queuedForLater: r.queued, preview: !!preview, status: bridge.status() });
    },
  );

  server.registerTool(
    'slidesmith_status',
    {
      title: '查看桥接状态',
      description: '查看本地桥接服务状态：Studio 是否连上、当前 deck、待处理请求数。',
      inputSchema: {},
    },
    async () => text(bridge.status()),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP server ready on stdio. Tools: slidesmith_open, slidesmith_connect, slidesmith_wait, slidesmith_get_requests, slidesmith_apply_patch, slidesmith_status');

  const shutdown = async () => { try { await bridge.close(); } catch { /* noop */ } process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
