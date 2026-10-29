import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Parle — apprends l'hébreu en parlant",
  description: "Converse à voix haute avec un tuteur IA local et gratuit pour apprendre l'hébreu.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f6f1e9" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
