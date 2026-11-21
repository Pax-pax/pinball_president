import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Un seul fichier HTML autonome (Three.js + Rapier en WebAssembly inline) : facile à héberger et à ouvrir sur téléphone.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
});
