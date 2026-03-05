import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GameProvider } from "@/contexts/GameContext";

export const metadata: Metadata = {
  title: "LiveQuiz MVP",
  description: "Real-time quiz platform for engaging interactive learning",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning>
        <GameProvider>
          <div className="animate-fade-in animate-slide-up">
            {children}
          </div>
        </GameProvider>
      </body>
    </html>
  );
}
