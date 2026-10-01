import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

// Kept apart from vite.config.ts so tests run without the Cloudflare plugin.
export default defineConfig({
  plugins: [react()],
  // The @ and @shared aliases, as tsconfig.json names them.
  resolve: { tsconfigPaths: true },
  // Vitest doesn't read .gitignore, so it would also collect the tests of every worktree under .claude/.
  test: { setupFiles: ["./vitest.setup.ts"], exclude: [...configDefaults.exclude, ".claude/**"] },
});
