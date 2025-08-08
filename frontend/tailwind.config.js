/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        xs: '475px',
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        dark: {
          primary: '#b794f6',           // Brighter, more vibrant purple
          'primary-content': '#ffffff',
          secondary: '#ec4899',         // Pink
          'secondary-content': '#ffffff',
          accent: '#14b8a6',           // Teal
          'accent-content': '#ffffff',
          neutral: '#374151',          // Gray
          'neutral-content': '#e5e7eb',
          'base-100': '#0a0a0f',       // Very deep dark background
          'base-200': '#121218',       // Slightly lighter panels
          'base-300': '#1a1a24',       // Elevated surfaces
          'base-content': '#f3f4f6',   // Light text
          info: '#3b82f6',
          'info-content': '#ffffff',
          success: '#10b981',
          'success-content': '#ffffff',
          warning: '#f59e0b',
          'warning-content': '#ffffff',
          error: '#ef4444',
          'error-content': '#ffffff',
        },
      },
    ],
    darkTheme: 'dark',
    base: false,
    styled: true,
    utils: true,
    prefix: '',
    logs: false,
    themeRoot: ':root',
  },
}