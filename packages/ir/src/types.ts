import type { z } from 'zod';
import type {
  StyleSchema,
  BuildSchema,
  BlockSchema,
  LeafBlockSchema,
  GroupBlockSchema,
  NoteBlockSchema,
  SlideSchema,
  DeckSchema,
  DefaultsSchema,
  MetadataSchema,
} from './schema';

export type Style = z.infer<typeof StyleSchema>;
export type Build = z.infer<typeof BuildSchema>;
export type Block = z.infer<typeof BlockSchema>;
export type LeafBlock = z.infer<typeof LeafBlockSchema>;
export type GroupBlock = z.infer<typeof GroupBlockSchema>;
export type NoteBlock = z.infer<typeof NoteBlockSchema>;
export type Slide = z.infer<typeof SlideSchema>;
export type Deck = z.infer<typeof DeckSchema>;
export type Defaults = z.infer<typeof DefaultsSchema>;
export type Metadata = z.infer<typeof MetadataSchema>;
export type BlockType = Block['type'];
