import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "讀懂一篇｜中文閱讀理解練習",
  description: "讀一篇經典文章，寫下大綱與摘要，由 AI 老師對照原文評分。",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <body>
        <header className="site-header">
          <a href="/" className="brand">
            讀懂一篇
          </a>
          <span className="tag">Demo</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
