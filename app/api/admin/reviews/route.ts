import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, failValidation } from "@/lib/api-response";
import { dateOnly, isDayString } from "@/lib/dates";

const CreateSchema = z.object({
  platform: z.enum(["google", "booking_com", "tripadvisor", "mmt", "other"]),
  guestName: z.string().min(1).max(100),
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().min(1).max(5000),
  reviewUrl: z.string().url().nullable().optional(),
  datePosted: z.string().refine(isDayString, "Use YYYY-MM-DD"),
  responded: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

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

  // The three KPI figures were three statements — `count()`, a second
  // `count()` narrowed to `responded`, and an `_avg` — all over the whole
  // table, unfiltered and differing only in what they asked about the same
  // rows. One `groupBy` answers all three: `responded` has two values, so the
  // grouped counts give the total and the responded share, and the rating sum
  // over the same groups gives the mean.
  //
  // Exact, not an approximation: the mean is the summed rating over the summed
  // count, which is what `_avg` computes. Ratings are integers, so no precision
  // is lost recombining them here.
  const [reviews, stats] = await Promise.all([
    prisma.reviewLog.findMany({ where, orderBy: { datePosted: "desc" }, take: 200 }),
    prisma.reviewLog.groupBy({
      by: ["responded"],
      _count: { _all: true },
      _sum: { rating: true },
    }),
  ]);

  let total = 0;
  let respondedCount = 0;
  let ratingSum = 0;
  for (const group of stats) {
    total += group._count._all;
    ratingSum += group._sum.rating ?? 0;
    if (group.responded) respondedCount = group._count._all;
  }

  return ok({ reviews, kpi: {
      total,
      avgRating: total > 0 ? ratingSum / total : 0,
      respondedPct: total > 0 ? (respondedCount / total) * 100 : 0,
    } });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return failValidation(parsed.error);
  }

  const review = await prisma.reviewLog.create({
    data: {
      platform: parsed.data.platform,
      guestName: parsed.data.guestName,
      rating: parsed.data.rating,
      reviewText: parsed.data.reviewText,
      reviewUrl: parsed.data.reviewUrl ?? null,
      datePosted: dateOnly(parsed.data.datePosted),
      responded: parsed.data.responded ?? false,
      respondedAt: parsed.data.responded ? new Date() : null,
      notes: parsed.data.notes ?? null,
    },
  });

  return ok(review);
}
