import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { hasMinRole, forbidden } from "@/lib/rbac";

const CreateSchema = z.object({
  platform: z.enum(["google", "booking_com", "tripadvisor", "mmt", "other"]),
  guestName: z.string().min(1).max(100),
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().min(1).max(5000),
  reviewUrl: z.string().url().nullable().optional(),
  datePosted: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  responded: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });
  if (!hasMinRole(staff.role, "manager")) return forbidden("manager");

  const { searchParams } = req.nextUrl;
  const platform = searchParams.get("platform");
  const responded = searchParams.get("responded");
  const minRating = searchParams.get("minRating");
  const maxRating = searchParams.get("maxRating");

  const where: Record<string, unknown> = {};
  if (platform && platform !== "all") where.platform = platform;
  if (responded === "true") where.responded = true;
  if (responded === "false") where.responded = false;
  if (minRating || maxRating) {
    const ratingFilter: Record<string, number> = {};
    if (minRating) ratingFilter.gte = parseInt(minRating);
    if (maxRating) ratingFilter.lte = parseInt(maxRating);
    where.rating = ratingFilter;
  }

  const [reviews, totalCount, respondedCount, avgRatingResult] = await Promise.all([
    prisma.reviewLog.findMany({ where, orderBy: { datePosted: "desc" }, take: 200 }),
    prisma.reviewLog.count(),
    prisma.reviewLog.count({ where: { responded: true } }),
    prisma.reviewLog.aggregate({ _avg: { rating: true } }),
  ]);

  return NextResponse.json({
    success: true,
    reviews,
    kpi: {
      total: totalCount,
      avgRating: avgRatingResult._avg.rating ?? 0,
      respondedPct: totalCount > 0 ? (respondedCount / totalCount) * 100 : 0,
    },
  });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });
  if (!hasMinRole(staff.role, "manager")) return forbidden("manager");

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const review = await prisma.reviewLog.create({
    data: {
      platform: parsed.data.platform,
      guestName: parsed.data.guestName,
      rating: parsed.data.rating,
      reviewText: parsed.data.reviewText,
      reviewUrl: parsed.data.reviewUrl ?? null,
      datePosted: new Date(parsed.data.datePosted + "T00:00:00"),
      responded: parsed.data.responded ?? false,
      respondedAt: parsed.data.responded ? new Date() : null,
      notes: parsed.data.notes ?? null,
    },
  });

  return NextResponse.json({ success: true, review });
}
