import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "src/client",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  server: {
    port: 9420,
    host: "0.0.0.0",
    proxy: {
      "/api": "http://localhost:9470",
      "/ws": {
        target: "http://localhost:9470",
        ws: true,
      },
    },
  },
});
