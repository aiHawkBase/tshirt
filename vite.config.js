import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    watch: {
      ignored: [
        '**/node_modules - Kopya/**',
        '**/dist - Kopya/**',
        '**/.git/**',
        '**/.gemini/**',
        '**/scratch/**'
      ]
    }
  }
});
