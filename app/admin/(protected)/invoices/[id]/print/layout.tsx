import { adminMetadata } from "@/lib/admin-metadata";

// `invoices/[id]/print/page.tsx` is a client component, and only a server component can export
// metadata — hence this layout. Same reason /contact has one (B-52).
export const generateMetadata = () => adminMetadata("Invoice");

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
