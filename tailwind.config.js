/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Sentinel brand colors
        fire: {
          50:  '#fff8ed',
          100: '#ffefd4',
          200: '#ffdba8',
          300: '#ffc171',
          400: '#ff9938',
          500: '#ff7410',
          600: '#ff5a00',  // primary orange
          700: '#cc3d02',
          800: '#a13109',
          900: '#822a0c',
        },
        // Sentinel grays resolve through CSS variables (defined in index.css)
        // so the marketing site can swap in a light palette. The app keeps
        // the dark defaults and themes itself with `dark:` variants.
        sentinel: {
          900: 'rgb(var(--sentinel-900) / <alpha-value>)',
          850: 'rgb(var(--sentinel-850) / <alpha-value>)', // marketing section backdrop — sits close to 900 so alternating bands read as one surface
          800: 'rgb(var(--sentinel-800) / <alpha-value>)',
          700: 'rgb(var(--sentinel-700) / <alpha-value>)',
          600: 'rgb(var(--sentinel-600) / <alpha-value>)',
          500: 'rgb(var(--sentinel-500) / <alpha-value>)',
          400: 'rgb(var(--sentinel-400) / <alpha-value>)',
          300: 'rgb(var(--sentinel-300) / <alpha-value>)',
          200: 'rgb(var(--sentinel-200) / <alpha-value>)',
          100: 'rgb(var(--sentinel-100) / <alpha-value>)',
        },
      },
      // Text-only shades of the sentinel grays, nudged toward white for
      // legibility. Borders and surfaces keep the base palette above.
      textColor: {
        sentinel: {
          100: 'rgb(var(--sentinel-text-100) / <alpha-value>)',
          200: 'rgb(var(--sentinel-text-200) / <alpha-value>)',
          300: 'rgb(var(--sentinel-text-300) / <alpha-value>)',
          400: 'rgb(var(--sentinel-text-400) / <alpha-value>)',
          500: 'rgb(var(--sentinel-text-500) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-fire': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up-panel': 'slideUpPanel 0.2s ease-out',
      },
      keyframes: {
        slideUpPanel: {
          '0%': { transform: 'translateY(0.75rem)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-100%)', opacity: 0 },
          '100%': { transform: 'translateX(0)', opacity: 1 },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: 0 },
          '100%': { transform: 'translateX(0)', opacity: 1 },
        },
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
      },
    },
  },
  plugins: [],
};
