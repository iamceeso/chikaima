import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Chikaima Core (core/**) uses explicit `.js` extensions on relative imports
  // that point at `.ts` source files, per NodeNext-style ESM convention (needed
  // so the test build's `tsc` + `node --test` pipeline resolves them without a
  // bundler). Webpack doesn't alias `.js` -> `.ts` on its own; Turbopack does.
  experimental: {
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"],
    },
  },
  // Native/WASM-backed packages that webpack cannot bundle for a non-Node
  // target (this matters for instrumentation.ts, which Next compiles for
  // both runtimes) — leave them as real `require()`s instead.
  serverExternalPackages: ["better-sqlite3", "sqlite-vec", "tesseract.js", "pdf-parse"],
};

export default nextConfig;
