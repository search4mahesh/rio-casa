import type { Metadata } from "next";
import { ADMIN_TITLE_TEMPLATE } from "@/lib/admin-metadata";

// ─────────────────────────────────────────────────────────────
// Wraps every admin route, `/admin/login` included.
//
// It exists for two things neither the root layout nor the (protected) layout
// can do:
//
//   title.template  — overrides the root's "%s | Rio Casa Mahabaleshwar" so an
//                     admin tab reads "Invoices · Money · Rio Casa Admin"
//                     rather than borrowing the marketing site's suffix.
//   robots          — `noindex, nofollow`. robots.txt already disallows
//                     /admin, but that is a request to well-behaved crawlers
//                     about *fetching*; this is an instruction about
//                     *indexing*, and it travels with any URL that leaks.
//
// No markup of its own — the chrome lives in (protected)/layout.tsx, which
// login must not inherit.
// ─────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: {
    default: "Rio Casa Admin",
    template: ADMIN_TITLE_TEMPLATE,
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
