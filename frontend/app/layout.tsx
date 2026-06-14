import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sign Bridge — Real-Time Sign Language Translator",
  description:
    "AI-powered dashboard that translates sign language gestures into text and speech in real time.",
  applicationName: "Sign Bridge",
  authors: [{ name: "Sign Bridge Team" }],
  keywords: ["sign language", "translator", "AI", "MediaPipe", "computer vision"],
};

export const viewport: Viewport = {
  themeColor: "#f4f3ee",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
