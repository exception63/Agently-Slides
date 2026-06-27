#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build.py · editorial-slides 装配器
把「与风格无关的引擎/骨架」 + 「某个皮肤的 CSS」 + 「slides」缝成一个单文件、
离线可用的 HTML deck。皮肤源是模块化的（联邦、不堆巨型文件），输出是单文件（投屏即用）。

用法：
  python3 build.py <skin> [out.html] [--demo | --blank | --slides FILE]
                   [--title T] [--brand B] [--sub S] [--channel C]

  <skin>            皮肤名（assets/skins/<skin>.css），如 academic / editorial
  out.html          输出路径；缺省 = ../gallery/<skin>.html
  --demo            注入 assets/demo/<skin>.slides.html（默认，用于画廊预览）
  --blank           注入空白起手式（一张封面 + 写作区注释），用于新建真实 deck
  --slides FILE     注入你自己的 slides 片段文件（一串 <section>）
  --title/--brand/--sub/--channel  覆盖占位（缺省给出合理默认）

例：
  python3 build.py academic                         # → ../gallery/academic.html（含 demo）
  python3 build.py academic deck.html --blank \\
      --title "我的讲题" --brand "贵州财经大学" --channel "mytalk-sync"
"""
import argparse, os, re, sys

BASE = os.path.dirname(os.path.abspath(__file__))          # .../assets
SKILL = os.path.dirname(BASE)                              # skill root

def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()

BLANK_SLIDES = """<!-- ════════════════════════════════════════════════════════════════
     ▼▼▼  你的 slides 写在这里  ▼▼▼
     每张 = 一个 <section class="slide ...">，带 data-seg="段号"（从 0 起）
            + data-segname="段 N · 段名"（同段每张写一样）
            可选 data-title="副屏短标题"
     版式 class 速查见 references/components.md
     ════════════════════════════════════════════════════════════════ -->
<section data-seg="0" data-segname="段 0 · 开场" class="slide cover">
  <div class="cover__top"><div class="cover__brand">{{BRAND}}</div><div class="cover__seal">题</div></div>
  <div class="cover__main">
    <div class="cover__eyebrow">副标签 · Subtitle</div>
    <h1 class="cover__title">{{COVER_TITLE}}</h1>
    <p class="cover__sub">{{COVER_SUB}}</p>
  </div>
  <div class="cover__meta">
    <div class="cover__meta-item"><span class="cover__meta-k">Author</span><span class="cover__meta-v">讲者</span></div>
    <div class="cover__meta-item"><span class="cover__meta-k">Venue</span><span class="cover__meta-v">场合</span></div>
    <div class="cover__meta-item"><span class="cover__meta-k">Date</span><span class="cover__meta-v">2026</span></div>
  </div>
</section>
"""

SHELL = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<!-- 在线时加载该皮肤的字体；离线时自动回退到系统字体（字体栈已含 fallback） -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
{fontlink}
<style>
/* skin: {skinname} · 由 build.py 装配（core + skin + engine）· 改样式请改 assets/ 下的源，勿改本成品 */
{core}

{components}
{layouts}
{skinurl_comment}
{skin}

/* ——— 动画库 _fx.css（集众家所长 · 编号见 references/animations.md）——— */
{fx_css}
</style>
</head>
<body>

<header class="topbar">
  <div class="topbar__brand">{brand}</div>
  <div class="topbar__sub">{sub}</div>
  <div class="topbar__spacer"></div>
  <span class="topbar__info">当前 <strong id="curSeg">段 0</strong> · <strong id="curIdx">1</strong> / <strong id="totalIdx">0</strong></span>
  <button class="topbar__btn" id="prevBtn" title="上一页 ←">←</button>
  <button class="topbar__btn" id="nextBtn" title="下一页 →">→</button>
  <button class="topbar__btn topbar__btn--primary" id="playBtn" title="全屏播放（F 或 Enter）">▶ 全屏播放</button>
  <button class="topbar__btn topbar__btn--presenter" id="presenterBtn" title="演讲者模式 · 副屏同步讲稿">🖥 演讲者</button>
</header>

<nav class="segnav" id="segnav"></nav>
<div class="progress"><div class="progress__bar" id="progressBar" style="width:0%"></div></div>
<div class="hint">F 全屏播放 · O 概览 · S 演讲者模式 · ← → 翻页 · ESC 退出 · 1-9 跳段</div>

<div class="deck" id="deck">

{slides}

</div>

<script>
{fx_js}
</script>
<script>
{fx_canvas}
</script>
<script>
{engine}
</script>
</body>
</html>
"""

