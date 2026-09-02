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
session a request lands in. After the handshake you don't poll-and-guess — you wait to be woken:

- **Preferred — a background long-poll that wakes you.** Run
  `curl -s "<url>api/wait?timeout=280000"` with `run_in_background` (never `nohup`; the harness
  must own the process). It hangs while the user works and **exits the instant they hit
  发送给 Claude**, which wakes you with the request. Idle time costs nothing and the conversation
  stays free — the user can keep talking to you while the loop waits. Re-arm it after every round;
  a new session has to arm it again.
- **`slidesmith_wait`** is the same long-poll as an MCP call. It is fine for a one-shot or a short
  wait, but it **occupies the turn** while it blocks (default 25 s, cap 290 s) — the user cannot
  talk to you until it returns. Do not build the standing loop on it.

Either way: handle the request, `slidesmith_apply_patch` it back, re-arm, repeat. Zero manual pull.
(This paragraph is the single source of truth for the loop; older notes that said "block on
`slidesmith_wait`" are superseded.)

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
- `slidesmith_outline({ withHtml? })` — the loaded deck's pages (index · `data-id` · title ·
  variant · bytes). **Call it before touching any page**: `data-id` is generated by the Studio
  on import, so the file on disk usually has none — read the file and you have no legal id to
  patch with. Name pages in `withHtml` to get their whole `<section>` back.
- `slidesmith_cues({ set?, replace?, enableWatchMode? })` — the Apple Watch cue table
  (`window.__SM_CUES__`). A deck without watch mode has no table to write to; the read reports
  the deck's `channel`, and `enableWatchMode` takes the skill's `watch-cues.js.template` with
  `{{CHANNEL}}` filled in and bakes it into the deck. The template stays in the skill — neither
  the Studio nor the bridge keeps a copy to drift from.
- `slidesmith_notes({ anchors?, set? })` — the deck's embedded transcript (`window.__TXB64__`),
  block by anchor.
  Both live **outside `#deck`**, so `apply_patch` cannot reach them — that is why they have
  their own tools. Their hard constraints (cue length/count; transcript anchor + block
  structure) are in the tool descriptions, and the Studio **re-checks them on write**: a
  transcript block that lost its `<h3 id="…">` is rejected, not silently accepted.
- `slidesmith_apply_patch({ sections, preview?, summary? })` — push your rewritten `<section data-id>`(s)
  back; the Studio replaces those slides by `data-id` immediately. `preview: true` lands the
  change as a **proposal** (Studio shows a 保留/还原 bar) — use it whenever the request had
  `confirm: true`. **Always pass `summary`** — one sentence on what you changed
  (「第 7 页三个要点改成两栏，去掉第二段铺垫」). The Studio shows it in the AI pane under
  「AI 改了什么」 and in the toast, so the user doesn't have to diff the page by eye.
  Same patch format as §4.
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
real HTML): the human leaves a **comment per slide** ("把这页改成两栏…"), a **comment on one
element** (select it in the preview → the 💬 handle on its gizmo), and/or one
**deck-level ask** ("对整份 deck 说…"). A submitted request bundles: every pending page's
comment + that page's current HTML, and — if there's a deck-level ask — that ask plus a
**structure overview** (page № · `data-id` · title for ALL slides) so you can pick which
pages to touch. Honor the division of labor: the human does the high-frequency fine edits
themselves (text, color, size, animation, move/delete element) — you handle the
complex/fuzzy asks. Only touch the pages a comment names, or (for a deck-level ask) the
pages it clearly implies. Every page you patch flips to **✓ 已改** in the Studio and the
human can **还原本页** (revert) if they dislike it — so make the change worth keeping, and
don't re-touch a page they reverted unless they ask again.

**Images in a request are placeholders.** Any `<img src="data:…">` already on a page arrives as
`src="sm-img://N"` (the Studio keeps the pixels and restores them when your patch lands). Leave
those attributes exactly as they are — move or resize the element freely, but never rewrite the
`src`, never drop it, never paste base64 back in. A request from a 44-page deck with three
180 KB photos went from ~60k tokens to ~2k because of this; don't undo it.

### 4c. The unified AI-tasks request (`.ai-tasks.md`)

