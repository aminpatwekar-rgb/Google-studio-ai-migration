// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      allowedHosts: true,
      cors: true,
    },
    build: {
      rollupOptions: {
        onwarn(warning, defaultHandler) {
          if (
            warning.code === "MODULE_LEVEL_DIRECTIVE" ||
            String(warning.message || "").includes("MODULE_LEVEL_DIRECTIVE") ||
            String(warning.message || "").includes("use client") ||
            String(warning.message || "").includes("module level directive")
          ) {
            return;
          }
          defaultHandler(warning);
        },
      },
      rolldownOptions: {
        onwarn(warning, defaultHandler) {
          if (
            warning.code === "MODULE_LEVEL_DIRECTIVE" ||
            String(warning.message || "").includes("MODULE_LEVEL_DIRECTIVE") ||
            String(warning.message || "").includes("use client") ||
            String(warning.message || "").includes("module level directive")
          ) {
            return;
          }
          defaultHandler(warning);
        },
      },
    },
  },
});
