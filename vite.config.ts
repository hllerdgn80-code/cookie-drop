import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// base: the app is served from a GitHub Pages project path, so asset URLs must
// be relative to it rather than to the domain root.
export default defineConfig({
  base: "/cookie-drop/",
  plugins: [
    react(),
    // Solana's client libraries still reach for Buffer and process; the browser
    // has neither.
    nodePolyfills({ include: ["buffer", "process"], globals: { Buffer: true, process: true } }),
  ],
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
});
