import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // [FIX] No rewrite — /api prefix is kept intact.
      // Backend routes are registered as /api/* so dev and prod behave identically.
      "/api": {
        target:       "http://localhost:3001",
        changeOrigin: true,
        // Disable timeout for SSE streams (task logs, pipeline logs)
        timeout:         0,
        proxyTimeout:    0,
      },
    },
  },
});