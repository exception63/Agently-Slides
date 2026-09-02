// Slidesmith Studio — a fully client-side editor bundled into one HTML file.
// Open it (file:// or http), import a contract HTML deck, edit Keynote-style, then
// "保存" to overwrite the opened file in place (File System Access API; first save
// picks the file once, then one-click overwrite). "导出 PDF" for a shareable artifact.
// No server, no CLI.
import {
  validateDeck,
  LAYOUTS,
  ANIM_NAMES,
  ANIM_OUT_NAMES,
  MOTION_NAMES,
  EMPH_NAMES,
  COLOR_TOKENS,
  SIZE_TOKENS,
  ALIGN_TOKENS,
  WEIGHT_TOKENS,
} from '@slidesmith/ir';
import type { Deck, Block, Slide, NoteBlock } from '@slidesmith/ir';
import { parseMarkdownToIR } from '@slidesmith/parser-md';
import { renderDeckHtml } from '@slidesmith/engine';
import { listThemes } from '@slidesmith/themes';
import { galleryHtml } from '@slidesmith/anim-gallery';
import { fxCanvasJs } from '@slidesmith/fx-canvas';
import { cloudRelay as PR_CLOUD, relayOptions as PR_RELAYS, qrLibJs, pairClientJs } from '@slidesmith/phone-remote';
import { SKINS, SKIN_ORDER } from '@slidesmith/skins';

