import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Unbounded } from "next/font/google";
import "./globals.css";

import { PAGE } from "@/copy";

import { ForkBanner } from "./ForkBanner";
import { Providers } from "./providers";

// Font (DECISIONS.md Q20): Unbounded buat display (200 angka hero, 700 wordmark), Plex Sans buat teks, Plex Mono buat
// angka tabel & alamat.
const unbounded = Unbounded({ variable: "--font-unbounded", subsets: ["latin"], weight: ["200", "300", "400", "500", "700"] });
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["300", "400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: PAGE.title,
  description: PAGE.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${unbounded.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ForkBanner />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
