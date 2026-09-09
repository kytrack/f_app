/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Design tokens – 1 accent + 3 semantic. Adjust here, nowhere else.
        accent: { DEFAULT: '#6C5CE7', soft: '#EDEAFD', dark: '#A29BFE' },
        success: '#2ECC71',
        warn: '#F39C12',
        danger: '#E74C3C',
        surface: { DEFAULT: '#FFFFFF', dark: '#151821' },
        canvas: { DEFAULT: '#F5F6FA', dark: '#0B0D12' },
        ink: { DEFAULT: '#1B1F2A', muted: '#6B7280', dark: '#E6E8EF', 'dark-muted': '#9AA0AE' },
      },
      borderRadius: { xl: '16px', '2xl': '24px' },
    },
  },
  plugins: [],
};
