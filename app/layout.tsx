import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Social Saver — Save Your Favorite Moments",
  description:
    "Paste a public Instagram, TikTok or Pinterest link, preview the media and download the original file. Respect creators: only save content you own or have permission to use.",
  applicationName: "Social Saver",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Social Saver",
    description: "Save your favorite public moments from Instagram, TikTok and Pinterest. Preview first, then download.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="min-h-dvh bg-canvas text-fg antialiased">{children}</body>
    </html>
  );
}
