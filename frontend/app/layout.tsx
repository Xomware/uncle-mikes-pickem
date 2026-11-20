import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import "./globals.css";

// Self-hosted (SIL OFL, latin subset from Google Fonts): fetching them at build
// time failed intermittently in CI and took the frontend deploy down with it.
const body = localFont({
  variable: "--font-body",
  src: [
    { path: "./fonts/barlow-400.woff2", weight: "400" },
    { path: "./fonts/barlow-500.woff2", weight: "500" },
    { path: "./fonts/barlow-600.woff2", weight: "600" },
  ],
});
const heading = localFont({ variable: "--font-heading", src: "./fonts/big-shoulders.woff2", weight: "600 800" });
// Graduate ships one weight. Declaring the full range stops the browser faking
// bold over the font-black classes; the paint utility thickens it with a stroke.
const stencil = localFont({ variable: "--font-stencil", src: "./fonts/graduate.woff2", weight: "100 900" });
const led = localFont({ variable: "--font-led", src: "./fonts/doto.woff2", weight: "800 900" });

export const metadata: Metadata = {
  metadataBase: new URL("https://pickem.xomware.com"),
  title: { default: "Uncle Mike's NFL Pick Em", template: "%s | Uncle Mike's NFL Pick Em" },
  description: "Weekly confidence picks, a Game of the Week, and a death pool for your group.",
  icons: {
    icon: [{ url: "/brand/favicon.ico", sizes: "32x32" }, { url: "/brand/icon.png", sizes: "512x512", type: "image/png" }],
    apple: "/brand/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "Uncle Mike's NFL Pick Em",
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "Uncle Mike's Pick Em" }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#1f4a2b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The landing's inline intro gate sets data-intro before hydration.
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark ${body.variable} ${heading.variable} ${stencil.variable} ${led.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
