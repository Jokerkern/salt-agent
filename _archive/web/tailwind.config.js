/** @type {import('tailwindcss').Config} */

/** Helper: wrap an RGB-triplet CSS var for Tailwind opacity support */
const rgb = (varName) => `rgb(var(--${varName}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          0: rgb('surface-0'),
          1: rgb('surface-1'),
          2: rgb('surface-2'),
          3: rgb('surface-3'),
          4: rgb('surface-4'),
          5: rgb('surface-5'),
        },
        text: {
          primary: rgb('text-primary'),
          secondary: rgb('text-secondary'),
          muted: rgb('text-muted'),
          faint: rgb('text-faint'),
        },
        accent: {
          DEFAULT: rgb('accent'),
          light: rgb('accent-light'),
          dark: rgb('accent-dark'),
          muted: 'var(--accent-muted)',
          border: 'var(--accent-border)',
        },
        status: {
          success: rgb('status-success'),
          'success-muted': 'var(--status-success-muted)',
          'success-border': 'var(--status-success-border)',
          error: rgb('status-error'),
          'error-muted': 'var(--status-error-muted)',
          'error-border': 'var(--status-error-border)',
          warning: rgb('status-warning'),
          'warning-muted': 'var(--status-warning-muted)',
          'warning-border': 'var(--status-warning-border)',
        },
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'slide-in': 'slideIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