The Studio's **AI** pane (the first right-rail tab) funnels everything into one to-do list and one send —
the tab itself carries a **count badge**, and the only send button anywhere is that pane's
「一键发送给 AI · N 项」 (the transcript modal has a second button, but it fires the same one).
A submitted request (name ends `.ai-tasks.md`) bundles, in one file: the **deck-level ask** (+ a structure
overview), the **讲稿批注** (transcript comments, see below), and a per-page block for every page that
has a **改字** (page comment), an **元素批注** (comment on one specific element), a **配图**
(illustration the human queued), and/or **导入图** (their own staged images). Each page block
spells out exactly what it wants — apply them together and return that page's `<section
data-id>` once. The kinds of per-page directive:

- **改字 (`**修改要求：**`)** — rewrite the page per the comment. Tokens only, keep the contract.
- **元素批注 (`**元素批注（针对本页里的具体元素…`)** — the human clicked **one element** in the preview
  and left a note on it. Each line gives the element as `` `<tag>` (本页第 N 个 · class="…") ·
  原文开头「first ~40 chars」``. **The quoted text is the primary anchor** — it survives rewriting far
  better than a position; `tag` + 本页第 N 个 + `class` are the fallback for when the human edited that
  text after commenting. If the two disagree, trust the text; if neither resolves, pick the element on
  that page the note obviously means. **Touch only the named element** — a page can carry both a
  page-level 修改要求 and several element comments, and only the former is page-wide. A page's element
  comments are cleared automatically once you patch that page (same as 改字 → ✓ 已改).
- **配图 · 矢量 (`**配图（矢量 SVG…`)** — Claude has no image model, so *you draw an inline
  `<svg>`* fitting the page: depict the actual topic (not generic blobs), color via tokens
  (`var(--accent)` / `var(--accent-2)` / `var(--ink)`, never hard hex), self-contained vector
  (no external refs / raster / fonts), restrained composition, placed without covering text.
- **图表 (`**图表（按数据/描述…`)** — the human pasted a description, or imported a data file
  (multi-line CSV/numbers arrive **fenced** under 「按以下数据…」); turn it into a chart, plotting the
  real numbers.
  **Default = draw an inline `<svg>` chart yourself** (the A path, same DNA as 矢量): pick the
  right chart type (share→pie/donut; series/time→line/area; category compare→bar/grouped/stacked;
  multi-dim→radar; correlation/spread→scatter), include axes + ticks + axis titles + units +
  legend (multi-series) + value labels, compute coordinates **accurately** from the given numbers,
  color via tokens (`var(--accent)`/`-2`/`-3`/`var(--ink)`/`var(--muted)`), self-contained vector,
  no chartjunk. Store the chart SVG in the image library too (like 矢量). **Escape hatch (C) — only
  for dense/precise stats charts** (box/violin/heatmap/sankey/100+-point scatter/log+error-bars)
  that are error-prone by hand: pre-render with local **matplotlib** (`rcParams['font.sans-serif']`
  = a CJK font like `PingFang SC`/`Noto Sans SC` so 中文 isn't tofu; colors = hex approximations of
  the deck tokens) → `savefig(format='svg')` → inline that `<svg>` + store it. Note: pre-rendered
  SVG bakes hex colors (won't react to skin) and is heavier — use it **only** when A can't.
- **配图 · 照片 (`**配图（照片级…`)** — generate a *photo* with the local `codex` CLI (its
  built-in imagegen; ChatGPT login, no API key). For each such page: write an English prompt
  from the content, run codex, store the PNG in the image library, then base64-inline it:
  ```
  codex exec --skip-git-repo-check -C <scratchdir> -s workspace-write \
    -c sandbox_workspace_write.network_access=true -c approval_policy='"never"' \
    "Generate <prompt>. Save it as out.png in the current working directory."
  ```
  (codex needs network → the Bash call wrapping it needs the sandbox off; do NOT use codex's
  own `--dangerously-bypass…`. It writes to `~/.codex/generated_images/…` — copy/resize out.)
  Cost ≈ tens of thousands of tokens + ~1 min **per image** — tell the user if it's a big batch.
- **导入图 (`**在本页插入这些图片…`)** — the human's own staged images. Each line gives an
  `id`, dims, note, and a **real disk path** (the bridge wrote the pixels there) — `Read` it to
  see the picture. Insert a placeholder `<img data-img-id="img-N" …>` (no `src`/base64); the
  Studio backfills the real image by id. Place each on its listed page only.

**The image library** — `~/.slidesmith/library/<deckBase>/` is the persistent, manageable store
for *every* AI-generated image (vector `.svg` and photo `.png`). Naming `<slideId>__<slug>__
<id8>.ext`; append to `<dir>/index.json` (`{ deck, updatedAt, images:[{ id, slideId, slideTitle,
prompt, style, model, file, w, h, bytes, createdAt, usedInDeck }] }`). The Studio 图片库 panel
reads it via the bridge's `/api/library*` endpoints (browse / re-insert / delete). Keep the
deck self-contained (inline base64 into the slide) while the library keeps the original.

**讲稿批注** — the same request may also carry a `## 讲稿批注` section (the human highlighted a passage
in the embedded transcript and commented on it). That one is **not** part of the patch: rewrite the whole
anchor block and write it back with **`slidesmith_notes`**, never `apply_patch` — the transcript lives
outside `#deck`. Its hard constraints (keep `<h3 id="…">` exactly, keep cue/golden/data blocks, keep
`<strong>` seeds) are spelled out in that section and re-checked on write.

