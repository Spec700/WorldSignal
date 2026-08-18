import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import "./globals.css";

const bodyFont = localFont({
  src: "../../public/fonts/atkinson-hyperlegible-next-variable.woff2",
  variable: "--font-body",
  weight: "200 800",
  display: "swap",
});

const displayFont = localFont({
  src: [
    {
      path: "../../public/fonts/barlow-condensed-500.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/barlow-condensed-600.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/fonts/barlow-condensed-700.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WorldSignal",
  description:
    "A local-first global natural-hazard situational-awareness dashboard.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111b20",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
