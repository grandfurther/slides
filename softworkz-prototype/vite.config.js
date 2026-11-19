import { defineConfig } from 'vite';

// Strict port: if 8111 is taken the server exits instead of silently moving.
export default defineConfig({
  server: { host: 'localhost', port: 8111, strictPort: true },
  preview: { host: 'localhost', port: 8111, strictPort: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
