import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import "./globals.css";
import { PwaRegistration } from "@/components/pwa-registration";

export const metadata: Metadata = {
  title: "realfood",
  description: "属于你和家人的健康知识",
  applicationName: "realfood",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "realfood" },
  formatDetection: { telephone: false },
  icons: { icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body><PwaRegistration />{children}</body>
    </html>
  );
}
