import { adminMetadata } from "@/lib/admin-metadata";

// Nests inside bookings/layout.tsx and overrides its "Bookings" — otherwise
// the list and a single booking share a title, which is the problem this was
// meant to solve one level down.
//
// Deliberately not the booking number: the page is a client component that
// fetches it after mount, so putting it in the title would mean a second
// server-side query on every render just for the browser tab.
export const generateMetadata = () => adminMetadata("Booking");

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
