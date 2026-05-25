import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Rio Casa — Luxury Resort in Mahabaleshwar",
    template: "%s | Rio Casa Mahabaleshwar",
  },
  description:
    "Experience nature's serenity at Rio Casa, a boutique resort nestled in the hills of Mahabaleshwar. Book rooms, explore packages, and discover Mahabaleshwar's beauty.",
  keywords: ["Mahabaleshwar resort", "Rio Casa", "hill station resort", "Maharashtra resort", "book resort Mahabaleshwar"],
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "Rio Casa Resort",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-earth-bg">{children}</body>
    </html>
  );
}