DEFAULTS = {
    "academic":     dict(title="学术汇报 · academic 样板", brand="学术汇报", sub="academic skin", channel="academic-demo"),
    "editorial":    dict(title="杂志风 · editorial 样板", brand="EDITORIAL", sub="editorial skin", channel="editorial-demo"),
    "keynote-dark": dict(title="暗场主旨 · keynote-dark 样板", brand="KEYNOTE", sub="keynote-dark skin", channel="keynote-dark-demo"),
    "cartesian":    dict(title="极简网格 · cartesian 样板", brand="CARTESIAN", sub="cartesian skin", channel="cartesian-demo"),
    "signal":       dict(title="机构正式 · signal 样板", brand="SIGNAL", sub="signal skin", channel="signal-demo"),
    "vellum":       dict(title="暗色学术 · vellum 样板", brand="VELLUM", sub="vellum skin", channel="vellum-demo"),
    "daisy-days":   dict(title="温暖活泼 · daisy-days 样板", brand="DAISY", sub="daisy-days skin", channel="daisy-days-demo"),
}

def main():
    ap = argparse.ArgumentParser(description="editorial-slides 装配器")
    ap.add_argument("skin")
    ap.add_argument("out", nargs="?", default=None)
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--demo", action="store_true")
    g.add_argument("--blank", action="store_true")
    g.add_argument("--slides", default=None, help="自定义 slides 片段文件")
    ap.add_argument("--title"); ap.add_argument("--brand")
    ap.add_argument("--sub"); ap.add_argument("--channel")
    a = ap.parse_args()

    skin_path = os.path.join(BASE, "skins", a.skin + ".css")
    if not os.path.isfile(skin_path):
        sys.exit("找不到皮肤：%s" % skin_path)
    core = read(os.path.join(BASE, "_core.css"))
    engine = read(os.path.join(BASE, "_engine.js"))
    skin_css = read(skin_path)
    # 动画库（可选；缺失则不报错，deck 仍可用，只是不带动画）
    fx_css = read(os.path.join(BASE, "_fx.css")) if os.path.isfile(os.path.join(BASE, "_fx.css")) else ""
    fx_js = read(os.path.join(BASE, "_fx.js")) if os.path.isfile(os.path.join(BASE, "_fx.js")) else ""
    fx_canvas = read(os.path.join(BASE, "_fx-canvas.js")) if os.path.isfile(os.path.join(BASE, "_fx-canvas.js")) else ""
    # 共享组件层：仅当皮声明 /* uses-base */ 时内联（薄皮用；原 7 张厚皮自带组件，不内联）
    components = ""
    if "/* uses-base */" in skin_css and os.path.isfile(os.path.join(BASE, "_components.css")):
        components = read(os.path.join(BASE, "_components.css"))
    # P4 版式库：对「所有」皮恒内联（token-generic + 缺失令牌兜底 → 薄皮 + 原 7 厚皮通用）
    layouts = read(os.path.join(BASE, "_layouts.css")) if os.path.isfile(os.path.join(BASE, "_layouts.css")) else ""

    # 抽出字体 URL（皮肤首行 /* FONTS <url> */），生成 <link>
    m = re.search(r"/\*\s*FONTS\s+(\S+)\s*\*/", skin_css)
    fontlink = '<link rel="stylesheet" href="%s">' % m.group(1) if m else ""

    # slides 来源
    if a.slides:
        slides = read(a.slides)
    elif a.blank:
        slides = BLANK_SLIDES
    else:  # 默认 demo（demo/<skin>.slides.txt 是 slide 片段，不是成品页面）
        demo_txt = os.path.join(BASE, "demo", a.skin + ".slides.txt")
        demo_html = os.path.join(BASE, "demo", a.skin + ".slides.html")  # 兼容旧命名
        demo = demo_txt if os.path.isfile(demo_txt) else demo_html
        slides = read(demo) if os.path.isfile(demo) else BLANK_SLIDES

    d = DEFAULTS.get(a.skin, dict(title=a.skin, brand=a.skin, sub=a.skin + " skin", channel=a.skin + "-sync"))
    title = a.title or d["title"]; brand = a.brand or d["brand"]
    sub = a.sub or d["sub"]; channel = a.channel or d["channel"]
    # 封面大标题/副题：给了 --title/--sub 就用真内容（"试皮"看真封面 + 新建真实 deck）；否则留占位
    cover_title = a.title or "主标题<br><em>关键词</em>"
    cover_sub = a.sub or "一句副标题 · 点明这场讲什么、为谁讲。"

    # 占位替换（slides 与 engine 里的 {{...}}）
    for k, v in {"{{BRAND}}": brand, "{{BRAND_SUB}}": sub, "{{DECK_TITLE}}": title, "{{CHANNEL}}": channel,
                 "{{COVER_TITLE}}": cover_title, "{{COVER_SUB}}": cover_sub}.items():
        slides = slides.replace(k, v)
        engine = engine.replace(k, v)

    html = SHELL.format(
        title=title, brand=brand, sub=sub, fontlink=fontlink, skinname=a.skin,
        core=core, skinurl_comment="/* —— 皮肤 %s —— */" % a.skin,
        skin=skin_css, slides=slides, engine=engine, fx_css=fx_css, fx_js=fx_js, fx_canvas=fx_canvas,
        components=components, layouts=layouts,
    )
    out = a.out or os.path.join(SKILL, "gallery", a.skin + ".html")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    n = slides.count("<section ")
    print("✓ %s · skin=%s · %d 张 → %s" % (os.path.basename(out), a.skin, n, out))

if __name__ == "__main__":
    main()
