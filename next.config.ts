import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
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
