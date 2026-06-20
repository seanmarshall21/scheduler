/** @type {import('tailwindcss').Config} */
// Commons skin — a WARMER, home-y reskin of CRFTD's bento system. We keep the
// structural token NAMES (forest scale, surface, text) so the cd- component
// classes port over unchanged, but retint them warm: oat-paper canvas, warm
// charcoal ink, terracotta accent (replacing CRFTD's lime). Per-person hues
// live under `person`; calendar block categories under `cat`.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['DM Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // Neutral ramp — kept the legacy `forest` name so cd- classes retheme
        // in place. Warm-tinted charcoals; 600/700 are the action grades.
        forest: {
          50: '#f7f3ec',
          100: '#efe8dc',
          200: '#e2d8c7',
          300: '#cbbda6',
          400: '#a89a82',
          500: '#7a6f5f', // secondary icon/text
          600: '#544d42', // action
          700: '#37322b', // warm charcoal — primary action / strong
          800: '#2a2620',
          900: '#37322b',
          950: '#211d18',
        },
        ink: '#37322b',
        // Terracotta accent — the warm equivalent of CRFTD's lime. Active
        // markers, "today" dot, primary highlights.
        accent2: {
          DEFAULT: '#e08a3c',
          text: '#b96a22',
          tint: 'rgba(224, 138, 60, 0.15)',
        },
        // Oat-paper surfaces — warm whites on a soft canvas.
        surface: {
          DEFAULT: '#fffdf9',
          0: '#fffdf9',
          1: '#f8f3ea', // inner wells
          2: '#f1eadd',
          3: '#e7dccb', // tile borders
          4: '#d6c8b2',
        },
        text: {
          DEFAULT: '#37322b',
          2: '#7a6f5f',
          3: '#a89a82',
        },
        bg: '#f3ece0', // app canvas behind tiles
        border: '#e7dccb',
        accent: '#37322b', // back-compat alias for bg-accent/text-accent

        // Per-person hues — friendly, distinct at a glance across a room.
        // Members can override their own color; these are the seed defaults.
        person: {
          1: '#e0603c', // coral
          2: '#3c8fe0', // sky
          3: '#3ca06a', // fern
          4: '#9b5de5', // grape
          5: '#e0a83c', // honey
          6: '#e05c9e', // rose
        },
        // Calendar block categories (groceries, sports, date night, …).
        cat: {
          home: '#7a8b5a',
          food: '#e0a83c',
          sport: '#3c8fe0',
          school: '#9b5de5',
          social: '#e05c9e',
          travel: '#3ca6a0',
          work: '#7a6f5f',
        },
      },
      borderRadius: {
        chip: '6px',
        btn: '12px',
        card: '16px',
        modal: '20px',
        squircle: '14px',
      },
      boxShadow: {
        sm: '0 2px 5px rgba(55,50,43,0.05)',
        md: '0 4px 14px rgba(55,50,43,0.08), 0 2px 5px rgba(55,50,43,0.04)',
      },
    },
  },
  plugins: [],
};
