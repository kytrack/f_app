const tokens = require('./design-tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: tokens.colors,
      borderRadius: { xl: '16px', '2xl': '24px' },
    },
  },
  plugins: [],
};
