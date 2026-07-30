import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { hasMinRole } from "@/lib/rbac-utils";
import { prisma } from "@/lib/prisma";
import RoomBoard from "@/components/admin/RoomBoard";

async function getTodayData() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    todayCheckins,
    todayCheckouts,
    checkedInCount,
    totalRooms,
    monthRevenue,
    arrivals,
    departures,
  ] = await Promise.all([
    prisma.booking.count({
      where: { checkIn: { gte: todayStart, lt: todayEnd }, status: { in: ["confirmed", "checked_in"] } },
    }),
    prisma.booking.count({
      where: { checkOut: { gte: todayStart, lt: todayEnd }, status: { in: ["checked_in", "checked_out"] } },
    }),
    prisma.booking.count({ where: { status: "checked_in" } }),
    prisma.room.count({ where: { isActive: true } }),
    prisma.booking.aggregate({
      where: { createdAt: { gte: monthStart }, status: { notIn: ["cancelled", "no_show"] } },
      _sum: { totalAmount: true },
    }),
    // Arriving today
    prisma.booking.findMany({
      where: { checkIn: { gte: todayStart, lt: todayEnd }, status: { in: ["confirmed", "checked_in"] } },
      include: { room: { select: { name: true, roomNumber: true } } },
      orderBy: { checkIn: "asc" },
    }),
    // Departing today
    prisma.booking.findMany({
      where: { checkOut: { gte: todayStart, lt: todayEnd }, status: { in: ["checked_in", "checked_out"] } },
      include: { room: { select: { name: true, roomNumber: true } } },
      orderBy: { checkOut: "asc" },
    }),
  ]);

  return {
    todayCheckins,
    todayCheckouts,
    occupancyPct: totalRooms > 0 ? Math.round((checkedInCount / totalRooms) * 100) : 0,
    checkedInCount,
    totalRooms,
    monthRevenueAmt: Number(monthRevenue._sum.totalAmount ?? 0),
    arrivals,
    departures,
  };
}

function fmtCurrency(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

const STATUS_COLOR: Record<string, string> = {
  confirmed:   "bg-blue-100 text-blue-700",
  checked_in:  "bg-green-100 text-green-700",
  checked_out: "bg-gray-100 text-gray-600",
  cancelled:   "bg-red-100 text-red-600",
  no_show:     "bg-orange-100 text-orange-700",
};

/** Arrivals / departures list — the two things that actually happen today. */
function MovementList({
  title,
  empty,
  bookings,
}: {
  title: string;
  empty: string;
  bookings: {
    id: string;
    guestName: string;
    status: string;
    adults: number;
    nights: number;
    room: { name: string; roomNumber: string | null };
  }[];
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium text-gray-900">{title}</h2>
        <span className="text-xs text-gray-400">{bookings.length}</span>
      </div>
      {bookings.length === 0 ? (
        <p className="text-sm text-gray-400">{empty}</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {bookings.map((b) => (
            <Link
              key={b.id}
              href={`/admin/bookings/${b.id}`}
              className="flex items-center justify-between py-2.5 hover:bg-gray-50 -mx-1 px-1 rounded-lg transition-colors"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{b.guestName}</div>
                <div className="text-xs text-gray-500 truncate">
                  {b.room.roomNumber ? `#${b.room.roomNumber} ` : ""}{b.room.name} · {b.adults} adult{b.adults !== 1 ? "s" : ""} · {b.nights}N
                </div>
              </div>
              <span className={`ml-3 flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLOR[b.status] ?? "bg-gray-100 text-gray-600"}`}>
                {b.status.replace(/_/g, " ")}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function TodayPage() {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) redirect("/admin/login");

  const data = await getTodayData();

  const isFrontDesk = hasMinRole(staff.role, "frontdesk");
  const isManager = hasMinRole(staff.role, "manager");

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  // Revenue is a manager-and-above concern; everyone else sees three tiles.
  const stats = [
    { label: "Arriving today",  value: data.todayCheckins,           color: "bg-green-50 border-green-200",   valueColor: "text-green-700" },
    { label: "Departing today", value: data.todayCheckouts,          color: "bg-blue-50 border-blue-200",     valueColor: "text-blue-700" },
    { label: "Occupancy",       value: `${data.occupancyPct}%`,      color: "bg-amber-50 border-amber-200",   valueColor: "text-amber-700",
      sub: `${data.checkedInCount} / ${data.totalRooms} rooms` },
    ...(isManager
      ? [{ label: "Revenue this month", value: fmtCurrency(data.monthRevenueAmt), color: "bg-purple-50 border-purple-200", valueColor: "text-purple-700" }]
      : []),
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          Good {greeting}, {staff.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      <div className={`grid grid-cols-2 gap-4 mb-6 ${isManager ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {stats.map((s) => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.color}`}>
            <div className={`text-2xl font-bold ${s.valueColor}`}>{s.value}</div>
            {s.sub && <div className="text-xs text-gray-500 mt-0.5">{s.sub}</div>}
            <div className="text-xs text-gray-600 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {isFrontDesk && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <MovementList
            title="Arrivals"
            empty="No arrivals today"
            bookings={data.arrivals}
          />
          <MovementList
            title="Departures"
            empty="No departures today"
            bookings={data.departures}
          />
        </div>
      )}

      <RoomBoard canCheckIn={isFrontDesk} />
    </div>
  );
}
