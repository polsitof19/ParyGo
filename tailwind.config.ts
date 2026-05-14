import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FAFAF8',
        'bg-cream': '#F5F2EB',
        'bg-cream-deep': '#EFEAE0',
        fg: '#0A0A0A',
        'fg-muted': '#6B6B68',
        'fg-dim': '#8A8A85',
        border: {
          DEFAULT: '#E8E6E0',
          dark: '#1F1F1D',
        },
        accent: {
          terra: '#E85D3C',
          blue: '#2E5BFF',
          green: '#1F8A5B',
        },
        'bg-dark': '#0A0A0A',
        'fg-dark': '#FAFAF8',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-instrument-serif)', 'Times New Roman', 'serif'],
        mono: ['var(--font-jetbrains-mono)', 'JetBrains Mono', 'monospace'],
      },
      fontSize: {
        eyebrow: ['11px', { lineHeight: '1', letterSpacing: '0.18em' }],
      },
      letterSpacing: {
        tightest: '-0.045em',
        tighter: '-0.035em',
        tightish: '-0.02em',
        wider: '0.18em',
      },
      maxWidth: {
        wrap: '1440px',
      },
      transitionTimingFunction: {
        editorial: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        bob: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(4px)' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
        'spin-reverse': {
          to: { transform: 'rotate(-360deg)' },
        },
      },
      animation: {
        'soft-pulse': 'pulse 2.4s ease-in-out infinite',
        bob: 'bob 2.6s ease-in-out infinite',
        'spin-slow': 'spin 24s linear infinite',
        'spin-reverse-slow': 'spin-reverse 24s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
