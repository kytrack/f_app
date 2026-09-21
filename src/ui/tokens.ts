// eslint-disable-next-line @typescript-eslint/no-require-imports
const tokens = require('../../design-tokens') as {
  colors: {
    accent: { DEFAULT: string; soft: string; dark: string; 'soft-dark': string };
    hero: { DEFAULT: string; dark: string };
    success: { DEFAULT: string; dark: string };
    warn: { DEFAULT: string; dark: string };
    danger: { DEFAULT: string; dark: string };
    surface: { DEFAULT: string; dark: string; raised: string; 'raised-dark': string };
    canvas: { DEFAULT: string; dark: string };
    ink: { DEFAULT: string; muted: string; dark: string; 'dark-muted': string };
    line: { DEFAULT: string; dark: string };
  };
};

export const colors = tokens.colors;

/** Raw values for props that cannot take a className (tintColor, progress fills…). */
export function palette(scheme: 'light' | 'dark') {
  const dark = scheme === 'dark';
  return {
    scheme,
    accent: dark ? colors.accent.dark : colors.accent.DEFAULT,
    accentSoft: dark ? colors.accent['soft-dark'] : colors.accent.soft,
    hero: dark ? colors.hero.dark : colors.hero.DEFAULT,
    text: dark ? colors.ink.dark : colors.ink.DEFAULT,
    muted: dark ? colors.ink['dark-muted'] : colors.ink.muted,
    surface: dark ? colors.surface.dark : colors.surface.DEFAULT,
    raised: dark ? colors.surface['raised-dark'] : colors.surface.raised,
    canvas: dark ? colors.canvas.dark : colors.canvas.DEFAULT,
    line: dark ? colors.line.dark : colors.line.DEFAULT,
    success: dark ? colors.success.dark : colors.success.DEFAULT,
    warn: dark ? colors.warn.dark : colors.warn.DEFAULT,
    danger: dark ? colors.danger.dark : colors.danger.DEFAULT,
  };
}
