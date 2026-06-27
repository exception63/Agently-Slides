# AGENTS.md — Slidesmith agent interface (HTML-first + bridge/MCP)

> Machine-facing contract for AI agents (Claude Code etc.). Read THIS file instead
> of scanning the repo.

## 1. What this project is

Slidesmith is a **highly AI-integrated HTML slides editor**. The *artifact* is a
single-file **contract HTML deck**. Division of labor: the human does high-frequency
fine edits themselves in the browser Studio (text, color, size, animation, move/delete
element — instant, zero tokens); you handle the complex/fuzzy asks, which the human
delegates as **per-slide comments** (and an optional deck-level ask). The loop:

```
you generate / open a contract HTML deck  →  human edits visually + leaves COMMENTS on
slides  →  human hits 🚀 发送给 Claude  →  you read the comments, rewrite ONLY the named
slides by data-id, write them back  →  pages flip to ✓ 已改 (human can ↩︎ 还原)
```

Your jobs as an agent:
- **(A) Generate** a contract HTML deck the human can open in Studio (§2–§3).
- **(B) Collaborate live via the bridge/MCP** — open a deck, read the human's comments,
  apply patches by `data-id` (§4b — the primary path; this is what the plugin enables).
- **(B-offline) Apply** a request file the human exported manually when not connected (§4).

**The connected path (start here when the `slidesmith` MCP tools are available):**
`slidesmith_open(deckPath)` opens the Studio in the human's browser (connected) **and
handshakes this session** (Studio shows 会话 X · 端口 Y) → `slidesmith_wait()` blocks until
they submit → rewrite the slides → `slidesmith_apply_patch({sections, preview?})` lands them
instantly → back to `slidesmith_wait()`. `slidesmith_status()` shows owner / deck / pending.
The handshake auto-loop means you never manually poll — `wait` wakes you. Details in §4b.

The canonical truth is the **HTML deck itself** (not a JSON IR). An older IR + CLI
pipeline still exists as an optional, guard-railed path — see §6.

## 2. Generate a contract HTML deck — the essentials

Produce ONE self-contained `.html` file that follows **[docs/DECK-CONTRACT.md](docs/DECK-CONTRACT.md)**
(read it for the full spec + a golden sample). The hard requirements:

1. **Single file, offline, fixed 1920×1080 canvas**, scaled by `--fit-scale`.
2. **All design tokens in `:root`** — colors (`--paper --ink --ink-2 --accent --accent-2`),
   type scale (`--t-display --t-h1 --t-h2 --t-body …`), spacing (`--pad-x --pad-y`),
   font stacks (with system fallback). Re-skin = swap `:root` or `:root[data-theme="x"]`.
3. **Each page** = `<section class="slide [variant]" data-id="sN" data-seg="0"
   data-segname="段 0 · 引入" data-title="本页标题">…</section>`, all inside
   `<div class="deck" id="deck">`. Variant classes are free (`cover`/`insight`/…).
   - `data-id` is the **stable addressing key** — unique per slide. Submit-to-AI patches
     land by it; always include it.
   - `data-title`/`data-seg`/`data-segname` drive the deck's segment nav + thumbnails.
4. **Typography via utility classes** (`.eyebrow .title .lead .body …`) that read the
   tokens. **Never inline hex/px** — it breaks re-skin and the inspector.
5. **Declarative animation** only: `data-anim="fade|rise|stagger-list|…"`,
   `data-motion="glow|float|…"`.
6. Leave `<!-- @slidesmith:engine -->` before `</body>` (engine injection point), or
   ship a self-contained engine (like the golden sample) — either imports cleanly.

Conformance levels: **L1** (`#deck` + `.slide` + `data-title`) → importable;
**L2** (+ 1920×1080 + `:root` tokens + utility classes) → re-skin & inspector;
**L3** (+ stable `data-id` + notes) → full Submit-to-AI / delivery. **Aim for L3.**

## 3. Make it actually look right

Valid structure ≠ good-looking. Before handing a deck over, check the *rendered*
result for content clipped by the 1920×1080 frame, unreadable contrast, and broken
images. Two ways:
- The human can one-click **「视觉自检」** in Studio (same checks, in-browser).
- If you have the repo + Node, run the CLI `doctor` (§6) on a deck — it renders
  headless and reports `visual.*` findings per slide, with thumbnails.

`visual.*` finding codes (shared by Studio audit and CLI): `overflow-y`/`-x`
(content taller/wider than the frame → trim / split / smaller size), `offcanvas`
(a block spills off — by `data-id`), `contrast` (<4.5, or <3 for large text → change
color token / move to higher-contrast surface), `image-broken` (fix `src` or inline
as `data:` URI), `sparse` (dense layout <12% filled).

