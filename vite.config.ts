import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // bind 0.0.0.0 so the live preview can reach it
    port: 5173,
    allowedHosts: true, // allow the sandbox preview proxy hosts
  },
});
