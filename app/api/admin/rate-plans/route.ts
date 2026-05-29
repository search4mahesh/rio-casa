import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  roomType: z.enum(["deluxe", "premium", "family", "all"]),
  baseRate: z.number().positive("Base rate must be positive"),
  extraBedRate: z.number().min(0).default(0),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  weekendMarkup: z.number().min(0).max(100).default(0),
  minNights: z.number().int().min(1).default(1),
  priority: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });

  const plans = await prisma.ratePlan.findMany({
    orderBy: [{ isActive: "desc" }, { priority: "desc" }, { validFrom: "asc" }],
  });

  return NextResponse.json({ success: true, plans });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { validFrom, validTo, ...rest } = parsed.data;

  if (new Date(validTo) <= new Date(validFrom)) {
    return NextResponse.json({ success: false, error: "Valid To must be after Valid From" }, { status: 400 });
  }

  const plan = await prisma.ratePlan.create({
    data: {
      ...rest,
      validFrom: new Date(validFrom),
      validTo: new Date(validTo),
    },
  });

  return NextResponse.json({ success: true, plan }, { status: 201 });
}
