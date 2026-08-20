// 桥接的「客户端模式」——**这个进程不再是桥接，只是它的一个客户端。**
//
// ## 为什么需要它
//
// 原来的形状是：Claude Code 起 MCP 进程 → MCP 进程**就是**桥接（它自己 listen
// 8765）→ 浏览器 Studio 连上来。桥接的命都拴在那个 Claude 会话身上。
//
// Slidesmith Studio.app 把这件事**倒过来**了：app 自己拉起并长期持有 node 桥
// （`slidesmith serve --no-open`），WebView 连的是它；然后 app 通过 Claude 桥拉起
// 一个常驻 `claude`，那个 claude 又会带起自己的 MCP 进程。
//
// 于是同一台机器上出现两个想 listen 8765 的进程。`startBridge` 撞到 EADDRINUSE
// 会**静默退到随机端口**（bridge.ts 里那行 `httpServer.listen(0, host)`）——
// 不报错、不提示，只是 `slidesmith_apply_patch` 从此推进一个没有任何 Studio 连着的
// 空桥里。**用户看到的是「AI 说改好了，但屏幕上什么都没变」**，而且查不出原因。
//
// 所以：**先探一下默认端口。有活着的桥就当客户端接上去，没有才自己起一个。**
// 老路（终端里 `/slidesmith`，没有 app）走的仍然是"自己起"那一支，一点不受影响。
//
// ## 为什么是 facade 而不是"实现 BridgeHandle"
//
// `BridgeHandle.status()` 是同步的（内存里的对象，本来就该同步）。隔着 HTTP 拿不到
// 同步的状态，硬凑只能靠缓存——而缓存的状态在"Studio 刚连上/刚断开"那一刻正好是错的，
// 那恰恰是唯一有人看它的时刻。所以给 MCP 层一个**全异步的窄口子**，本地和远端各实现
// 一份，两边都不用将就。
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type { BridgeHandle, BridgeOwner, BridgeRequest, BridgeStatus, CueReport } from './bridge.js';
import type { OutlineEntry } from './outline.js';

/** MCP 层真正用到的那几件事。本地/远端两种实现，全异步。 */
export interface BridgeFacade {
  /** 桥接的地址（给用户看的提示里要报） */
  url: string;
  /** true = 这个进程自己就是桥接；false = 接在别人（app）的桥上 */
  local: boolean;
  open(deckPath: string, openBrowser: boolean): Promise<{ url: string; name: string; bytes: number }>;
  handshake(label: string): Promise<BridgeOwner>;
  waitForStudio(timeoutMs: number): Promise<void>;
  waitForRequests(timeoutMs: number): Promise<BridgeRequest[]>;
  getRequests(drain: boolean): Promise<BridgeRequest[]>;
  applyPatch(sections: string, opts: { preview: boolean }): Promise<{ clients: number; queued: boolean }>;
  outline(withHtml: string[]): Promise<OutlineEntry[]>;
  /** 手表提词表的读 / 写。null = Studio 没连上或没回话 */
  cues(): Promise<CueReport | null>;
  setCues(cues: Record<string, string[]>, opts: { replace: boolean }): Promise<CueReport | null>;
  status(): Promise<BridgeStatus>;
  close(): Promise<void>;
}

/** 本地桥的适配层：把同步接口包成异步，别的什么都不做。 */
export function localFacade(bridge: BridgeHandle): BridgeFacade {
  return {
    url: bridge.url,
    local: true,
    async open(deckPath, openBrowser) { return bridge.open(deckPath, openBrowser); },
    async handshake(label) { return bridge.handshake(label); },
    waitForStudio: (ms) => bridge.waitForStudio(ms),
    waitForRequests: (ms) => bridge.waitForRequests(ms),
    async getRequests(drain) { return bridge.getRequests(drain); },
    async applyPatch(sections, opts) { return bridge.applyPatch(sections, opts); },
    async outline(withHtml) { await bridge.syncFromStudio(); return bridge.outline(withHtml); },
    cues: () => bridge.cues(),
    setCues: (cues, opts) => bridge.setCues(cues, opts),
    async status() { return bridge.status(); },
    close: () => bridge.close(),
  };
}

async function jsonFetch(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<Record<string, unknown>> {
  const { timeoutMs = 10000, ...rest } = init || {};
  // 每个请求都要能自己超时。长轮询那条走的是自己的 timeoutMs，别用同一个默认值把它掐了。
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ctl.signal });
    return (await res.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(t);
  }
}

