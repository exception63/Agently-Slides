import { DeckSchema } from './schema';
import { LAYOUTS, DEFAULT_LAYOUT, isKnownLayout, slotContract } from './layouts';
import { SUPPORTED_IR_VERSIONS } from './tokens';
import { deriveAnchors } from './anchors';
import type { Deck, Block } from './types';

export interface ValidationError {
  /** dotted path to the offending node, e.g. `slides.2.slots.left.0.style.color` */
  path: string;
  message: string;
  /** machine-readable code, e.g. `id.duplicate`, `layout.unknown` */
  code: string;
}

export type ValidateResult =
  | { ok: true; ir: Deck; anchors: string[] }
  | { ok: false; errors: ValidationError[] };

function collectBlockIds(
  blocks: Block[],
  path: string,
  out: Array<{ id: string; path: string }>,
): void {
  blocks.forEach((b, i) => {
    const p = `${path}[${i}]`;
    out.push({ id: b.id, path: p });
    if (b.type === 'group') {
      collectBlockIds(b.children as Block[], `${p}.children`, out);
    }
  });
}

/**
 * Validate an unknown value as a Slidesmith Deck IR.
 * Returns the parsed IR + derived anchors on success, or a list of
 * readable errors. Combines Zod structural validation with semantic checks
 * (version support, id uniqueness, layout/slot contracts).
 */
export function validateDeck(input: unknown): ValidateResult {
  const errors: ValidationError[] = [];

  const parsed = DeckSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({
        path: issue.path.length ? issue.path.join('.') : '(root)',
        message: issue.message,
        code: `schema.${issue.code}`,
      });
    }
    return { ok: false, errors };
  }

  const ir = parsed.data;

  // ir_version supported
  const supported: readonly string[] = SUPPORTED_IR_VERSIONS;
  if (!supported.includes(ir.ir_version)) {
    errors.push({
      path: 'ir_version',
      message: `Unsupported ir_version "${ir.ir_version}". Supported: ${supported.join(', ')}.`,
      code: 'version.unsupported',
    });
  }

  // unique slide ids
  const slideIds = new Map<string, number>();
  ir.slides.forEach((s, i) => {
    const seen = slideIds.get(s.id);
    if (seen !== undefined) {
      errors.push({
        path: `slides[${i}].id`,
        message: `Duplicate slide id "${s.id}" (first seen at slides[${seen}]).`,
        code: 'id.duplicate',
      });
    } else {
      slideIds.set(s.id, i);
    }
  });

  // unique block ids (global, including group children)
  const blockIds = new Map<string, string>();
  ir.slides.forEach((s, i) => {
    for (const [slot, blocks] of Object.entries(s.slots)) {
      const collected: Array<{ id: string; path: string }> = [];
      collectBlockIds(blocks as Block[], `slides[${i}].slots.${slot}`, collected);
      for (const { id, path } of collected) {
        const seen = blockIds.get(id);
        if (seen !== undefined) {
          errors.push({
            path,
            message: `Duplicate block id "${id}" (first seen at ${seen}).`,
            code: 'id.duplicate',
          });
        } else {
          blockIds.set(id, path);
        }
      }
    }
  });

  // layout known + slot contract honored
  ir.slides.forEach((s, i) => {
    const layout = s.layout ?? ir.defaults?.layout ?? DEFAULT_LAYOUT;
    if (!isKnownLayout(layout)) {
      errors.push({
        path: `slides[${i}].layout`,
        message: `Unknown layout "${layout}". Known: ${Object.keys(LAYOUTS).join(', ')}.`,
        code: 'layout.unknown',
      });
      return;
    }
    const contract = slotContract(layout) ?? [];
    for (const slotKey of Object.keys(s.slots)) {
      if (!contract.includes(slotKey)) {
        errors.push({
          path: `slides[${i}].slots.${slotKey}`,
          message: `Slot "${slotKey}" is not allowed by layout "${layout}". Allowed: ${contract.join(', ') || '(none)'}.`,
          code: 'slot.unknown',
        });
      }
    }
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, ir, anchors: deriveAnchors(ir) };
}
