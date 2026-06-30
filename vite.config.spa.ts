import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import type { Plugin } from "vite";
import path from "path";

const stubsDir = path.resolve(__dirname, "src/stubs");

function stubTanstackStartPlugin(): Plugin {
  const virtuals: Record<string, string> = {
    "tanstack-start-manifest:v": "export default {}; export const manifest = {};",
    "tanstack-start-client-entry:v": "",
    "tanstack-start-server-entry:v": "",
  };
  return {
    name: "stub-tanstack-start",
    enforce: "pre",
    resolveId(id) {
      if (id in virtuals) return "\0" + id;
    },
    load(id) {
      const key = id.startsWith("\0") ? id.slice(1) : id;
      if (key in virtuals) return virtuals[key];
    },
  };
}

export default defineConfig({
  plugins: [stubTanstackStartPlugin(), react(), tailwindcss(), tsconfigPaths()],
  build: {
    outDir: "dist-spa",
    target: "es2020",
    minify: "esbuild",
    cssMinify: true,
    rollupOptions: {
      output: {
        // Separar vendor pesado do código da app para melhor cache
        manualChunks(id) {
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) {
            return "charts";
          }
          if (id.includes("node_modules/@radix-ui")) {
            return "radix";
          }
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react";
          }
          if (id.includes("node_modules/@supabase")) {
            return "supabase";
          }
          if (id.includes("node_modules/@tanstack")) {
            return "tanstack";
          }
        },
      },
    },
  },
  resolve: {
    alias: [
      { find: "node:async_hooks", replacement: path.join(stubsDir, "async-hooks.ts") },
      { find: "node:stream/web", replacement: path.join(stubsDir, "stream-web.ts") },
      { find: "node:stream", replacement: path.join(stubsDir, "stream.ts") },
      { find: "node:process", replacement: path.join(stubsDir, "process.ts") },
      { find: "node:crypto", replacement: path.join(stubsDir, "crypto.ts") },
      { find: "node:buffer", replacement: path.join(stubsDir, "buffer.ts") },
      { find: "node:util", replacement: path.join(stubsDir, "util.ts") },
      { find: "node:path", replacement: path.join(stubsDir, "node-path.ts") },
      { find: "node:fs", replacement: path.join(stubsDir, "fs.ts") },
      { find: "node:os", replacement: path.join(stubsDir, "os.ts") },
      { find: "node:net", replacement: path.join(stubsDir, "empty.ts") },
      { find: "node:tls", replacement: path.join(stubsDir, "empty.ts") },
      { find: "node:http", replacement: path.join(stubsDir, "empty.ts") },
      { find: "node:https", replacement: path.join(stubsDir, "empty.ts") },
      { find: "node:url", replacement: path.join(stubsDir, "node-url.ts") },
      { find: "web-push", replacement: path.join(stubsDir, "web-push.ts") },
    ],
  },
});