/**
 * 探一下 `base` 上有没有活着的 Slidesmith 桥。有就返回一个接上去的 facade，没有返回
 * null（调用方照旧自己起一个）。
 *
 * 判据是 `/api/status` 能回出带 `port` 的 JSON——不能只看"端口连得上"：8765 上
 * 蹲着的完全可能是别的服务，那种情况下当客户端接上去会一路诡异地失败。
 */
export async function probeRemote(base: string, timeoutMs = 1200): Promise<BridgeFacade | null> {
  const root = base.replace(/\/+$/, '');
  let status: BridgeStatus;
  try {
    const raw = await jsonFetch(`${root}/api/status`, { timeoutMs });
    if (typeof raw?.['port'] !== 'number' || typeof raw?.['url'] !== 'string') return null;
    status = raw as unknown as BridgeStatus;
  } catch {
    return null;
  }

  // 具名再 return：`this` 在 async 函数直接返回的对象字面量里推不出来（TS 会把它
  // 当成 `BridgeFacade | PromiseLike<…>`），显式标注类型就干净了。
  const facade: BridgeFacade = {
    url: status.url || `${root}/`,
    local: false,

    async open(deckPath, _openBrowser) {
      // **由我们读盘、把 HTML 发过去**，而不是让桥自己去读那个路径：桥可能是别的
      // 用户/别的沙盒起的，它够不够得着这个文件不该由我们假设。`path` 只用来告诉它
      // 「这份 deck 在磁盘上的家在哪」，导出 PDF/HTML 时才落在 deck 旁边。
      const abs = resolve(deckPath);
      const html = readFileSync(abs, 'utf8');
      const name = basename(abs);
      await jsonFetch(
        `${root}/api/open?name=${encodeURIComponent(name)}&path=${encodeURIComponent(abs)}`,
        { method: 'POST', headers: { 'content-type': 'text/html; charset=utf-8' }, body: html, timeoutMs: 30000 },
      );
      return { url: facade.url, name, bytes: Buffer.byteLength(html) };
    },

    async handshake(label) {
      const r = await jsonFetch(`${root}/api/handshake?label=${encodeURIComponent(label)}`, { method: 'POST' });
      return (r['owner'] || { label, since: Date.now() }) as unknown as BridgeOwner;
    },

    async waitForStudio(timeoutMs) {
      // 远端没有"连上就叫我"的推送口子，只能轮询。间隔 200ms、上限就是调用方给的
      // 那个超时——这条路上等的是浏览器起没起来，秒级精度足够。
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const s = await facade.status().catch(() => null);
        if (s && s.connected > 0) return;
        if (Date.now() >= deadline) throw new Error('Studio 没有在超时内连上');
        await new Promise((r) => setTimeout(r, 200));
      }
    },

    async waitForRequests(timeoutMs) {
      // 长轮询：HTTP 请求本身要比桥那边的等待时间宽限一点，否则每次都是我们先
      // 超时断开，桥那边的 waiter 白等一轮——表现是"用户点了发送，AI 没反应"。
      const r = await jsonFetch(`${root}/api/wait?timeout=${timeoutMs}`, { timeoutMs: timeoutMs + 5000 })
        .catch(() => ({ requests: [] }));
      return (r['requests'] || []) as BridgeRequest[];
    },

    async getRequests(drain) {
      const r = await jsonFetch(`${root}/api/requests?drain=${drain ? 1 : 0}`);
      return (r['requests'] || []) as BridgeRequest[];
    },

    async applyPatch(sections, opts) {
      const r = await jsonFetch(`${root}/api/patch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sections, preview: opts.preview }),
        timeoutMs: 30000,
      });
      return { clients: Number(r['clients'] || 0), queued: !!r['queued'] };
    },

    async outline(withHtml) {
      const query = withHtml.length ? `?html=${encodeURIComponent(withHtml.join(','))}` : '';
      const r = await jsonFetch(`${root}/api/outline${query}`, { timeoutMs: 20000 });
      return (r['pages'] || []) as OutlineEntry[];
    },

    async cues() {
      const r = await jsonFetch(`${root}/api/cues`, { timeoutMs: 15000 }).catch(() => null);
      return (r && r['ok']) ? (r as unknown as CueReport) : null;
    },

    async setCues(cues, opts) {
      const r = await jsonFetch(`${root}/api/cues`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cues, replace: opts.replace }),
        timeoutMs: 20000,
      }).catch(() => null);
      return (r && r['ok']) ? (r as unknown as CueReport) : null;
    },

    async status() {
      return (await jsonFetch(`${root}/api/status`)) as unknown as BridgeStatus;
    },

    async close() {
      // **桥不是我们起的，就不能由我们关。** app 还在用它。
    },
  };
  return facade;
}
