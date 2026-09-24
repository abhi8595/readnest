/**
 * ReadNest semantic theme tokens — single source of truth for TS code
 * (mirrors global.css @theme for NativeWind classes).
 * Pro-rules: no raw hex in components; always import from here.
 */

export type ColorScheme = 'light' | 'dark';
export type ReaderThemeId = 'day' | 'sepia' | 'night' | 'console' | 'oled' | 'eink';

export interface AppPalette {
  background: string;
  surface: string;
  surface2: string;
  foreground: string;
  muted: string;
  faint: string;
  primary: string;
  onPrimary: string;
  secondary: string;
  accent: string;
  gold: string;
  goldDeep: string;
  onGold: string;
  border: string;
  ring: string;
  destructive: string;
  scrim: string;
  /** Generated-cover fallback (deep brown — white text passes 4.5:1). */
  coverBg: string;
  onCoverBg: string;
}

export const lightPalette: AppPalette = {
  background: '#FBF7F0',
  surface: '#FFFFFF',
  surface2: '#F3EDE2',
  foreground: '#1E1B16',
  muted: '#6B6357',
  faint: '#8A8175',
  primary: '#C4623A',
  onPrimary: '#FFFFFF',
  secondary: '#7C9070',
  accent: '#8C3B1B',
  gold: '#C9A227',
  goldDeep: '#8C6A1F',
  onGold: '#1E1B16',
  border: '#E3DACA',
  ring: '#C4623A',
  destructive: '#B3261E',
  scrim: 'rgba(30,27,22,0.55)',
  coverBg: '#5C2E14',
  onCoverBg: '#FFF7EA',
};

export const darkPalette: AppPalette = {
  background: '#1C1A17',
  surface: '#26221D',
  surface2: '#2E2924',
  foreground: '#F3EDE2',
  muted: '#C9BFAE',
  faint: '#9A9081',
  primary: '#E08A5B',
  onPrimary: '#1C1A17',
  secondary: '#9DB493',
  accent: '#F0B48A',
  gold: '#E3C178',
  goldDeep: '#E3C178',
  onGold: '#1C1A17',
  border: '#3A342C',
  ring: '#E08A5B',
  destructive: '#F2A49E',
  scrim: 'rgba(0,0,0,0.65)',
  coverBg: '#3A2415',
  onCoverBg: '#FFF7EA',
};

export interface ReaderTheme {
  id: ReaderThemeId;
  label: string;
  bg: string;
  text: string;
  muted: string;
  accent: string;
}

export const readerThemes: Record<ReaderThemeId, ReaderTheme> = {
  day: { id: 'day', label: 'Day', bg: '#FBF7F0', text: '#1E1B16', muted: '#6B6357', accent: '#C4623A' },
  sepia: { id: 'sepia', label: 'Sepia', bg: '#F4E8D0', text: '#433422', muted: '#7A6A54', accent: '#8C5A1E' },
  night: { id: 'night', label: 'Night', bg: '#1C1A17', text: '#E8E0D2', muted: '#A89D8A', accent: '#E08A5B' },
  console: { id: 'console', label: 'Console', bg: '#0E1A12', text: '#B8E6B8', muted: '#8FC08F', accent: '#7CE68A' },
  oled: { id: 'oled', label: 'OLED', bg: '#000000', text: '#E8E0D2', muted: '#A89D8A', accent: '#E08A5B' },
  // D3 — E-ink: pure black/white, no translucency. Animations are disabled
  // in readerHtml when this theme is active (reduce-motion parity).
  eink: { id: 'eink', label: 'E-Ink', bg: '#FFFFFF', text: '#000000', muted: '#444444', accent: '#000000' },
};

/** D2 — Irlen / tint overlays for focus & dyslexia comfort. `overlay` is
 * painted as a full-page, pointer-events:none wash inside the reader
 * WebView (low opacity so text stays WCAG-readable). */
export type IrlenTintId = 'none' | 'rose' | 'peach' | 'mint' | 'sky' | 'lavender' | 'grey';

export interface IrlenTint {
  id: IrlenTintId;
  label: string;
  /** Wash color (incl. alpha) painted over the page. */
  overlay: string | null;
}

export const irlenTints: IrlenTint[] = [
  { id: 'none', label: 'None', overlay: null },
  { id: 'rose', label: 'Rose', overlay: 'rgba(244,194,194,0.22)' },
  { id: 'peach', label: 'Peach', overlay: 'rgba(255,218,185,0.24)' },
  { id: 'mint', label: 'Mint', overlay: 'rgba(189,236,196,0.22)' },
  { id: 'sky', label: 'Sky', overlay: 'rgba(174,214,241,0.22)' },
  { id: 'lavender', label: 'Lavender', overlay: 'rgba(216,191,245,0.20)' },
  { id: 'grey', label: 'Grey', overlay: 'rgba(128,128,128,0.16)' },
];

/** D1 — Focus reading mode. `off` = normal; otherwise dim everything
 * except the active sentence/paragraph (manual step-through, no TTS needed). */
export type FocusMode = 'off' | 'sentence' | 'paragraph';

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { chip: 8, card: 12, sheet: 16, player: 20 } as const;

/** Icon sizes (Lucide, strokeWidth 1.5 everywhere) */
export const iconSize = { sm: 16, md: 20, lg: 24, xl: 32 } as const;
export const iconStroke = 1.5 as const;

/** Motion tokens (ms) — exit ≈ 65% of enter; disabled when reduce-motion */
export const motion = {
  instant: 80,
  quick: 150,
  base: 220,
  emphasis: 320,
  stagger: 40,
} as const;

/** Touch targets */
export const touch = { minIOS: 44, minAndroid: 48, hitSlop: 10 } as const;

export const typeScale = { caption: 12, bodySm: 14, body: 16, lead: 18, title: 20, h3: 24, h2: 32 } as const;

export type ReaderFontId = 'crimson' | 'baskerville' | 'atkinson' | 'inter' | 'system' | 'custom';

export interface ReaderFont {
  id: ReaderFontId;
  label: string;
  family: string;
  premium?: boolean;
}

export const readerFonts: ReaderFont[] = [
  { id: 'crimson', label: 'Crimson (Serif)', family: 'CrimsonPro' },
  { id: 'baskerville', label: 'Baskerville (Classic)', family: 'LibreBaskerville' },
  { id: 'atkinson', label: 'Atkinson (Accessible)', family: 'AtkinsonHyperlegible' },
  { id: 'inter', label: 'Inter (Clean)', family: 'Inter' },
  { id: 'system', label: 'System', family: 'System' },
  { id: 'custom', label: 'Custom upload', family: 'CustomUpload', premium: true },
];

/** Highlight colors — first 4 free, rest Premium */
export const highlightColors = [
  { id: 'amber', value: '#F5C443', premium: false },
  { id: 'terracotta', value: '#E08A5B', premium: false },
  { id: 'sage', value: '#9DB493', premium: false },
  { id: 'rose', value: '#E39AA4', premium: false },
  { id: 'sky', value: '#8FC1E3', premium: true },
  { id: 'violet', value: '#B79CED', premium: true },
  { id: 'mint', value: '#8FE3B0', premium: true },
  { id: 'coral', value: '#F1948A', premium: true },
] as const;

export function paletteFor(scheme: ColorScheme): AppPalette {
  return scheme === 'dark' ? darkPalette : lightPalette;
}
