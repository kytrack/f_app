/**
 * Design tokens – the single source of colors. Consumed by tailwind.config.js (className)
 * and by src/ui/tokens.ts (the few places that need a raw value: tab tint, progress bars).
 */
module.exports = {
  colors: {
    accent: { DEFAULT: '#6C5CE7', soft: '#EDEAFD', dark: '#A29BFE' },
    success: '#2ECC71',
    warn: '#F39C12',
    danger: '#E74C3C',
    surface: { DEFAULT: '#FFFFFF', dark: '#151821' },
    canvas: { DEFAULT: '#F5F6FA', dark: '#0B0D12' },
    ink: { DEFAULT: '#1B1F2A', muted: '#6B7280', dark: '#E6E8EF', 'dark-muted': '#9AA0AE' },
    line: { DEFAULT: '#E5E7EB', dark: '#262B38' },
  },
};
