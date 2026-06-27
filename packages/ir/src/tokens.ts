// Symbolic token vocabulary that the IR is allowed to reference.
// Content references token NAMES only (never inline hex/px); each theme
// provides concrete values for these names. (See ARCHITECTURE.md §3 / §5.)

export const COLOR_TOKENS = [
  'bg',
  'surface',
  'ink',
  'muted',
  'accent',
  'accent-fg',
  'link',
  'border',
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

export const SIZE_TOKENS = [
  'display',
  'h1',
  'h2',
  'h3',
  'body',
  'small',
  'caption',
] as const;
export type SizeToken = (typeof SIZE_TOKENS)[number];

export const ALIGN_TOKENS = ['start', 'center', 'end'] as const;
export type AlignToken = (typeof ALIGN_TOKENS)[number];

export const WEIGHT_TOKENS = ['normal', 'medium', 'bold'] as const;
export type WeightToken = (typeof WEIGHT_TOKENS)[number];

// Declarative ENTRANCE animation names (one-shot when a slide becomes active).
// Expanded with keynote/huashu reveals + huashu expoOut easing.
export const ANIM_NAMES = [
  'none',
  'fade',
  'rise',
  'fade-up',
  'pop',
  'in-left',
  'in-right',
  'stagger-list',
  'counter-up',
  'morph',
  // full library entrances (A7–A12 + 点睛 clip-wipe) — all backed by the Studio FX engine
  'tracking-in', // A7 字距展开
  'focus-in', // A8 聚焦显影
  'slide-blur', // A9 动感模糊滑入
  'flip-in', // A10 翻牌入场
  'back-in', // A11 纵深拉入
  'num-pop', // A5 数字弹入（逐字）
  'texts-reveal', // A12 多行浮现
  'clip-wipe', // 裁切揭示
] as const;
export type AnimName = (typeof ANIM_NAMES)[number];

// One-shot EMPHASIS gestures (data-emph) — play once when the slide becomes active,
// on an already-visible element. Library category C (tada/headshake/…). Backed by
// the Studio FX engine (#deck .slide.sm-play [data-emph="…"]).
export const EMPH_NAMES = [
  'none',
  'tada', // C1 嗒哒
  'rubber-band', // C2 橡皮筋
  'jello', // C3 果冻
  'heartbeat', // C4 心跳
  'headshake', // C5 摇头
  'shake', // C6 抖动
  'text-pop', // C7 抬字
] as const;
export type EmphName = (typeof EMPH_NAMES)[number];

// One-shot EXIT animations (play on the OUTGOING slide when you navigate away).
// Mirror of ANIM_NAMES; carried on [data-anim-out]. The deck's nav is intercepted
// (Studio FX driver) so the leaving slide stays visible long enough to animate out.
export const ANIM_OUT_NAMES = [
  'none',
  'fade-out', // 淡出
  'sink', // 下沉淡出
  'zoom-out', // 缩小淡出
  'out-left', // 向左退出
  'out-right', // 向右退出
] as const;
export type AnimOutName = (typeof ANIM_OUT_NAMES)[number];

// Continuous / looping MOTION effects (run while the slide is shown). Ported
// from keynote.html (kl-breathe 呼吸灯, neon-flicker, em-stress) + huashu
// (breathe, float, pulse). A growing library — add a name here + CSS keyframe
// in runtime/core.css to extend.
export const MOTION_NAMES = [
  'none',
  'glow', // 呼吸灯：accent 发光呼吸 (keynote kl-breathe)
  'breathe', // 缩放呼吸：轻微放大缩小 (huashu breathe)
  'float', // 漂浮：上下浮动
  'pulse', // 闪烁：透明度脉冲
  'neon', // 霓虹微闪 (keynote neon-flicker)
  'stress', // 强调脉冲：周期性放大点睛 (keynote a-em-stress)
  'shimmer', // 流光溢彩：文字镂空彩虹液态流动
  'ken-burns', // 缓慢推拉：图片/背景持续缩放平移 (Ken Burns)
] as const;
export type MotionName = (typeof MOTION_NAMES)[number];

export const BUILD_MODES = ['all', 'by-item', 'by-step'] as const;
export type BuildMode = (typeof BUILD_MODES)[number];

export const TRANSITIONS = ['none', 'fade', 'slide', 'auto-animate'] as const;
export type Transition = (typeof TRANSITIONS)[number];

// Structured transcript blocks (transcript-only; never rendered on the deck).
// Inherited from the transcripts_html skill semantics: cue=讲法提示(不念读),
// golden=金句(想让全场记住), data=关键数据. (See ARCHITECTURE.md §3.3.)
export const NOTE_KINDS = ['cue', 'golden', 'data'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const SUPPORTED_IR_VERSIONS = ['1.0'] as const;
