import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { hasMinRole, forbidden } from "@/lib/rbac";

const CreateSchema = z.object({
  code: z.string().min(2).max(30).regex(/^[A-Z0-9_-]+$/, "Code must be uppercase letters, numbers, _ or -"),
  name: z.string().max(100).optional(),
  discountType: z.enum(["percentage", "flat"]),
  discountValue: z.number().positive("Discount value must be positive"),
  maxDiscount: z.number().positive().optional(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  minNights: z.number().int().min(1).default(1),
  minAmount: z.number().min(0).default(0),
  usageLimit: z.number().int().positive().optional(),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });
  if (!hasMinRole(staff.role, "manager")) return forbidden("manager");

  const promos = await prisma.promotion.findMany({
    orderBy: [{ isActive: "desc" }, { validFrom: "asc" }],
  });

  return NextResponse.json({ success: true, promos });
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

  const { validFrom, validTo, ...rest } = parsed.data;

  if (new Date(validTo) <= new Date(validFrom)) {
    return NextResponse.json({ success: false, error: "Valid To must be after Valid From" }, { status: 400 });
  }

  // Check for duplicate code
  const existing = await prisma.promotion.findUnique({ where: { code: rest.code } });
  if (existing) {
    return NextResponse.json({ success: false, error: `Code "${rest.code}" already exists` }, { status: 409 });
  }

  const promo = await prisma.promotion.create({
    data: {
      ...rest,
      validFrom: new Date(validFrom),
      validTo: new Date(validTo),
    },
  });

  return NextResponse.json({ success: true, promo }, { status: 201 });
}
