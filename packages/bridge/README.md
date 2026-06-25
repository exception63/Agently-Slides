# @slidesmith/bridge

The local middleman that lets the **browser Studio** and **desktop Claude Code** reach
each other.

```
  Studio  ──WebSocket──▶  Bridge  ◀──MCP──  Claude Code
```

The Studio is sandboxed in a browser tab; Claude Code lives on the desktop. Neither can
call the other directly. The bridge is the one process both can reach: the Studio
connects over a same-origin WebSocket, Claude Code drives it over MCP. User edit-requests
flow **up** (Studio→bridge→Claude); AI patches flow **down** (Claude→bridge→Studio). All
state lives in memory.

## Run it

- For Claude Code (MCP, stdio):  `slidesmith mcp`
- For a human, standalone:       `slidesmith serve [deck.html]`  (opens the Studio in the browser)

`serve`/`mcp` serve the built Studio at `http://localhost:8765/`. Open the Studio from
that URL → it auto-connects and shows **● 已连接 Claude**. Open it from `file://` instead
and it falls back to fully-manual mode (download request files, load patch files by hand).

## MCP tools

| tool | what it does |
| --- | --- |
| `slidesmith_open({ deckPath })` | load a contract HTML deck, open the Studio (connected) |
| `slidesmith_get_requests()` | return the edit-requests the user submitted (drains the queue) |
| `slidesmith_apply_patch({ sections })` | push rewritten `<section data-id>`(s) back, applied by id |
| `slidesmith_status()` | connection / deck / pending-request status |

## Programmatic API

`startBridge(opts) => BridgeHandle` — `open()` / `openHtml()` / `getRequests()` /
`applyPatch()` / `status()` / `waitForStudio()` / `close()`, plus a `'request'` event.
Used by the MCP layer and by `scripts/verify-bridge.mjs`.

## WebSocket protocol (JSON)

- bridge → Studio: `{type:'hello',hasDeck}` · `{type:'import',name,html}` · `{type:'patch',text}`
- Studio → bridge: `{type:'requests',request:{name,content,count}}` · `{type:'exported',name,html}`

The Studio side lives in `packages/studio/src/main.ts` (`connectBridge`, `submitRequests`,
hooks `window.__SM_BRIDGE__` / `__SM_SEND_ALL__`). Verify the whole loop headless with
`npx tsx scripts/verify-bridge.mjs`.
