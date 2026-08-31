import type { Metadata } from "next";
import { metadataBase, absoluteUrl } from "@/lib/site-url";
import { PROPERTY, SITE_TITLE, TITLE_TEMPLATE } from "@/lib/property";
import "./globals.css";

const DESCRIPTION = PROPERTY.description;

// The image every share falls back to. A real photograph of the property
// rather than a generated card: this is what appears when someone forwards
// the site on WhatsApp, which for a resort in Maharashtra is the share that
// matters most. 1200×630 is the ratio Facebook, LinkedIn and WhatsApp crop to.
const OG_IMAGE = {
  url: PROPERTY.images.og,
  width: 1200,
  height: 630,
  alt: `${PROPERTY.name} resort exterior, ${PROPERTY.city}`,
};

export const metadata: Metadata = {
  // Without this, relative openGraph images resolve against localhost at build
  // time and Next warns on every page — so a shared link showed no preview
  // image at all.
  metadataBase: metadataBase(),
  title: {
    default: SITE_TITLE,
    template: TITLE_TEMPLATE,
  },
  description: DESCRIPTION,
  keywords: PROPERTY.keywords,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: PROPERTY.name,
    url: absoluteUrl("/"),
    title: SITE_TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
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
