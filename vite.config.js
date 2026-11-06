import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './', // relative asset paths: works at / and under a sub-path such as /game/
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
});
