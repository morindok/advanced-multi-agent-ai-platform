import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "NCP — مغز یکپارچه‌ی هزار ایجنت",
  description:
    "پلتفرم فراالگوریتمی NCP: هزار ایجنت در هفت ناحیه‌ی مغزی که با پروتکل اجماع عصبی، مدل‌های چندگانه را به یک مغز واحد تبدیل می‌کنند.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-void-950 text-slate-200 antialiased">{children}</body>
    </html>
  );
}
