// eslint-disable-next-line @typescript-eslint/no-require-imports
const tokens = require('../../design-tokens') as {
  colors: {
    accent: { DEFAULT: string; soft: string; dark: string };
    success: string;
    warn: string;
    danger: string;
    surface: { DEFAULT: string; dark: string };
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
    accent: dark ? colors.accent.dark : colors.accent.DEFAULT,
    text: dark ? colors.ink.dark : colors.ink.DEFAULT,
    muted: dark ? colors.ink['dark-muted'] : colors.ink.muted,
    surface: dark ? colors.surface.dark : colors.surface.DEFAULT,
    canvas: dark ? colors.canvas.dark : colors.canvas.DEFAULT,
    line: dark ? colors.line.dark : colors.line.DEFAULT,
    success: colors.success,
    warn: colors.warn,
    danger: colors.danger,
  };
}
