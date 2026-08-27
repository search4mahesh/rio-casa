import { pageMetadata } from "@/lib/page-metadata";
import { getGalleryImages } from "@/lib/site-content";
import GalleryGrid from "@/components/sections/GalleryGrid";

// This page used to be a client component, which is why it needed a sibling
// `layout.tsx` to export metadata at all — only a server component can (B-52).
// Reading the images from the database made it a server component, so the
// workaround went with it.
export const generateMetadata = () => pageMetadata("gallery", "/gallery");

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  // A failed load leaves the grid empty rather than taking the page down. The
  // filter buttons still render, which is honest: the categories exist, we
  // just could not fetch what is in them.
  let images: Awaited<ReturnType<typeof getGalleryImages>> = [];
  try {
    images = await getGalleryImages();
  } catch (err) {
    console.error("[gallery] Could not load images.", err);
  }

  return (
    <GalleryGrid
      images={images.map((img) => ({
        id: img.id,
        src: img.url,
        category: img.category,
        alt: img.altText,
      }))}
    />
  );
}
