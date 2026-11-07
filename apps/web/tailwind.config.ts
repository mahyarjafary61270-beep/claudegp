import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--bg-base)',
        surface: 'var(--bg-surface)',
        panel: 'var(--bg-panel)',
        line: 'var(--border-line)',
        text: 'var(--text)',
        subtle: 'var(--text-subtle)',
        accent: 'var(--accent)',
        'accent-2': 'var(--accent-2)',
        'accent-3': 'var(--accent-3)',
      },
      fontFamily: {
        sans: ['Vazirmatn', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        glow: '0 0 24px -6px var(--accent-glow)',
        'glow-sm': '0 0 12px -4px var(--accent-glow)',
      },
    },
  },
  plugins: [],
} satisfies Config;
