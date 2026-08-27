import { adminMetadata } from "@/lib/admin-metadata";

// `guests/[id]/page.tsx` is a client component, and only a server component can export
// metadata — hence this layout. Same reason /contact has one (B-52).
export const generateMetadata = () => adminMetadata("Guest");

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
