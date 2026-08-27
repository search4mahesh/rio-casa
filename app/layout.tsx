import type { Metadata } from "next";
import { metadataBase, absoluteUrl } from "@/lib/site-url";
import "./globals.css";

const DESCRIPTION =
  "Experience nature's serenity at Rio Casa, a boutique resort nestled in the hills of Mahabaleshwar. Book rooms, explore packages, and discover Mahabaleshwar's beauty.";

// The image every share falls back to. A real photograph of the property
// rather than a generated card: this is what appears when someone forwards
// the site on WhatsApp, which for a resort in Maharashtra is the share that
// matters most. 1200×630 is the ratio Facebook, LinkedIn and WhatsApp crop to.
const OG_IMAGE = {
  url: "/images/hero/exterior-front.jpg",
  width: 1200,
  height: 630,
  alt: "Rio Casa resort exterior, Mahabaleshwar",
};

export const metadata: Metadata = {
  // Without this, relative openGraph images resolve against localhost at build
  // time and Next warns on every page — so a shared link showed no preview
  // image at all.
  metadataBase: metadataBase(),
  title: {
    default: "Rio Casa — Luxury Resort in Mahabaleshwar",
    template: "%s | Rio Casa Mahabaleshwar",
  },
  description: DESCRIPTION,
  keywords: ["Mahabaleshwar resort", "Rio Casa", "hill station resort", "Maharashtra resort", "book resort Mahabaleshwar"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "Rio Casa Resort",
    url: absoluteUrl("/"),
    title: "Rio Casa — Luxury Resort in Mahabaleshwar",
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Rio Casa — Luxury Resort in Mahabaleshwar",
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
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
