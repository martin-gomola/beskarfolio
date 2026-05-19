/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{ts,tsx}',
    './index.html'
  ],
  theme: {
    extend: {
      screens: {
        'xs': '480px',  // Extra small breakpoint for mobile optimization
      },
      fontFamily: {
        heading: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // Surfaces — dark green-tinted to complement accent
        surface: {
          DEFAULT: '#0f1c14',  // body background (dark forest)
          elevated: '#1e2422', // inputs, dropdowns, solid card fallback
          dark: '#0f1312',     // modal overlays, deepest layer
        },
        // Forest green accent — readable contrast on deep black
        accent: {
          300: '#6ee7a0',  // lightest highlights
          400: '#3dd68c',  // text on dark bg (~10:1 contrast)
          500: '#22c55e',  // borders, focus rings
          600: '#15803d',  // primary buttons (5.2:1 white text contrast)
          700: '#166534',  // hover / pressed (6.8:1 contrast)
          800: '#14532d',  // deep
          900: '#052e16',  // deepest
        },
        // Semantic status colors — unified gain/loss pair for all performance values
        gain: '#34d399',       // positive returns (emerald-400)
        loss: '#fb7185',       // negative returns (rose-400)
        // Chart elements
        chart: {
          axis: '#6b7280',     // gray-500
          grid: '#374151',     // gray-700
        },
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        // ~150ms crossfade; global prefers-reduced-motion rule in index.css
        // already shortens animation-duration to near-zero when requested.
        'fade-in': 'fade-in 150ms ease-out',
      },
    },
  },
  plugins: [],
}