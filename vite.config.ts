import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { preloadFonts } from "./scripts/preloadFonts.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), preloadFonts()],
  // The @ and @shared aliases, as tsconfig.json names them.
  resolve: { tsconfigPaths: true },
  environments: {
    // Everything the first page loads is one chunk, which the lazy chunks import from.
    client: { build: { rolldownOptions: { output: { codeSplitting: { groups: [{ name: "initial", tags: ["$initial"] }] } } } } },
  },
});
