/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Public Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        // Primary: deep government navy
        brand: {
          50: '#eef4fb', 100: '#d6e4f4', 200: '#adc8e8', 300: '#7ea6d8', 400: '#4f80c2',
          500: '#2f62a8', 600: '#214c8a', 700: '#1a3d70', 800: '#142f57', 900: '#0b2545', 950: '#071833',
        },
        // Accent: DPWH safety amber (used sparingly)
        accent: { 50: '#fff8e6', 100: '#feedbf', 300: '#fbcf5c', 400: '#f6b92b', 500: '#e9a110', 600: '#c47f08', 700: '#9a5f0b' },
        // Flag semantics
        flag: { green: '#1f8a4c', yellow: '#d39b0b', red: '#c8372d' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,37,69,0.06), 0 1px 3px rgba(11,37,69,0.08)',
        'card-hover': '0 4px 6px -2px rgba(11,37,69,0.06), 0 12px 24px -8px rgba(11,37,69,0.16)',
        panel: '0 10px 30px -10px rgba(11,37,69,0.35)',
        popover: '0 4px 6px -4px rgba(11,37,69,0.1), 0 16px 40px -12px rgba(11,37,69,0.28)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'page-in': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.96) translateY(4px)' }, to: { opacity: '1', transform: 'scale(1) translateY(0)' } },
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'slide-in-right': { from: { opacity: '0', transform: 'translateX(24px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        'slide-in-left': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        'toast-in': { from: { opacity: '0', transform: 'translateY(12px) scale(0.98)' }, to: { opacity: '1', transform: 'translateY(0) scale(1)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        authZoom: { from: { transform: 'scale(1)' }, to: { transform: 'scale(1.06)' } },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out both',
        'page-in': 'page-in 260ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-in': 'scale-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-up': 'slide-up 300ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in-right': 'slide-in-right 280ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in-left': 'slide-in-left 260ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'toast-in': 'toast-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.4s infinite',
      },
    },
  },
  plugins: [],
};
