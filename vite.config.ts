import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run build:public` leaves the snapshot of your sheets (recording links, passcodes, notes) out of the
// bundle, so the app can be hosted online without exposing them. It then loads everything from your sheets.
const publicBuild = process.env.PUBLIC_BUILD === '1';
const emptySeed = (): Plugin => ({
  name: 'empty-seed',
  enforce: 'pre',
  load(id) {
    if (publicBuild && id.endsWith('plan.seed.json')) return '{}';
  },
});

export default defineConfig({
  plugins: [emptySeed(), react()],
  server: { port: 5173, strictPort: true },
  build: {
    outDir: publicBuild ? 'dist-public' : 'dist',
    sourcemap: false,
    reportCompressedSize: false, // saves memory on low-RAM PCs
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // smaller pieces keep the build's peak memory low
        manualChunks(id: string) {
          if (id.includes('pdfjs-dist')) return 'pdf';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
});
