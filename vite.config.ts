import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const here = (p: string) => new URL(p, import.meta.url).pathname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@server": here("./src/server"),
      "@client": here("./src/client"),
      "@modes": here("./modes"),
    },
  },
  server: {
    // Local dev: Vite serves the SPA, wrangler dev serves the API.
    proxy: { "/api": "http://localhost:8787" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
