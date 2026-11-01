import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

const geist = Nunito({ variable: "--font-geist-sans", subsets: ["latin"], weight: ["400", "600", "700", "800", "900"] });

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "LearnBySpeaking — apprends l'hébreu en parlant",
  description: "Converse à voix haute avec un tuteur IA local et gratuit pour apprendre l'hébreu.",
  applicationName: "LearnBySpeaking",
  appleWebApp: { capable: true, title: "LearnBySpeaking", statusBarStyle: "default" },
  icons: {
    icon: [{ url: `${base}/icon-192.png`, sizes: "192x192", type: "image/png" }],
    apple: [{ url: `${base}/apple-touch-icon.png`, sizes: "180x180" }],
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { color: "#f6f7ee" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
