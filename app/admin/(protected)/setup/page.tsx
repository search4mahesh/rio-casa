import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { NAV, resolveTab, visibleTabs } from "@/lib/admin-nav";
import HubTabs from "@/components/admin/HubTabs";
import RatePlansPanel from "@/components/admin/panels/RatePlans";
import PromosPanel from "@/components/admin/panels/Promos";
import ReviewsPanel from "@/components/admin/panels/Reviews";
import CommunicationsPanel from "@/components/admin/panels/Communications";
import ShiftsPanel from "@/components/admin/panels/Shifts";
import HotelSettingsPanel from "@/components/admin/panels/HotelSettings";

const HUB = NAV.find((n) => n.href === "/admin/setup")!;

const PANELS: Record<string, React.ComponentType> = {
  rates:    RatePlansPanel,
  promos:   PromosPanel,
  reviews:  ReviewsPanel,
  messages: CommunicationsPanel,
  shifts:   ShiftsPanel,
};

export default async function SetupPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) redirect("/admin/login");

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
        <HotelSettingsPanel gstin={process.env.HOTEL_GSTIN || "27XXXXX0000X1ZX"} />
      ) : (
        Panel && <Panel />
      )}
    </div>
  );
}
