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
        '在 Studio 里打开一个契约 HTML deck，并把本会话握手为桥的 owner（Studio 顶栏显示「已连接会话 X」）。' +
        '之后进入协作环：等用户从 Studio 提交修改（首选后台 `curl /api/wait` 自循环，或 slidesmith_wait），改好用 slidesmith_apply_patch 回写。细节见 AGENTS.md §4b。',
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
        '不打开新 deck，只把本会话握手为正在运行的桥的 owner —— 用户已经开着 Studio 时用，握手后直接进协作环。',
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
        '长轮询：阻塞到用户从 Studio 提交修改请求就返回（已取走），或到 timeout 返回 timedOut。' +
        '注意它会占住这一轮对话；长时间守候请改用后台 `curl "<url>api/wait?timeout=280000"`（见 AGENTS.md §4b）。',
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
        '立即取走队列里的请求，不阻塞。一次性检查用它，循环用 wait。返回的请求都是用户主动提交的：照做，别判 stale 拒绝。',
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
        '当前 deck 的页目录（序号 · data-id · 标题 · 变体 · 字节）。**改任何页之前先调它拿 data-id**（磁盘上的文件通常没有 id，是 Studio 导入时生成的）；withHtml 点名的页会连整段 <section> 一起给。',
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
    'slidesmith_cues',
    {
      title: '读 / 写手表提词（watch mode 的 __SM_CUES__）',
      description:
        'Apple Watch 提词表（window.__SM_CUES__）的读 / 写；enableWatchMode 给没有提词表的 deck 装上。它在 #deck 之外，apply_patch 够不着。' +
        '每条 ≤10 个汉字、是内容锚点不是结构标签；全部约束见 AGENTS.md §4d。',
      inputSchema: {
        set: z.record(z.array(z.string())).optional()
          .describe('要写入的提词表：{ "锚点": ["短语", …] }，如 {"s1-boom":["无缝嵌入"]}。不传 = 只读。'),
        replace: z.boolean().optional()
          .describe('true = 连已有提词的页也覆盖。默认 false（只填空页，重跑安全）。'),
        enableWatchMode: z.string().optional()
          .describe('没开 watch mode 时用它开：把 plugin/slidesmith/skills/slides-presenter-mode/templates/'
            + 'watch-cues.js.template 读出来、把 {{CHANNEL}} 全部换成本工具报回的 channel，整段填在这里。'
            + '模板只有 skill 那一份，别自己另写一份提词表代码。'),
        replaceExisting: z.boolean().optional()
          .describe('已经开着 watch mode 时，用它把旧的注入块换成新版（提词表原样保留）。'
            + '老版 deck 的毛病：提词窗永远显示「这一页没有提词」（它监听 {{CHANNEL}}-presenter-sync，'
            + '而 editorial-slides 的引擎广播在不带后缀的频道上）、弹窗每翻页就被压到下层、按钮不跟皮肤。'),
      },
    },
    async ({ set, replace, enableWatchMode, replaceExisting }) => {
      const r = enableWatchMode ? await bridge.enableWatch(enableWatchMode, { replace: !!replaceExisting })
        : set ? await bridge.setCues(set, { replace: !!replace })
          : await bridge.cues();
      if (!r) {
        return text({ ok: false,
          hint: 'Studio 没连上（或没回话）。提词的读写都要现场问 Studio 要——它手里那份才是浏览器求值过的真相。' });
      }
      if (!r.watchMode) {
        return text({ ok: false, watchMode: false, error: r.error, channel: r.channel,
          hint: '这份 deck 没开 watch mode，里面没有 window.__SM_CUES__ 可写。**先把它开了再回来**：'
            + '读 plugin/slidesmith/skills/slides-presenter-mode/templates/watch-cues.js.template，'
            + '把里面的 {{CHANNEL}} 全部换成上面报的 channel'
            + (r.channel ? `（本 deck = ${r.channel}）` : '（本 deck 没认出频道名，去问用户）')
            + '，然后再调一次本工具、把整段代码放在 enableWatchMode 里。开好之后照常拟提词。' });
      }
      const missing = r.pages.filter((p) => !p.cues.length).map((p) => `${p.index} [${p.anchor}]`);
      const bad = r.pages.filter((p) => p.cues.length && p.issues.length)
        .map((p) => `${p.index} [${p.anchor}] ${p.issues.join(' · ')}`);
      return text({
        ok: true, watchMode: true, channel: r.channel, watchOutdated: r.watchOutdated || undefined,
        enabledWatchMode: enableWatchMode ? !!r.enabled : undefined,
        note: enableWatchMode && !r.enabled ? r.error : undefined,
        wrote: set ? (r.applied || 0) : undefined,
        keptExisting: r.keptExisting, unknownAnchors: r.unknownAnchors,
        total: r.pages.length, withCues: r.pages.length - missing.length,
        missing, violations: bad,
        // 读的时候才给整份表（拟提词要看标题和锚点）；写完只报账，不再倒一遍
        pages: set ? undefined : r.pages,
        hint: (r.watchOutdated && !enableWatchMode)
          ? '⚠ 这份 deck 烘的是**旧版**提词注入代码：它监听 {{CHANNEL}}-presenter-sync，而多数引擎'
            + '广播在不带后缀的频道上 → deck 里点 ✦提词 永远显示「这一页没有提词」（表其实是满的）；'
            + '而且是弹窗，一翻页就被压到下层。用 enableWatchMode + replaceExisting=true 换成新版，提词表会原样保留。'
          : enableWatchMode
          ? (r.enabled ? (r.upgraded ? '注入代码已换成新版，提词表原样保留。让用户点一下 ✦提词 看看。'
            : 'watch mode 已烘进 deck，提词表现在是空的——接着逐页拟提词、用 set 写回。')
            : '没有重复烘（见 note）。watch mode 本来就开着，直接拟提词即可。')
          : (missing.length || bad.length)
            ? '还有页没过关（见 missing / violations），补齐再交差。'
            : '每页都有提词且全部合规。',
      });
    },
  );

  server.registerTool(
    'slidesmith_notes',
    {
      title: '读 / 写 deck 内嵌的讲稿（按锚点分块）',
      description:
        '一体版 deck 内嵌讲稿（window.__TXB64__）按锚点读 / 写。不带 set＝读目录（点名 anchors 才给整块）；带 set＝写回。它在 #deck 之外，apply_patch 够不着。' +
        '写回约束（<h3 id=锚点> 原样、cue/golden/data 块保留、<strong> 别整段加、只动被批注的块）见 AGENTS.md §4d —— Studio 会验，破了整块拒收。',
      inputSchema: {
        anchors: z.array(z.string()).optional()
          .describe('要连整块 HTML 一起拿的锚点（或 1 开始的页号）。不传只要目录。'),
        set: z.record(z.string()).optional()
          .describe('要写回的块：{ "锚点": "<h3 class=\'sub\' id=\'锚点\'>…</h3><p>…</p>" }。整块替换，务必带上锚点标题本身。'),
      },
    },
    async ({ anchors, set }) => {
      const r = set ? await bridge.setNotes(set) : await bridge.notes(anchors || []);
      if (!r) {
        return text({ ok: false,
          hint: 'Studio 没连上（或没回话）。讲稿的读写都要现场问 Studio 要——它手里那份才是解过码的真相。' });
      }
      if (!r.hasNotes) {
        return text({ ok: false, hasNotes: false, error: r.error,
          hint: '这份 deck 里没有内嵌讲稿（window.__TXB64__）。一体版（slides-presenter-mode 缝出来的单文件）才有；'
            + '三文件联动版的讲稿在隔壁文件里，Studio 读不到。' });
      }
      const pending = r.pages.filter((p) => p.annotations.length)
        .map((p) => ({ page: p.index, anchor: p.anchor, annotations: p.annotations }));
      return text({
        ok: true, hasNotes: true,
        wrote: set ? (r.applied || 0) : undefined,
        appliedAnchors: r.appliedAnchors,
        rejected: r.rejected && r.rejected.length ? r.rejected : undefined,
        total: r.pages.length,
        pendingAnnotations: pending.length ? pending : undefined,
        pages: set ? undefined : r.pages,
        hint: (r.rejected && r.rejected.length)
          ? '有块被拒收（见 rejected）——按原因改好再写一次，别绕过它。'
          : (set ? '已写回。用户可以在 Studio 讲稿视图里看，并且随时「撤销 Claude 的改写」。' : undefined),
      });
    },
  );

  server.registerTool(
    'slidesmith_apply_patch',
    {
      title: '把改好的页回写到 Studio',
      description:
        '把改好的 <section class="slide" data-id=…> 推回 Studio，按 data-id 当场替换，其它页不动；没连上会缓存到下次连接。' +
        'preview=true 作为「提议」呈现（请求带 confirm 时必用）。**summary 一句话说明改了什么**，Studio 会显示给用户。',
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
      description:
        '桥的状态：Studio 是否连上、当前 deck、待处理请求数、owner 是谁。',
      inputSchema: {},
    },
    async () => text({ ...(await bridge.status()), bridgeOwnedByThisSession: bridge.local }),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP server ready on stdio. Tools: slidesmith_open, slidesmith_connect, slidesmith_wait, slidesmith_get_requests, slidesmith_outline, slidesmith_cues, slidesmith_notes, slidesmith_apply_patch, slidesmith_status');

  // 客户端模式下 `close()` 是空操作——**桥不是我们起的，就不能由我们关**（app 还在用）。
  const shutdown = async () => { try { await bridge.close(); } catch { /* noop */ } process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
