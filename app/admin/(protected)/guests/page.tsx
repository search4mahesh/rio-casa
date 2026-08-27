import { redirect } from "next/navigation";
import { requireStaffPage } from "@/lib/admin-page-auth";
import { NAV, resolveTab, visibleTabs } from "@/lib/admin-nav";
import { adminHubMetadata } from "@/lib/admin-metadata";
import HubTabs from "@/components/admin/HubTabs";
import GuestListPanel from "@/components/admin/panels/GuestList";
import InquiriesPanel from "@/components/admin/panels/Inquiries";

const HUB = NAV.find((n) => n.href === "/admin/guests")!;

const PANELS: Record<string, React.ComponentType> = {
  list: GuestListPanel,
  inquiries: InquiriesPanel,
};

// Titled from the active tab, not the hub: `?tab=reports` and
// `?tab=invoices` are the same page, and one title for both would leave
// them indistinguishable in a row of browser tabs.
export const generateMetadata = ({ searchParams }: { searchParams: { tab?: string } }) =>
  adminHubMetadata("/admin/guests", searchParams.tab);

export default async function GuestsPage({
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
        title="Guests"
        subtitle="Past and present guests, and people who have written in"
        basePath="/admin/guests"
        tabs={visibleTabs(HUB, staff.role)}
        active={tab.slug}
      />
      <Panel />
    </div>
  );
}
