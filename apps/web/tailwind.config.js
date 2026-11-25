/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      colors: {
        brand: {
          primary: 'var(--brand-primary, #0F172A)',
          secondary: 'var(--brand-secondary, #334155)',
          bg: 'var(--brand-bg, #FFFFFF)',
        },
      },
    },
  },
  plugins: [],
};
