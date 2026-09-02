import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Watch2Gether - Real-Time Synchronized Media & Chat",
  description:
    "Synchronize YouTube and MP4 video playback in real-time with sub-second latency, instant chat, and floating emoji reactions.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
