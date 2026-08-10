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
  serverExternalPackages: ["better-sqlite3", "sqlite-vec", "tesseract.js", "pdf-parse", "@napi-rs/canvas"],
  // `output: standalone`'s file tracer (@vercel/nft) statically walks
  // require()/import calls, so it misses platform-specific native binary
  // packages loaded through a runtime-computed specifier: sqlite-vec picks
  // `sqlite-vec-${platform}-${arch}` via a string-built `import.meta.resolve`
  // call. Without this, the standalone server 500s on every request with
  // "Cannot find package 'sqlite-vec-darwin-arm64'" (or the equivalent for
  // whatever platform it's built on).
  outputFileTracingIncludes: {
    "/*": [
      "node_modules/.pnpm/sqlite-vec-*/node_modules/sqlite-vec-*/**/*",
      // The glob above copies the real platform packages, but sqlite-vec's
      // own `import.meta.resolve` call needs to find them via a symlink in
      // its own local node_modules (pnpm's isolated layout) — same gap as
      // the pdfjs-dist/@napi-rs one above.
      "node_modules/.pnpm/sqlite-vec@*/node_modules/sqlite-vec-*/**/*",
    ],
  },
};

export default nextConfig;
