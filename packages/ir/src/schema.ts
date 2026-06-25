import { z } from 'zod';
import {
  COLOR_TOKENS,
  SIZE_TOKENS,
  ALIGN_TOKENS,
  WEIGHT_TOKENS,
  ANIM_NAMES,
  MOTION_NAMES,
  BUILD_MODES,
  TRANSITIONS,
  NOTE_KINDS,
} from './tokens';

// --- style: symbolic token references only (no inline hex/px) ---
export const StyleSchema = z
  .object({
    color: z.enum(COLOR_TOKENS).optional(),
    size: z.enum(SIZE_TOKENS).optional(),
    align: z.enum(ALIGN_TOKENS).optional(),
    weight: z.enum(WEIGHT_TOKENS).optional(),
  })
  .strict();

// --- build: declarative animation / step descriptor ---
export const BuildSchema = z
  .object({
    anim: z.enum(ANIM_NAMES).optional(), // entrance (one-shot)
    motion: z.enum(MOTION_NAMES).optional(), // continuous/looping effect
    mode: z.enum(BUILD_MODES).optional(),
    delay: z.number().min(0).optional(),
    stagger: z.number().min(0).optional(),
    step: z.number().int().min(0).optional(),
  })
  .strict();

// fields shared by every block
const blockBase = {
  id: z.string().min(1),
  style: StyleSchema.optional(),
  build: BuildSchema.optional(),
  dataId: z.string().min(1).optional(),
};

export const HeadingBlockSchema = z
  .object({ ...blockBase, type: z.literal('heading'), text: z.string(), level: z.number().int().min(1).max(3).optional() })
  .strict();
export const TextBlockSchema = z
  .object({ ...blockBase, type: z.literal('text'), text: z.string() })
  .strict();
export const ListBlockSchema = z
  .object({ ...blockBase, type: z.literal('list'), items: z.array(z.string()).min(1), ordered: z.boolean().optional() })
  .strict();
export const ImageBlockSchema = z
  .object({ ...blockBase, type: z.literal('image'), src: z.string().min(1), alt: z.string().optional(), fit: z.enum(['cover', 'contain']).optional() })
  .strict();
export const CodeBlockSchema = z
  .object({ ...blockBase, type: z.literal('code'), code: z.string(), lang: z.string().optional() })
  .strict();
export const ChartBlockSchema = z
  .object({ ...blockBase, type: z.literal('chart'), chartType: z.enum(['bar', 'line', 'pie']), data: z.unknown() })
  .strict();
export const TableBlockSchema = z
  .object({ ...blockBase, type: z.literal('table'), headers: z.array(z.string()), rows: z.array(z.array(z.string())) })
  .strict();
export const QuoteBlockSchema = z
  .object({ ...blockBase, type: z.literal('quote'), text: z.string(), cite: z.string().optional() })
  .strict();
export const EmbedBlockSchema = z
  .object({ ...blockBase, type: z.literal('embed'), html: z.string() })
  .strict();

// leaf blocks (no nesting)
export const LeafBlockSchema = z.discriminatedUnion('type', [
  HeadingBlockSchema,
  TextBlockSchema,
  ListBlockSchema,
  ImageBlockSchema,
  CodeBlockSchema,
  ChartBlockSchema,
  TableBlockSchema,
  QuoteBlockSchema,
  EmbedBlockSchema,
]);

// group allows ONE level of nesting (leaf children) in M0 — used for cards/grids.
export const GroupBlockSchema = z
  .object({
    ...blockBase,
    type: z.literal('group'),
    direction: z.enum(['row', 'col']).optional(),
    children: z.array(LeafBlockSchema).min(1),
  })
  .strict();

export const BlockSchema = z.discriminatedUnion('type', [
  HeadingBlockSchema,
  TextBlockSchema,
  ListBlockSchema,
  ImageBlockSchema,
  CodeBlockSchema,
  ChartBlockSchema,
  TableBlockSchema,
  QuoteBlockSchema,
  EmbedBlockSchema,
  GroupBlockSchema,
]);

// A structured transcript block (cue/golden/data). The plain spoken script
// lives in `slide.notes` (string); these are the extra typed cards shown
// beneath it in the transcript. `text` supports inline `**强调**` for prompting.
export const NoteBlockSchema = z
  .object({
    kind: z.enum(NOTE_KINDS),
    text: z.string(),
  })
  .strict();

export const SlideSchema = z
  .object({
    id: z.string().min(1),
    seg: z.string().optional(),
    segName: z.string().optional(),
    layout: z.string().min(1).optional(),
    transition: z.enum(TRANSITIONS).optional(),
    classRefs: z.array(z.string()).optional(),
    notes: z.string().optional(),
    noteBlocks: z.array(NoteBlockSchema).optional(),
    slots: z.record(z.string(), z.array(BlockSchema)),
  })
  .strict();

export const DefaultsSchema = z
  .object({
    transition: z.enum(TRANSITIONS).optional(),
    layout: z.string().min(1).optional(),
    lang: z.string().optional(),
  })
  .strict();

export const MetadataSchema = z
  .object({
    title: z.string().optional(),
    author: z.string().optional(),
    date: z.string().optional(),
    channel: z.string().optional(),
  })
  .strict();

export const DeckSchema = z
  .object({
    ir_version: z.string().min(1),
    theme: z.string().min(1).optional(),
    defaults: DefaultsSchema.optional(),
    metadata: MetadataSchema.optional(),
    slides: z.array(SlideSchema).min(1),
  })
  .strict();
