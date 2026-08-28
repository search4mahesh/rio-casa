import { redirect } from "next/navigation";
import { requireStaffPage } from "@/lib/admin-page-auth";
import { NAV, resolveTab, visibleTabs } from "@/lib/admin-nav";
import { hasMinRole } from "@/lib/rbac-utils";
import { adminHubMetadata } from "@/lib/admin-metadata";
import HubTabs from "@/components/admin/HubTabs";
import CalendarMonthPanel from "@/components/admin/panels/CalendarMonth";
import OccupancyGridPanel from "@/components/admin/panels/OccupancyGrid";
import BlockedDatesPanel from "@/components/admin/panels/BlockedDates";

const HUB = NAV.find((n) => n.href === "/admin/calendar")!;

// Every panel is handed `canManage`; the two that take no props ignore it.
// Typing the map this way keeps the lookup-then-render shape below while
// letting the blocked-dates panel gate its write controls on the viewer.
const PANELS: Record<string, React.ComponentType<{ canManage: boolean }>> = {
  month:   CalendarMonthPanel,
  "14day": OccupancyGridPanel,
  blocked: BlockedDatesPanel,
};

// Titled from the active tab, not the hub: `?tab=reports` and
// `?tab=invoices` are the same page, and one title for both would leave
// them indistinguishable in a row of browser tabs.
export const generateMetadata = ({ searchParams }: { searchParams: { tab?: string } }) =>
  adminHubMetadata("/admin/calendar", searchParams.tab);

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const staff = await requireStaffPage();

  const tab = resolveTab(HUB, searchParams.tab, staff.role);
  if (!tab) redirect("/admin/dashboard");

  const Panel = PANELS[tab.slug];

  return (
    <div>
      <HubTabs
        title="Calendar"
        subtitle="Who is staying, and when"
        basePath="/admin/calendar"
        tabs={visibleTabs(HUB, staff.role)}
        active={tab.slug}
      />
      <Panel canManage={hasMinRole(staff.role, "manager")} />
    </div>
  );
}