Then `slidesmith_apply_patch` (`preview: true` if the request had `confirm: true`). Pages flip
to ✓ 已改; placed 导入图 show 已放置; the human fine-tunes after. Honor the division of labor —
the human does high-frequency fine edits (text, color, size, animation, move/delete) themselves.

## 4d. Cues and notes — the two things `apply_patch` cannot reach

Both live **outside `#deck`**, so `slidesmith_apply_patch` (which replaces `<section data-id>`
inside `#deck`) cannot touch them. They have their own tools, and the Studio **re-validates on
write** — a block that breaks a rule is rejected, not silently accepted. The MCP tool
descriptions are deliberately short; the full rules are here.

### `slidesmith_cues` — Apple Watch cue table (`window.__SM_CUES__`)

- Call without `set` = read (per page: page №, anchor, title, current cues, health verdict).
  Call with `set` = write. `enableWatchMode` bakes the watch template into a deck that has none.
- **Keys must be the `anchor` this tool returned** — never invent one and never substitute
  `slidesmith_outline` ids (on some decks the two differ; the outline falls back to `s1/s2/s3`
  when the deck has no `window.SLIDE_MAP`). A wrong key fails the whole batch as "unknown anchor".
- **Hard limits (measured on Apple Watch Ultra 3 / Series 11 — do not relax):**
  1–5 cues per page (the face fits 5 lines) · each **≤10 CJK chars** (≤16 Latin) — longer wraps
  and becomes the transcript · must be a **content anchor** (「无缝嵌入」) not a **structure label**
  (「第一部分」) · must **not repeat the slide title** (the watch header already shows it) ·
  **every page needs one** — a missing page is worse than no feature.
- Default is **fill only empty pages, never overwrite** (the user may have hand-tuned cues in the
  Studio panel); pass `replace: true` only when explicitly asked to rewrite. After a write the
  Studio prompts the user to review page by page and keeps an undo.

### `slidesmith_notes` — embedded transcript (`window.__TXB64__`)

- Only a **一体版** deck (stitched by slides-presenter-mode) has one; the three-file variant keeps
  the transcript in a sibling file the Studio cannot see.
- Call without `set` = table of contents (anchor · title · length · the user's annotations); name
  `anchors` to get whole blocks. Call with `set` = write blocks back (`{ anchor: html }`).
- **Rules the Studio enforces on write:**
  1. `<h3 … id="anchor">` stays verbatim, unique, and is the block's **first top-level element** —
     the anchor is the key for second-screen sync and watch cues.
  2. `<p class="cue">` / `<div class="golden">` / `<div class="data">` blocks that were there stay,
     unless the user explicitly asked to remove them.
  3. `<strong>` seeds the watch cues — don't bold whole paragraphs, don't strip them all.
  4. Touch only the blocks that carry an annotation; never rewrite the whole transcript in passing.
- Typical flow: user selects a passage in the Studio transcript view → writes a note → the note
  arrives inside the AI-tasks request (with the original block) → you rewrite that block → `set` it
  back → the user sees it in the Studio and can 「撤销 Claude 的改写」.

## 5. Hand-off to the human

Best path: call `slidesmith_open(deckPath)` — the Studio opens in their browser already
connected. Tell them to edit visually (click text, right panel for colors / fonts /
animations / move·delete element, 「视觉自检」, 「导出 HTML / 导出 PDF」), and for
complex changes to **leave a comment and hit 一键发送给 AI** — page-level in the AI pane,
per-element via the 💬 handle that appears when they select an element, per-passage inside
「打开讲稿」. All of them land in the **same** to-do list (the AI tab shows the count) and go
out in **one** send — you'll pick it up via `slidesmith_wait` (or `slidesmith_get_requests`).

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
