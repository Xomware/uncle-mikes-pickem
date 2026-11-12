import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";

import "./globals.css";

const body = Barlow({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600"] });
const heading = Barlow_Condensed({ variable: "--font-heading", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://pickem.xomware.com"),
  title: { default: "Uncle Mike's NFL Pick Em", template: "%s | Uncle Mike's NFL Pick Em" },
  description: "Weekly confidence picks, a Game of the Week, and a death pool for your group.",
  icons: {
    icon: [{ url: "/brand/favicon.ico", sizes: "16x16 32x32 48x48" }, { url: "/brand/icon.svg", type: "image/svg+xml" }],
    apple: "/brand/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "Uncle Mike's NFL Pick Em",
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "Uncle Mike's NFL Pick Em" }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#142034",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${body.variable} ${heading.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
