// Virtual module inlined at build time by scripts/build-studio.mjs.
// The 21 editorial-slides skins as injectable CSS bundles, for the Studio's 换皮 dropdown.
declare module '@slidesmith/skins' {
  export interface SkinBundle { css: string; font: string; label: string; dark: boolean; }
  export const SKINS: Record<string, SkinBundle>;
  export const SKIN_ORDER: string[];
}
