import Link from "next/link";
import type { NavTab } from "@/lib/admin-nav";

/**
 * Header + tab bar for a hub page. Tabs are plain links, so the active tab
 * lives in the URL — refresh, back button and deep links all behave, and no
 * client-side state is needed.
 */
export default function HubTabs({
  title,
  subtitle,
  basePath,
  tabs,
  active,
}: {
  title: string;
  subtitle?: string;
  basePath: string;
  tabs: NavTab[];
  active: string;
}) {
  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="px-6 pt-5">
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}

        <nav className="flex gap-1 mt-4 -mb-px overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.slug === active;
            return (
              <Link
                key={tab.slug}
                href={`${basePath}?tab=${tab.slug}`}
                className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-[#4A6741] text-[#4A6741]"
                    : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
