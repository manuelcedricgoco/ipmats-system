import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development the API runs on :4000; same-origin /api avoids CORS hassle.
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: false } },
  },
  preview: { port: 4173, proxy: { '/api': { target: 'http://localhost:4000' } } },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  test: { environment: 'node' },
});
