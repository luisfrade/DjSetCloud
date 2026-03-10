import type { Metadata } from "next";
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
