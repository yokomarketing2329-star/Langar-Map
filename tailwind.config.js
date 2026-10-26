/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        saffron: { DEFAULT: '#FF8C00', dark: '#E07B00', light: '#FFF1DC' },
        seva: { DEFAULT: '#16803C', dark: '#0F6630', light: '#E4F5EA' },
        cream: '#FFFBF3',
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans Devanagari', 'Noto Sans Gurmukhi', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
