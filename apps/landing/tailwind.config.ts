import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#050508',
        surface: '#0D0D14',
        card: '#14141C',
        hover: '#1F1F2A',
        border: {
          DEFAULT: '#2A2A38',
          strong: '#4A4A5C',
        },
        fg: {
          DEFAULT: '#FFFFFF',
          2: '#B4B4C0',
          3: '#6B6B7A',
        },
        magenta: {
          DEFAULT: '#FF1F8F',
          dim: 'rgba(255,31,143,0.45)',
        },
        cyan: {
          DEFAULT: '#00E5FF',
          dim: 'rgba(0,229,255,0.4)',
        },
        green: '#00FF88',
        yellow: '#FFE600',
        red: '#FF4566',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-anton)', 'Bebas Neue', 'Impact', 'sans-serif'],
        serif: ['var(--font-instrument-serif)', 'Times New Roman', 'serif'],
        mono: ['var(--font-jetbrains-mono)', 'JetBrains Mono', 'monospace'],
      },
      maxWidth: {
        wrap: '1320px',
      },
      transitionTimingFunction: {
        editorial: 'cubic-bezier(0.16, 1, 0.3, 1)',
        bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        'pulse-g': {
          '0%': {
            boxShadow:
              '0 0 0 0 rgba(0,255,136,0.5), 0 0 10px #00FF88',
          },
          '70%': {
            boxShadow:
              '0 0 0 10px rgba(0,255,136,0), 0 0 10px #00FF88',
          },
          '100%': {
            boxShadow:
              '0 0 0 0 rgba(0,255,136,0), 0 0 10px #00FF88',
          },
        },
        'pulse-m': {
          '0%': {
            boxShadow:
              '0 0 0 0 rgba(255,31,143,0.6), 0 0 10px #FF1F8F',
          },
          '70%': {
            boxShadow:
              '0 0 0 10px rgba(255,31,143,0), 0 0 10px #FF1F8F',
          },
          '100%': {
            boxShadow:
              '0 0 0 0 rgba(255,31,143,0), 0 0 10px #FF1F8F',
          },
        },
        'pulse-c': {
          '0%': {
            boxShadow:
              '0 0 0 0 rgba(0,229,255,0.6), 0 0 10px #00E5FF',
          },
          '70%': {
            boxShadow:
              '0 0 0 10px rgba(0,229,255,0), 0 0 10px #00E5FF',
          },
          '100%': {
            boxShadow:
              '0 0 0 0 rgba(0,229,255,0), 0 0 10px #00E5FF',
          },
        },
        bar: {
          '0%': { transform: 'scaleY(0.3)' },
          '100%': { transform: 'scaleY(1)' },
        },
        bob: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(3px)' },
        },
        'mesh-drift': {
          '0%, 100%': { transform: 'translate(0,0) scale(1)' },
          '50%': { transform: 'translate(2%, -2%) scale(1.04)' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'pulse-g': 'pulse-g 2.2s cubic-bezier(0.16,1,0.3,1) infinite',
        'pulse-m': 'pulse-m 2.4s cubic-bezier(0.16,1,0.3,1) infinite',
        'pulse-c': 'pulse-c 2.4s cubic-bezier(0.16,1,0.3,1) infinite',
        bar: 'bar 1.2s ease-in-out infinite alternate',
        bob: 'bob 2.4s ease-in-out infinite',
        'mesh-drift': 'mesh-drift 180s linear infinite',
        'spin-slow': 'spin 14s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
