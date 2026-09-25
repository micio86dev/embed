import { defineConfig } from "tsup";

// Ships to customer sites as a directly-loaded <script> bundle, so:
// - target modern evergreen browsers only (no legacy transpilation bloat) to stay ≤ 12 KB gz
// - zero runtime dependencies (enforced separately by `dependencies: {}` in package.json)
export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    target: "es2020",
    platform: "browser",
    dts: true,
    sourcemap: true,
    clean: true,
    minify: false,
    splitting: false,
    outExtension({ format }) {
      return { js: format === "cjs" ? ".cjs" : ".js" };
    },
  },
  {
    entry: { embed: "src/index.ts" },
    format: ["iife"],
    target: "es2020",
    platform: "browser",
    globalName: "BEAI_IIFE",
    dts: false,
    sourcemap: true,
    clean: false,
    minify: true,
    splitting: false,
    // The IIFE build exposes `window.BEAI.mount(...)` directly (not a `.BEAI_IIFE.BEAI`
    // wrapper): the footer re-assigns the global to the named export produced under
    // `globalName`.
    footer: {
      js: "window.BEAI = BEAI_IIFE.BEAI;",
    },
    outExtension() {
      return { js: ".iife.js" };
    },
  },
]);
