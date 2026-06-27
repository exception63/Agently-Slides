#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build-showcases.py · 生成「换皮 / 版式」所见即所得展厅（移植 html-ppt-skill 的呈现）
  ① gallery/skins/<skin>.html  —— 每张皮一份样板 deck（原生皮用自带 demo，薄皮用 _showcase）
  ② gallery/theme-showcase.html —— 全部皮的「活缩略 iframe」网格（?bare 只显封面），点击开全屏
  ③ gallery/layout-showcase.html —— 版式库样板 deck（按 O 看全部版式）
用法：python3 build-showcases.py
"""
import os, subprocess

BASE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(BASE)
SKINS_DIR = os.path.join(SKILL, "gallery", "skins")
os.makedirs(SKINS_DIR, exist_ok=True)

OLD = ["editorial", "academic", "keynote-dark", "cartesian", "signal", "vellum", "daisy-days"]
NEW = ["dracula", "nord", "tokyo-night", "catppuccin-mocha", "catppuccin-latte", "vaporwave",
       "swiss-grid", "bauhaus", "cyberpunk-neon", "glassmorphism", "y2k-chrome", "neo-brutalism",
       "terminal-green", "rose-pine"]
DARK = {"keynote-dark", "vellum", "dracula", "nord", "tokyo-night", "catppuccin-mocha", "vaporwave",
        "cyberpunk-neon", "glassmorphism", "terminal-green", "rose-pine"}
NAME = {"editorial": "杂志风", "academic": "学术", "keynote-dark": "暗场主旨", "cartesian": "极简网格",
        "signal": "机构正式", "vellum": "暗色学术", "daisy-days": "温暖活泼", "dracula": "Dracula",
        "nord": "Nord", "tokyo-night": "东京夜", "catppuccin-mocha": "Catppuccin Mocha",
        "catppuccin-latte": "Catppuccin Latte", "vaporwave": "蒸汽波", "swiss-grid": "瑞士网格",
        "bauhaus": "包豪斯", "cyberpunk-neon": "赛博朋克", "glassmorphism": "玻璃拟态",
        "y2k-chrome": "Y2K 铬", "neo-brutalism": "新野兽派", "terminal-green": "终端绿", "rose-pine": "Rosé Pine"}

SHOWCASE_DEMO = os.path.join(BASE, "demo", "_showcase.slides.txt")
LAYOUTS_DEMO = os.path.join(BASE, "demo", "_layouts.slides.txt")

def build(skin, out, extra):
    subprocess.run(["python3", os.path.join(BASE, "build.py"), skin, out] + extra,
                   check=True, cwd=BASE, stdout=subprocess.DEVNULL)

# ① 每张皮一份样板
for s in OLD:
    build(s, os.path.join(SKINS_DIR, s + ".html"), ["--demo", "--brand", NAME[s]])
for s in NEW:
    build(s, os.path.join(SKINS_DIR, s + ".html"), ["--slides", SHOWCASE_DEMO, "--brand", NAME[s]])

# ③ 版式库样板（用一张干净的浅皮）
build("catppuccin-latte", os.path.join(SKILL, "gallery", "layout-showcase.html"),
      ["--slides", LAYOUTS_DEMO, "--brand", "版式库", "--title", "版式库 · Layout Library"])

# ② 主题 showcase
def card(skin):
    tag = "暗" if skin in DARK else "浅"
    return ('<a class="sc-card" href="skins/{s}.html" target="_blank" title="点击打开 {n} 全屏样板">'
            '<div class="sc-frame"><iframe loading="lazy" src="skins/{s}.html?bare"></iframe></div>'
            '<div class="sc-meta"><span class="sc-name">{n}</span>'
            '<span class="sc-tag">{s} · {tag}</span></div></a>').format(s=skin, n=NAME[skin], tag=tag)

native = "\n".join(card(s) for s in OLD)
ported = "\n".join(card(s) for s in NEW)

THEME_HTML = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Slidesmith 换皮展厅 · Theme Showcase</title>
<style>
:root{--w:360px;}
*{box-sizing:border-box;}
body{margin:0;background:#0b0c10;color:#e8e6df;font-family:-apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;}
.wrap{max-width:1240px;margin:0 auto;padding:32px 24px 80px;}
h1{font-size:30px;font-weight:800;margin:0 0 6px;letter-spacing:-.5px;}
.sub{color:#9a988f;font-size:14px;line-height:1.6;margin:0 0 8px;}
h2{font-size:18px;font-weight:700;margin:34px 0 4px;display:flex;align-items:center;gap:10px;}
h2 .c{font-size:12px;font-weight:600;color:#0f6e56;background:#d8f0e7;padding:2px 9px;border-radius:20px;}
.grid{display:grid;grid-template-columns:repeat(auto-fill,var(--w));gap:18px;justify-content:center;margin-top:14px;}
.sc-card{text-decoration:none;color:inherit;border:1px solid #25262c;border-radius:12px;overflow:hidden;background:#15161b;transition:transform .15s,border-color .15s;display:block;}
.sc-card:hover{transform:translateY(-4px);border-color:#4a4b55;}
.sc-frame{width:var(--w);height:calc(var(--w) * 9 / 16);overflow:hidden;position:relative;background:#000;}
.sc-frame iframe{width:1920px;height:1080px;border:0;transform:scale(calc(var(--w) / 1920));transform-origin:top left;pointer-events:none;}
.sc-meta{display:flex;align-items:center;justify-content:space-between;padding:9px 13px;}
.sc-name{font-size:14px;font-weight:600;}
.sc-tag{font:600 11px ui-monospace,Menlo,monospace;color:#8a887f;}
.foot{margin-top:40px;color:#6f6e66;font-size:12px;border-top:1px solid #25262c;padding-top:16px;line-height:1.7;}
</style></head>
<body><div class="wrap">
<h1>Slidesmith 换皮展厅 · Theme Showcase</h1>
<p class="sub">__N__ 张皮 · 每格是<b>真实渲染</b>的封面（非截图）· 点任意一张打开它的全屏样板。<br>
对 AI 说皮名即可（"用 dracula / 蒸汽波 / 瑞士网格 做"）。</p>
<h2>原生皮 <span class="c">7 · 基建最全</span></h2>
<div class="grid">__NATIVE__</div>
<h2>移植自 html-ppt-skill <span class="c">14 · 薄皮 + 共享组件</span></h2>
<div class="grid">__PORTED__</div>
<div class="foot">由 <code>assets/build-showcases.py</code> 生成 · 薄皮 = 令牌块 + 共享 <code>_components.css</code> + 签名微调 · 调色移植自 html-ppt-skill (MIT)。</div>
</div></body></html>
"""
out = os.path.join(SKILL, "gallery", "theme-showcase.html")
html = (THEME_HTML.replace("__NATIVE__", native).replace("__PORTED__", ported)
        .replace("__N__", str(len(OLD) + len(NEW))))
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("✓ theme-showcase.html (%d 皮) + layout-showcase.html + gallery/skins/*.html (%d)" % (len(OLD)+len(NEW), len(OLD)+len(NEW)))
