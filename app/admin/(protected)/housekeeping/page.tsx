import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { NAV, resolveTab, visibleTabs } from "@/lib/admin-nav";
import HubTabs from "@/components/admin/HubTabs";
import RoomTasksPanel from "@/components/admin/panels/RoomTasks";
import LaundryPanel from "@/components/admin/panels/Laundry";

const HUB = NAV.find((n) => n.href === "/admin/housekeeping")!;

const PANELS: Record<string, React.ComponentType> = {
  rooms: RoomTasksPanel,
  laundry: LaundryPanel,
};

export default async function HousekeepingPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) redirect("/admin/login");

  const tab = resolveTab(HUB, searchParams.tab, staff.role);
  if (!tab) redirect("/admin/dashboard");

  const Panel = PANELS[tab.slug];

  return (
    <div>
      <HubTabs
        title="Housekeeping"
        subtitle="Room tasks and linen sent out for washing"
        basePath="/admin/housekeeping"
        tabs={visibleTabs(HUB, staff.role)}
        active={tab.slug}
      />
      <Panel />
    </div>
  );
}
