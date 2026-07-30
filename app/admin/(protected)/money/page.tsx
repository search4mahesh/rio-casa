import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { NAV, resolveTab, visibleTabs } from "@/lib/admin-nav";
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

export default async function MoneyPage({
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
