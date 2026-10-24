/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#101828', 800: '#1B2536', 700: '#2A3548' },
        sun: { DEFAULT: '#FFC928', soft: '#FFF3CC' },
        mist: '#F2F4F7',
        sos: '#E5352B',
        live: '#16A34A',
      },
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'] },
      borderRadius: { card: '20px' },
    },
  },
  plugins: [],
}
