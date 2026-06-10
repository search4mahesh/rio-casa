import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import AdminSidebar from "@/components/admin/AdminSidebar";
import RoleGuard from "@/components/admin/RoleGuard";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) redirect("/admin/login");

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <AdminSidebar staff={staff} />
      <div className="flex-1 flex flex-col overflow-hidden lg:overflow-auto">
        {/* Mobile top spacer */}
        <div className="lg:hidden h-14 flex-shrink-0" />
        <main className="flex-1 overflow-auto">
          <RoleGuard role={staff.role}>
            {children}
          </RoleGuard>
        </main>
      </div>
    </div>
  );
}
