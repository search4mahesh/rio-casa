import { redirect } from "next/navigation";
import { requireStaffPage } from "@/lib/admin-page-auth";
import { NAV, resolveTab, visibleTabs } from "@/lib/admin-nav";
import { adminHubMetadata } from "@/lib/admin-metadata";
import HubTabs from "@/components/admin/HubTabs";
import InvoicesPanel from "@/components/admin/panels/Invoices";
import ExpensesPanel from "@/components/admin/panels/Expenses";
import ReconciliationPanel from "@/components/admin/panels/Reconciliation";
import ReportsPanel from "@/components/admin/panels/Reports";
import NightAuditPanel from "@/components/admin/panels/NightAudit";

const HUB = NAV.find((n) => n.href === "/admin/money")!;

const PANELS: Record<string, React.ComponentType> = {
  invoices:   InvoicesPanel,
  expenses:   ExpensesPanel,
  reconcile:  ReconciliationPanel,
  reports:    ReportsPanel,
  nightaudit: NightAuditPanel,
};

// Titled from the active tab, not the hub: `?tab=reports` and
// `?tab=invoices` are the same page, and one title for both would leave
// them indistinguishable in a row of browser tabs.
export const generateMetadata = ({ searchParams }: { searchParams: { tab?: string } }) =>
  adminHubMetadata("/admin/money", searchParams.tab);

export default async function MoneyPage({
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
        title="Money"
        subtitle="Invoices, spending and revenue reporting"
        basePath="/admin/money"
        tabs={visibleTabs(HUB, staff.role)}
        active={tab.slug}
      />
      <Panel />
    </div>
  );
}
