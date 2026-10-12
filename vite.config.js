import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

// Only browser/ is an application entry point; tmp/ is never an input to Vite.
export default defineConfig({
  root: 'browser',
  publicDir: false,
  worker: { format: 'es' },
  server: {
    fs: {
      allow: [projectRoot],
      // Git ignore rules do not control HTTP access. Also deny private files in
      // the local development server, even though shared src/ is allowed.
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/*.pdf', '**/tmp/**', '**/output/**',
        '**/test-learn-statements/**', '**/bank/**', '**/.git/**'],
    },
  },
  build: { outDir: '../dist', emptyOutDir: true },
});
