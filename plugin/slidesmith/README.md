# Slidesmith — Claude Code plugin

Edit polished HTML slides **in the browser Studio** while Claude Code reaches in over a
local bridge: you make the easy edits visually, push the hard ones to Claude with one
click, and watch them land on the slide.

## What it adds

- **MCP server `slidesmith`** (stdio) — runs the local bridge (HTTP + WebSocket) and
  exposes four tools to Claude Code:
  - `slidesmith_open({ deckPath })` — load a contract HTML deck, open the Studio in your
    browser (connected mode).
  - `slidesmith_get_requests()` — the edit-requests you submitted from Studio.
  - `slidesmith_apply_patch({ sections })` — Claude's rewritten `<section data-id>`(s),
    applied to the right slides instantly.
  - `slidesmith_status()` — connection / deck / pending-request status.
- **`/slidesmith [deck.html]`** — a command that kicks off the whole open → edit → submit
  → apply loop.

## How it's wired

The MCP server is just `slidesmith mcp` from this repo, launched via the repo's own
`node` + `tsx` with absolute paths (see `.claude-plugin/plugin.json`). All state lives in
memory in that process; the Studio (served at `http://localhost:8765/`) connects back over
a same-origin WebSocket. Open the Studio from `file://` instead and it falls back to fully
manual mode — nothing breaks.

## Install (already deployed on this machine)

```bash
claude plugin marketplace add "<repo>/plugin" --scope user
claude plugin install slidesmith@slidesmith-local --scope user
# restart Claude Code so the MCP server connects, then:  /slidesmith path/to/deck.html
```

Source lives in `packages/bridge` (bridge + MCP) and `packages/studio` (connected mode).
Headless proof of the whole loop: `npx tsx scripts/verify-bridge.mjs`.
