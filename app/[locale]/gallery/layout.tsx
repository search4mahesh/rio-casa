import { pageMetadata } from "@/lib/page-metadata";

// `gallery/page.tsx` is a client component, and only a server component can
// export metadata — hence this layout. Without it the page fell back to the
// root default and was indistinguishable from every other page (B-52).
export const generateMetadata = () => pageMetadata("gallery");

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
