import { NextRequest } from "next/server";
import { RATE_PLAN_ROOM_TYPES } from "@/lib/labels";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, failValidation, fail } from "@/lib/api-response";
import { isDayString } from "@/lib/dates";

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  roomType: z.enum(RATE_PLAN_ROOM_TYPES),
  baseRate: z.number().positive("Base rate must be positive"),
  extraBedRate: z.number().min(0).default(0),
  validFrom: z.string().refine(isDayString, "Use YYYY-MM-DD"),
  validTo: z.string().refine(isDayString, "Use YYYY-MM-DD"),
  weekendMarkup: z.number().min(0).max(100).default(0),
  minNights: z.number().int().min(1).default(1),
  priority: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const plans = await prisma.ratePlan.findMany({
    orderBy: [{ isActive: "desc" }, { priority: "desc" }, { validFrom: "asc" }],
  });

  return ok(plans);
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return failValidation(parsed.error);
  }

  const { validFrom, validTo, ...rest } = parsed.data;

  if (new Date(validTo) <= new Date(validFrom)) {
    return fail("Valid To must be after Valid From", 400);
  }

  const plan = await prisma.ratePlan.create({
    data: {
      ...rest,
      validFrom: new Date(validFrom),
      validTo: new Date(validTo),
    },
  });

  return ok(plan, 201);
}
