# Slidesmith 设计系统（会生长的元素库）

> 这份文档是 Slidesmith 的**设计元素登记册**。理念:AI 把整体做完,人类在 Studio 里精修;
> 而精修用到的"格式 / 动画 / 动效"元素会**随使用不断沉淀**进这里——你用 AI 做出新效果、
> 觉得好,就让我把它**融入项目**,以后选中元素一点就能用。
>
> 三个 tab 对应三类元素:**格式(Format)** · **动画效果(Animation)** · **文稿(Document)**。
> 来源:`huashu-design`(easing/motion 范式) + `keynote.html`(呼吸灯/霓虹/强调脉冲)。

---

## 1. 动画效果(Animation)

### 1.1 入场动画(entrance,翻到本页播一次) · IR `block.build.anim`
| 名称 | 标签 | 效果 | keyframe |
|---|---|---|---|
| `fade` | 淡入 | opacity 0→1 | `sm-fade` |
| `rise` / `fade-up` | 上升淡入 | 上移 24px + 淡入 | `sm-rise` |
| `pop` | 弹出 | scale .94→1 + 淡入 | `sm-pop` |
| `in-left` / `in-right` | 从左/右进 | translateX ±48px + 淡入 | `sm-in-left/right` |
| `stagger-list` | 逐条浮现 | 列表项依次 rise(stagger ms) | `sm-rise` |
| `counter-up` | 数字滚动 | 数字从 0 滚到目标(rAF) | — |

缓动统一用 **expoOut** `cubic-bezier(0.16,1,0.3,1)`(huashu 的"反廉价"曲线:快起慢收)。

### 1.2 持续动效(motion,一直循环) · IR `block.build.motion`
| 名称 | 标签 | 效果 | 来源 |
|---|---|---|---|
| `glow` | 呼吸灯（发光） | accent 色 drop-shadow 呼吸 | keynote `kl-breathe` |
| `breathe` | 呼吸（缩放） | scale 1↔1.035 | huashu `breathe` |
| `float` | 漂浮 | translateY 0↔-12px | huashu |
| `pulse` | 闪烁 | opacity 1↔.55 | huashu/AI-UI |
| `neon` | 霓虹微闪 | 不规则 opacity 闪烁 | keynote `neon-flicker` |
| `stress` | 强调脉冲 | 周期性 scale 1→1.06 点睛 | keynote `a-em-stress` |

动效在预览/投屏持续播放;放映时按 `B` 一键关闭;尊重系统"减少动态"。

---

## 2. 格式(Format) · IR `block.style`(只用符号 token,绝不写死 hex/px)
- **字号 `size`**:`display h1 h2 h3 body small caption`
- **颜色 `color`**:`bg surface ink muted accent accent-fg link border`
- **粗细 `weight`**:`normal medium bold` · **对齐 `align`**:`start center end`
- **主题(配色)** = 整套 token 切换:`editorial`(杂志) / `keynote-dark`(暗+琥珀) / `academic`(学术)。
- **布局** = `cover section statement bullets two-col data-stat quote end`。

> 具体颜色值在各主题 `packages/themes/src/<theme>/theme.css` 的 `:root`。
> huashu 提取的可选色板(未来扩主题用):暖纸 `#F5F0E8`+陶橙 `#CC785C`;暗青 `#0A192F`+`#64FFDA`。

---

## 3. 文稿(Document) · `slide.notes` + `slide.noteBlocks`
- **逐字稿正文** `notes`(支持 `**关键词**` 提词)。
- **讲稿块** `noteBlocks`:`cue`(讲法) / `golden`(金句) / `data`(数据)。
- 只进逐字稿 + 演讲者视图,不显示在幻灯片上。

---

## 4. 怎么加一个新效果(给未来的自己 / AI)

**新增一个持续动效(例:`shimmer` 流光):**
1. `packages/ir/src/tokens.ts` → `MOTION_NAMES` 加 `'shimmer'`。
2. `packages/runtime/src/core.css` → 加
   ```css
   body.sm.anim .sm-deck > .slide [data-motion="shimmer"]{ animation: sm-m-shimmer 2.6s linear infinite; }
   @keyframes sm-m-shimmer{ /* … */ }
   ```
3. `packages/studio/src/main.ts` → `MOTION_LABEL` 加 `shimmer:'流光'`。
4. `npm run build:studio` 重打包;`npm test` 跑回归。

**新增入场动画**同理(`ANIM_NAMES` + core.css 的 `[data-anim="x"]` 规则 + `ANIM_LABEL`)。
**新增主题**:`packages/themes/src/<name>/theme.css` + 在 `themes/src/index.ts` 注册。

> 红线:动画一律走**声明式 token**(`data-anim`/`data-motion`),不在内容里内联 CSS;
> 这样 AI 易发、人类易选、换肤不破。复杂一次性特效仍可用 `embed` 块塞自由 HTML(代价:那块失去换肤保证)。

---

## 5. 待办 / 下一步(精修体验)
- 元素**自由拖拽 + 自动对齐(吸附)**:当前是流式增删移(上移/下移/删除/加),自由定位需 IR 支持绝对坐标(v-drag),排在后面。
- token 级**单字配色/字号微调**(现为整套主题 + 符号 token 档位)。
- 动效**实时预览缩略**、撤销/重做、图片上传。
- 从更多 AI 产出里继续**沉淀新动效/新主题**到本登记册。
