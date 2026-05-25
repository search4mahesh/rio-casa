import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

async function getDashboardData() {
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
    recentBookings,
    upcomingArrivals,
  ] = await Promise.all([
    // Today's check-ins
    prisma.booking.count({
      where: { checkIn: { gte: todayStart, lt: todayEnd }, status: { in: ["confirmed", "checked_in"] } },
    }),
    // Today's check-outs
    prisma.booking.count({
      where: { checkOut: { gte: todayStart, lt: todayEnd }, status: { in: ["checked_in", "checked_out"] } },
    }),
    // Currently checked in
    prisma.booking.count({ where: { status: "checked_in" } }),
    // Total active rooms
    prisma.room.count({ where: { isActive: true } }),
    // This month revenue
    prisma.booking.aggregate({
      where: {
        createdAt: { gte: monthStart },
        status: { notIn: ["cancelled", "no_show"] },
      },
      _sum: { totalAmount: true },
    }),
    // Recent bookings (last 8)
    prisma.booking.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { room: { select: { name: true, roomNumber: true } } },
    }),
    // Upcoming arrivals (next 7 days)
    prisma.booking.findMany({
      where: {
        checkIn: { gte: todayStart, lt: new Date(todayStart.getTime() + 7 * 86400000) },
        status: "confirmed",
      },
      include: { room: { select: { name: true, roomNumber: true } } },
      orderBy: { checkIn: "asc" },
      take: 10,
    }),
  ]);

  const occupancyPct = totalRooms > 0 ? Math.round((checkedInCount / totalRooms) * 100) : 0;
  const monthRevenueAmt = Number(monthRevenue._sum.totalAmount ?? 0);

  return {
    todayCheckins,
    todayCheckouts,
    checkedInCount,
    totalRooms,
    occupancyPct,
    monthRevenueAmt,
    recentBookings,
    upcomingArrivals,
  };
}

function fmtCurrency(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const STATUS_COLOR: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-700",
  checked_in: "bg-green-100 text-green-700",
  checked_out: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-600",
  no_show: "bg-orange-100 text-orange-700",
};

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) redirect("/admin/login");

  const data = await getDashboardData();

  const stats = [
    {
      label: "Today's Check-ins",
      value: data.todayCheckins,
      icon: "🏨",
      color: "bg-green-50 border-green-200",
      valueColor: "text-green-700",
    },
    {
      label: "Today's Check-outs",
      value: data.todayCheckouts,
      icon: "👋",
      color: "bg-blue-50 border-blue-200",
      valueColor: "text-blue-700",
    },
    {
      label: "Occupancy",
      value: `${data.occupancyPct}%`,
      sub: `${data.checkedInCount} / ${data.totalRooms} rooms`,
      icon: "📊",
      color: "bg-amber-50 border-amber-200",
      valueColor: "text-amber-700",
    },
    {
      label: "Month Revenue",
      value: fmtCurrency(data.monthRevenueAmt),
      icon: "₹",
      color: "bg-purple-50 border-purple-200",
      valueColor: "text-purple-700",
    },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {staff.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.color}`}>
            <div className="text-xl mb-2">{s.icon}</div>
            <div className={`text-2xl font-bold ${s.valueColor}`}>{s.value}</div>
            {s.sub && <div className="text-xs text-gray-500 mt-0.5">{s.sub}</div>}
            <div className="text-xs text-gray-600 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming arrivals */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-medium text-gray-900 mb-4">Upcoming Arrivals (7 days)</h2>
          {data.upcomingArrivals.length === 0 ? (
            <p className="text-sm text-gray-400">No arrivals in the next 7 days</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.upcomingArrivals.map((b) => (
                <a key={b.id} href={`/admin/bookings/${b.id}`} className="flex items-center justify-between py-2.5 hover:bg-gray-50 -mx-1 px-1 rounded-lg transition-colors">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{b.guestName}</div>
                    <div className="text-xs text-gray-500">
                      {b.room.roomNumber ? `#${b.room.roomNumber} ` : ""}{b.room.name} · {b.adults} adult{b.adults !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-[#4A6741]">{fmtDate(b.checkIn)}</div>
                    <div className="text-xs text-gray-400">{b.nights}N</div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Recent bookings */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium text-gray-900">Recent Bookings</h2>
            <a href="/admin/bookings" className="text-xs text-[#4A6741] hover:underline">View all</a>
          </div>
          <div className="divide-y divide-gray-100">
            {data.recentBookings.map((b) => (
              <a key={b.id} href={`/admin/bookings/${b.id}`} className="flex items-center justify-between py-2.5 hover:bg-gray-50 -mx-1 px-1 rounded-lg transition-colors">
                <div>
                  <div className="text-sm font-medium text-gray-900">{b.guestName}</div>
                  <div className="text-xs text-gray-500 font-mono">{b.bookingNumber}</div>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLOR[b.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {b.status.replace(/_/g, " ")}
                  </span>
                  <div className="text-xs text-gray-500">
                    {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(b.totalAmount)}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
