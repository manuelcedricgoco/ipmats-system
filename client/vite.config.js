
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],

    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: false,
        },
      },
    },

    preview: {
      port: 4173,
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
        },
      },
    },

    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            supabase: ['@supabase/supabase-js'],
            map: ['leaflet', 'react-leaflet'],
            charts: ['chart.js', 'react-chartjs-2'],
          },
        },
      },
    },

    test: {
      environment: 'node',
    },
  };
});
