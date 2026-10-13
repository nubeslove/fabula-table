import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  server: {
    proxy: { "/api": { target: "http://127.0.0.1:3340", changeOrigin: false } },
  },
  build: { outDir: "dist/public", emptyOutDir: true },
  esbuild: { jsx: "automatic" },
});
