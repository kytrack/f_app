/**
 * Design tokens – the single source of colors. Consumed by tailwind.config.js (className)
 * and by src/ui/tokens.ts (the few places that need a raw value: tab tint, progress bars).
 *
 * Light: soft lavender-grey canvas, white cards, deep ink.
 * Dark:  near-black blue canvas, raised slate cards with a hairline border, a brighter
 *        accent so it keeps contrast on dark surfaces.
 */
module.exports = {
  colors: {
    accent: { DEFAULT: '#6C5CE7', soft: '#EEEBFF', dark: '#9D8CFF', 'soft-dark': '#221E3F' },
    hero: { DEFAULT: '#6C5CE7', dark: '#2A2360' },
    success: { DEFAULT: '#1FB866', dark: '#3DDC84' },
    warn: { DEFAULT: '#E8930C', dark: '#FFB84D' },
    danger: { DEFAULT: '#E5484D', dark: '#FF6B70' },
    surface: { DEFAULT: '#FFFFFF', dark: '#14161F', raised: '#F9F9FD', 'raised-dark': '#1B1E2A' },
    canvas: { DEFAULT: '#F3F4FA', dark: '#0A0B10' },
    ink: { DEFAULT: '#171A26', muted: '#667085', dark: '#ECEEF5', 'dark-muted': '#8E94A8' },
    line: { DEFAULT: '#E4E6F0', dark: '#262A3B' },
  },
};
