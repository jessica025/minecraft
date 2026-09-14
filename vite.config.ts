import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
  },
  build: {
    outDir: "dist",
    // Three.js is the intentionally bundled game engine; its production
    // chunk is about 535 kB minified and about 140 kB after gzip.
    chunkSizeWarningLimit: 600,
  },
});
