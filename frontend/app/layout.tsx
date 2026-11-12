import type { Metadata, Viewport } from "next";
import { Barlow, Big_Shoulders, Big_Shoulders_Stencil, Doto } from "next/font/google";

import "./globals.css";

const body = Barlow({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600"] });
const heading = Big_Shoulders({ variable: "--font-heading", subsets: ["latin"], weight: ["600", "700", "800"] });
const stencil = Big_Shoulders_Stencil({ variable: "--font-stencil", subsets: ["latin"], weight: ["800", "900"] });
const led = Doto({ variable: "--font-led", subsets: ["latin"], weight: ["800", "900"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://pickem.xomware.com"),
  title: { default: "Uncle Mike's NFL Pick Em", template: "%s | Uncle Mike's NFL Pick Em" },
  description: "Weekly confidence picks, a Game of the Week, and a death pool for your group.",
  icons: {
    icon: [{ url: "/brand/favicon.ico", sizes: "32x32" }, { url: "/brand/icon.svg", type: "image/svg+xml" }],
    apple: "/brand/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "Uncle Mike's NFL Pick Em",
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "Uncle Mike's Pick Em, painted in an end zone" }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#1f4a2b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${body.variable} ${heading.variable} ${stencil.variable} ${led.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