## 4. Apply a single-slide change request (Submit-to-AI)

When the human exports a request from Studio you receive a self-contained Markdown
file `<deck>.<slideId>.ai-request.md` containing: the deck name, the **target slide's
`data-id` + title**, the human's **修改要求 (instruction)**, that slide's **current
full HTML**, and the **design tokens**. It is self-contained — act on it even with no
prior context.

Do this:
1. Read the instruction, the current slide HTML, and the tokens.
2. Rewrite **only that one slide**, per the contract (colors/sizes via tokens — no
   inline hex/px; keep it a single `<section class="slide …">`).
3. **Produce a Slidesmith-importable patch file** named `<deck>.patch.html` whose content
   is **only** the rewritten `<section>`(s) — one per changed slide, each **keeping its
   original `data-id`**. No `<html>`/`<head>`, no whole deck, no prose:
   ```html
   <section class="slide …" data-id="s5">…</section>
   <section class="slide …" data-id="s8">…</section>
   ```
   The request file (`*.ai-request.md` / `*.all-requests.md`) the human hands you already
   states this. The human loads your `<deck>.patch.html` via Studio 「② 从文件应用」 (or
   pastes it), which replaces those slides **by `data-id`** and leaves every other slide
   byte-for-byte untouched. A batch request lists several pages → return all their
   `<section>`s in the one patch file.

Why this is conflict-safe: the request carries the human's *latest* version of that
slide (Studio harvests edits before exporting); on apply, Studio re-harvests every
*other* slide first, then swaps only the target. The one caveat: if the human keeps
hand-editing the SAME slide after sending it out, your patch (based on the older
snapshot) will overwrite those newer hand-edits on that slide — so they should not
hand-edit a slide that's currently out for revision.

## 4b. The bridge: connected mode (no manual file-shuffling)

Section 4 is the **offline** path: the human downloads a request file and hands it to
you, you write a patch file, they load it. The **bridge** automates that round-trip so
you and the Studio talk directly — the human never moves a file.

How it works: a small local process (`slidesmith serve` or, for you, `slidesmith mcp`)
serves the Studio over `http://localhost:<port>` and holds the deck + a request queue in
memory. The Studio, when opened from that URL (not `file://`), connects back over a
same-origin **WebSocket**. You reach the same process over **MCP**. Edit-requests flow up
(Studio→bridge→you), patches flow down (you→bridge→Studio, applied on the spot by
`data-id`). If the Studio is opened from `file://` instead, there's no connection and it
silently falls back to the manual path above — nothing breaks.

**Handshake + auto-loop (the primary model).** `slidesmith_open` (or `slidesmith_connect`)
**handshakes** the bridge: it binds *this session* as the bridge's `owner`, and the Studio's
top bar shows **● 已连接 Claude · 会话 X · 端口 Y** — so there's never ambiguity about which
session a request lands in. After the handshake you don't poll-and-guess; you **block on
`slidesmith_wait`** (a long-poll). It returns the instant the user submits, or `timedOut`
when idle — then you change the slides and loop back to `slidesmith_wait`. Zero manual pull.

MCP tools (server name `slidesmith-bridge`):
- `slidesmith_open({ deckPath, label? })` — load a contract HTML deck, open the Studio in the
  user's browser (connected), **and handshake** this session as owner. Call this first.
- `slidesmith_connect({ label? })` — handshake without opening (Studio-first cold start: the
  user already has a Studio running; bind this session to it, then go straight to `wait`).
- `slidesmith_wait({ timeout? })` — **long-poll**: block until the user submits an
  edit-request, then return it (drained); or return `timedOut` after `timeout` ms (default
  25000, cap 290000). This is the loop's heartbeat — call it, await, handle, call it again.
- `slidesmith_get_requests()` — non-blocking drain (peek the queue right now). `wait` is
  preferred for the loop; `get_requests` is for a one-shot check. Each request's `content`
  is exactly the `*.all-requests.md` prompt from §4 (instruction + that slide's current HTML
  + tokens + output spec). A request carries `confirm: true` when the user turned on
  **改前先问我**.
- `slidesmith_apply_patch({ sections, preview? })` — push your rewritten `<section data-id>`(s)
  back; the Studio replaces those slides by `data-id` immediately. `preview: true` lands the
  change as a **proposal** (Studio shows a 保留/还原 bar) — use it whenever the request had
  `confirm: true`. Same patch format as §4.
- `slidesmith_status()` — is a Studio connected, the `owner`, which deck, how many pending.

