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
        '在浏览器 Studio 里打开一个契约 HTML deck，并把它和这个会话连起来。' +
        '传入 deck 的文件路径；会自动在默认浏览器打开 Studio（已连接模式）。' +
        '之后用户就能在 Studio 里就地编辑，并把"复杂改动"提交给你。',
      inputSchema: {
        deckPath: z.string().describe('契约 HTML deck 的路径（.html）。相对路径按 cwd 解析。'),
        openBrowser: z.boolean().optional().describe('是否自动打开浏览器（默认 true）'),
      },
    },
    async ({ deckPath, openBrowser }) => {
      try {
        const abs = resolve(process.cwd(), deckPath);
        const r = bridge.open(abs, openBrowser !== false);
        // give the browser a moment to connect, but don't hang if the user
        // hasn't opened it yet — report status either way.
        await bridge.waitForStudio(8000).catch(() => undefined);
        return text({ ok: true, opened: r.name, bytes: r.bytes, url: r.url, status: bridge.status(),
          hint: '已在 Studio 打开。用户提交修改意见后，调用 slidesmith_get_requests 读取；改好后用 slidesmith_apply_patch 回写。' });
      } catch (e) {
        return text({ ok: false, error: (e as Error).message });
      }
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
        'Studio 按 data-id 精准替换对应页，其它页不动。若当前没有 Studio 连接，会缓存，等下次连接自动应用。',
      inputSchema: {
        sections: z.string().describe('一个或多个 <section ... data-id="…"> 整页 HTML（可含 ```html 围栏）。务必保留原 data-id。'),
      },
    },
    async ({ sections }) => {
      const r = bridge.applyPatch(sections);
      return text({ ok: true, deliveredTo: r.clients, queuedForLater: r.queued, status: bridge.status() });
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
  log('MCP server ready on stdio. Tools: slidesmith_open, slidesmith_get_requests, slidesmith_apply_patch, slidesmith_status');

  const shutdown = async () => { try { await bridge.close(); } catch { /* noop */ } process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
