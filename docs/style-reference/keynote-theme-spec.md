# Keynote-Dark Theme Spec (M4 target)

> Extracted from the user's `keynote-target.html` (the designated output-style target).
> Implement as a built-in Slidesmith theme in **M4** — likely the flagship/default style.
> Voice: **dark keynote, theatrical, minimal, statement-driven.** Near-black bg + massive light text + single amber accent. Very low density, lots of whitespace. Chinese-first.

## Color tokens
| token | value | role |
|---|---|---|
| bg (--paper) | `#0C0D11` | slide background (near-black) |
| surface (--paper-soft) | `#16181E` | cards/panels |
| --paper-warm | `#1C1F27` | tertiary bg |
| --night | `#05060A` | terminal/deep |
| ink | `#F5F6F8` | primary text |
| ink-2 | `#C2C6D0` | secondary/body |
| ink-3 | `#8B91A0` | meta/labels |
| ink-4 | `#5E636F` | captions |
| accent | `#F4B73E` | amber — highlights/em/bars |
| accent-2 | `#D99828` | darker accent |
| accent-soft | `rgba(244,183,62,0.15)` | tint |
| navy | `#5BC8DE` | secondary (cool) |
| green/good | `#5FD09A` | positive |
| bad | `#FF6B5B` | negative |
| rule | `rgba(255,255,255,0.10)` | dividers |
| rule-strong | `rgba(255,255,255,0.20)` | emphasized dividers |

Also ships **light** (navy `#27406B` on beige `#F7F5EF`) and **contrast** (dark-orange `#B4540A` on white) variants via CSS-var swap.

## Typography
- display: `"Space Grotesk","Inter","Noto Sans SC","Source Han Sans SC","PingFang SC",sans-serif`
- sans/body: `"Inter","Space Grotesk","Noto Sans SC",...`
- serif: `"Newsreader","Noto Serif SC","Songti SC",serif` (quotes)
- mono: `"IBM Plex Mono","SF Mono",Menlo,monospace` (eyebrows/labels/terminal)
- Web fonts via Google Fonts (Space Grotesk/Inter/Newsreader/Noto Sans+Serif SC). For Slidesmith offline mode: subset+inline or system fallback.
- Scale (px): display 168 / h1 108 / h2 76 / h3 52 / h4 40 / lead 38 / body 32 / small 26 / eyebrow 20. Markup overrides: cover title 150, manifesto 132, secdiv 136, secdiv__num 500 (ghost 0.06), bignum 128.
- weights 400/500/600/700; title line-height 1.0–1.08, body 1.35–1.45 (CJK-generous); letter-spacing: titles -0.03em, eyebrow 0.26em uppercase, mono labels 0.1–0.2em.

## Canvas
1920×1080, pad `--pad-x:130px --pad-y:96px`. Edit mode `--fit-scale` (~0.55, responsive); present mode `--sc = min(vw/1920,vh/1080)*0.98`. Sidebar 300px + topbar 60px + 3px progress.

## Layout archetypes (implement as named layouts)
cover (eyebrow→150px title w/ `<em>` amber→sub→meta row) · manifesto/insight (centered 132px statement, `<em>` amber) · secdiv (ghost 500px numeral, 136px title; variants --dark/--accent) · cards (grid 2/3/4, `--paper-soft` + 3px accent top-border; semantic --n navy/--g green) · bullets (34px, 20×3px accent dash marker; `<strong>` amber) · table (mono amber th, 2px accent underline, `.good`/`.bad`/`.hl`) · compare (2-col good/bad) · terminal (`--night` bg, amber user / green system, mono) · bignum (128px amber number + unit + mono label) · figure (framed SVG/img + caption + source) · boundary-stage (1fr·3px·1fr two-sided, huge 158px glyphs, gradient divider line, auras).

## Motifs
mono uppercase **eyebrows/kickers** (0.26em); thin rules (1px) + thick accent bars (3–4px top/left); oversized ghost numerals; auto-injected page chrome footer (`段名` left, `001 / 036` right, tabular-nums); `<em>` = amber non-italic; special `em.neon` (gradient text-clip + 5-layer drop-shadow glow, present-only); callout (3px left accent + accent-soft bg); keyline (cyan-tinted box, breathing glow + per-char typewriter in present mode).

## Animations (present mode mostly)
- page-in: `@keyframes a-page-in{from{opacity:0}to{opacity:1}}` 0.40s (opacity only, no transform — avoids scale conflict).
- element reveals: `a-fade-up` (translateY 22px), `a-rise` (translateY+scale .985), `a-num-pop`; staggered `animation-delay: calc(.26s + var(--a-step,95ms)*n)`.
- ease `cubic-bezier(0.22,0.61,0.36,1)`; dur 0.52s.
- keyline breathing (box-shadow pulse 3.2s); neon flicker; animated SVG concept diagrams (draw/snow/gap-pop/glow); braid weave (dual-direction stroke-dashoffset flow); "ask" char erupt.
- honors `@media (prefers-reduced-motion: reduce)`.

## Engine / nav
1920×1080 scaled; data-seg → auto segnav sidebar + cloned thumbnails (scale ~0.0656); auto page-chrome footer; keys: ←/→/space/PageUp-Down, Home/End, F/Enter fullscreen, P present, S open presenter, 1-9 jump segment; click left/right thirds advance in present mode; **presenter via `window.open` + BroadcastChannel + localStorage** (channel name configurable), broadcasts `{slideIdx,total,segment,anchor,title,source}`.

> Slidesmith note: when porting, keep presenter sync on `window.open`+postMessage+heartbeat (file:// safe) per ARCHITECTURE §8; BroadcastChannel/localStorage as http enhancement. Map these archetypes onto Slidesmith layouts; expose amber/dark tokens via the theme token system; gate heavy animations behind a reduced-motion + `B`-key off switch.