The connected loop: `slidesmith_open` (handshake) → `slidesmith_wait` (blocks) → user edits
visually and hits **发送给 Claude** → `wait` returns the request → rewrite the listed slides
per the contract → `slidesmith_apply_patch` (`preview: true` if `confirm`) → back to
`slidesmith_wait`. The patch format and conflict-safety rules from §4 apply unchanged.
Driving it without MCP: `slidesmith serve <deck.html>` for the bridge, then a background
`curl -s "<url>api/wait?timeout=280000"` is the same long-poll (it exits the moment a
request arrives), `curl -XPOST "<url>api/handshake?label=…"` handshakes, and
`POST /api/patch` (`?preview=1` for a proposal) writes back.

**What a request now contains** (the comment model — like Claude Design comments, but on
real HTML): the human leaves a **comment per slide** ("把这页改成两栏…") and/or one
**deck-level ask** ("对整份 deck 说…"). A submitted request bundles: every pending page's
comment + that page's current HTML, and — if there's a deck-level ask — that ask plus a
**structure overview** (page № · `data-id` · title for ALL slides) so you can pick which
pages to touch. Honor the division of labor: the human does the high-frequency fine edits
themselves (text, color, size, animation, move/delete element) — you handle the
complex/fuzzy asks. Only touch the pages a comment names, or (for a deck-level ask) the
pages it clearly implies. Every page you patch flips to **✓ 已改** in the Studio and the
human can **还原本页** (revert) if they dislike it — so make the change worth keeping, and
don't re-touch a page they reverted unless they ask again.

## 5. Hand-off to the human

Best path: call `slidesmith_open(deckPath)` — the Studio opens in their browser already
connected. Tell them to edit visually (click text, right panel for colors / fonts /
animations / move·delete element, 「视觉自检」, 「导出 HTML / 导出 PDF」), and for
complex changes to **leave a comment on the slide and hit 发送给 Claude** — you'll
pick it up via `slidesmith_wait` (or `slidesmith_get_requests`).

If you can't open it for them (no MCP), they can double-click `studio/slidesmith-studio.html`
(offline) and drag the deck in; to connect to you, they click the top-bar **连接 Claude Code**
button (auto-detects the bridge and jumps to the connected Studio), or you run
`slidesmith serve <deck>`.

---

## 6. Optional: the IR + CLI pipeline

A structured **JSON IR** + CLI is also available — use it when you want strict
guard-rails, programmatic validation, or headless PDF/PNG. The contract HTML deck +
bridge (above) is the primary path; this is a secondary, more constrained one.

```
INPUT   <name>.deck.json (IR) | <name>.deck.md | -  (stdin JSON)
TOOL    npm run sm -- <command> ...     (repo root; `npm install` once)
OUTPUT  <name>.html  <name>.transcript.html  <name>.presenter.html  | <name>.pdf | <name>-NN.png
```

| Command | Purpose |
|---|---|
| `npm run sm -- new <name>` | scaffold a starter `<name>.deck.md` |
| `npm run sm -- build <file> -o <dir> [--theme <t>] [--deck-only]` | build deck (+transcript+presenter) |
| `npm run sm -- validate <file>` | Zod-validate the IR + lint; exit 1 on errors |
| `npm run sm -- lint <file> [--strict]` | IR-level lint (overflow heuristics/empty/alt/notes/dupes) |
| `npm run sm -- audit <file> [--thumbs] [--json] [-o <dir>]` | render headless + check *rendered* layout |
| `npm run sm -- doctor <file> [-o <dir>] [--no-thumbs]` | one-shot gate: validate + lint + visual audit (+thumbnails) |
| `npm run sm -- export <file> -o <dir> -f pdf\|png [--theme <t>]` | headless PDF/PNG export |
| `npm run sm -- edit <file> [-p <port>]` | local server GUI editor |

IR shape: deck `{ ir_version:"1.0", theme?, defaults?, metadata?, slides:[…] }`;
slide `{ id (unique), layout?, seg?, segName?, notes?, noteBlocks?, slots:{…} }`;
block `{ id (unique), type, …, style?(symbolic tokens), build?(anim) }`. Closed block
vocab: `heading text list image code quote table chart embed group`. Layouts: `cover
section statement bullets data-stat quote end` (slots `["main"]`) and `two-col`
(`["left","right"]`). Full JSON Schema:
`npx tsx -e "import {deckJsonSchema} from '@slidesmith/ir'; console.log(JSON.stringify(deckJsonSchema()))"`.

Package map: `packages/ir` (schema/validate) · `parser-md` (MD→IR) · `engine`
(`renderDeckHtml`/`renderTranscriptHtml`/`renderPresenterHtml`/`irToMarkdown`) ·
`themes` · `runtime` · `qa` (`lintDeck`) · `cli` · `editor` (server GUI) · `studio`
(browser GUI). An IR deck built to HTML is itself a contract deck, so the two paths
meet at the same Studio.
