import { zodToJsonSchema } from 'zod-to-json-schema';
import { DeckSchema } from './schema';

/**
 * Export the Deck IR as a standard JSON Schema, so external agents/tools can
 * validate or autocomplete IR without depending on this package.
 */
export function deckJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(DeckSchema, { name: 'SlidesmithDeck' }) as Record<string, unknown>;
}
