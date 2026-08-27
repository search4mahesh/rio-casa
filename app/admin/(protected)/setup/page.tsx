import { redirect } from "next/navigation";
import { requireStaffPage } from "@/lib/admin-page-auth";
import { NAV, resolveTab, visibleTabs } from "@/lib/admin-nav";
import { adminHubMetadata } from "@/lib/admin-metadata";
import HubTabs from "@/components/admin/HubTabs";
import RatePlansPanel from "@/components/admin/panels/RatePlans";
import PromosPanel from "@/components/admin/panels/Promos";
import ReviewsPanel from "@/components/admin/panels/Reviews";
import PackagesPanel from "@/components/admin/panels/Packages";
import TestimonialsPanel from "@/components/admin/panels/Testimonials";
import CommunicationsPanel from "@/components/admin/panels/Communications";
import ShiftsPanel from "@/components/admin/panels/Shifts";
import HotelSettingsPanel from "@/components/admin/panels/HotelSettings";
import { hotelDetailsForDisplay } from "@/lib/hotel-details";

const HUB = NAV.find((n) => n.href === "/admin/setup")!;

const PANELS: Record<string, React.ComponentType> = {
  rates:        RatePlansPanel,
  promos:       PromosPanel,
  packages:     PackagesPanel,
  testimonials: TestimonialsPanel,
  reviews:      ReviewsPanel,
  messages:     CommunicationsPanel,
  shifts:       ShiftsPanel,
};

// Titled from the active tab, not the hub: `?tab=reports` and
// `?tab=invoices` are the same page, and one title for both would leave
// them indistinguishable in a row of browser tabs.
export const generateMetadata = ({ searchParams }: { searchParams: { tab?: string } }) =>
  adminHubMetadata("/admin/setup", searchParams.tab);

export default async function SetupPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const staff = await requireStaffPage();

  const tab = resolveTab(HUB, searchParams.tab, staff.role);
  if (!tab) redirect("/admin/dashboard");

  // `HotelSettingsPanel` is a client component, so it cannot read the
  // server-only `HOTEL_GSTIN` var itself — this Server Component reads it and
  // passes it down. See B-29.
  const Panel = tab.slug === "hotel" ? null : PANELS[tab.slug];

  return (
    <div>
      <HubTabs
        title="Setup"
        subtitle="Pricing, guest messaging and staff configuration"
        basePath="/admin/setup"
        tabs={visibleTabs(HUB, staff.role)}
        active={tab.slug}
      />
      {tab.slug === "hotel" ? (
        <HotelSettingsPanel hotel={hotelDetailsForDisplay()} />
      ) : (
        Panel && <Panel />
      )}
    </div>
  );
}
