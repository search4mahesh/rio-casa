import { adminSectionMetadata } from "@/lib/admin-metadata";

// `bookings/page.tsx` is a client component, and only a server component can export
// metadata — hence this layout. Same reason /contact has one (B-52).
// `adminSectionMetadata`, not `adminMetadata`: /admin/bookings/[id] nests
// under this layout, and a plain string title here would strip the suffix
// from that child.
export const generateMetadata = () => adminSectionMetadata("Bookings");

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
