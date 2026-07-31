"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasMinRole, PAGE_MIN_ROLE } from "@/lib/rbac-utils";
import type { Role } from "@/lib/rbac-utils";
import { ROLE_LABEL } from "@/lib/labels";

export default function RoleGuard({
  role,
  children,
}: {
  role: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Find the most specific matching rule (longest matching prefix wins)
  const minRole = Object.keys(PAGE_MIN_ROLE)
    .filter((p) => pathname === p || pathname.startsWith(p + "/"))
    .sort((a, b) => b.length - a.length)
    .map((p) => PAGE_MIN_ROLE[p])[0] as Role | undefined;

  if (minRole && !hasMinRole(role, minRole)) {
    return <AccessDenied minRole={minRole} />;
  }

  return <>{children}</>;
}

function AccessDenied({ minRole }: { minRole: Role }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Access Restricted
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          This section requires{" "}
          <strong className="text-gray-700">
            {ROLE_LABEL[minRole] ?? minRole}
          </strong>{" "}
          access or higher. Contact your administrator to request access.
        </p>
        <Link
          href="/admin/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 btn-admin"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
