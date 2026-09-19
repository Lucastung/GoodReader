import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "好好讀書｜中文閱讀理解練習",
  description: "讀一篇經典文章，寫下大綱與摘要，由 AI 老師對照原文評分。",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            好好讀書
          </Link>
          <Link href="/demo" className="demo-btn" title="互動示範：開文章、列大綱、寫摘要、看評分">
            DEMO
          </Link>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
