import { pageMetadata } from "@/lib/page-metadata";
import { getGalleryImages } from "@/lib/site-content";
import GalleryGrid from "@/components/sections/GalleryGrid";
import { CONTENT_REVALIDATE_SECONDS } from "@/lib/content-cache";

// This page used to be a client component, which is why it needed a sibling
// `layout.tsx` to export metadata at all — only a server component can (B-52).
// Reading the images from the database made it a server component, so the
// workaround went with it.
export const generateMetadata = () => pageMetadata("gallery", "/gallery");

// Revalidated on a timer rather than read per visitor. `force-dynamic` was
// the right correction to B-74 (this page was prerendered at build, so the gallery images
// went stale until the next deploy) but it made every visitor pay a database
// round trip — and, on a property this quiet, often the ~1.9s connection
// handshake that follows an idle pool. A minute is the window; see
// `lib/content-cache.ts` for why the floor is time and not tags.
export const revalidate = CONTENT_REVALIDATE_SECONDS;

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
