import { pageMetadata } from "@/lib/page-metadata";

// `contact/page.tsx` is a client component, and only a server component can
// export metadata — hence this layout. Without it the page fell back to the
// root default and was indistinguishable from every other page (B-52).
export const generateMetadata = () => pageMetadata("contact", "/contact");

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
