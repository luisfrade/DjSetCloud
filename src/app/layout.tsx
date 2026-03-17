import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { PlayerProvider } from "@/context/PlayerContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DjSetCloud",
  description:
    "Discover and play DJ sets from SoundCloud and YouTube — Afro House, House, Techno, Tech House",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DjSetCloud",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} font-sans antialiased`}>
        <PlayerProvider>{children}</PlayerProvider>
      </body>
    </html>
  );
}
