import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // E2E (tiket 24) build ke folder sendiri supaya nggak menimpa build dev / cek visual.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    // RainbowKit selalu ngimpor connector Base Account (smart wallet), yang narik paket opsional yang nggak
    // dipasang → SSR gagal resolve. Kita EOA-only dan wagmi cuma `import()` SDK ini pas connect, jadi diarahin
    // ke modul kosong (pola swap-web).
    resolveAlias: {
      "@base-org/account": "./src/stubs/empty.ts",
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
