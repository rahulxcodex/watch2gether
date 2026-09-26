import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TactileGrain } from "@/components/visual/TactileGrain";

export const metadata: Metadata = {
  title: "Watch2Gether - Real-Time Synchronized Media & Chat",
  description:
    "Synchronize YouTube, HLS, and MP4 video playback in real-time with sub-second Cristian clock sync, Kalman jitter filtering, RL drift reconciliation, and instant chat.",
  manifest: "/site.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "Watch2Gether - Real-Time Synchronized Media & Chat",
    description:
      "Sub-second synchronized media playback with Cristian NTP clock sync, live chat, and emoji reactions.",
    url: "https://watch2gether-web.vercel.app",
    siteName: "Watch2Gether",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Watch2Gether - Real-Time Synchronized Media",
    description: "Sub-second synchronized media playback with instant chat and emoji reactions.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0C0D0E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0C0D0E] text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
        <TactileGrain />
        {children}
      </body>
    </html>
  );
}
