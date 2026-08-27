import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireRole } from "@/lib/api-auth";
import { ok, fail, failValidation } from "@/lib/api-response";
import { MIN_PASSWORD_LENGTH, BCRYPT_COST } from "@/lib/passwords";

const CreateSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.enum(["owner", "manager", "frontdesk", "housekeeping"]),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
});

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const members = await prisma.staff.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      lastLogin: true,
      createdAt: true,
    },
  });

  return ok(members);
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "owner");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return failValidation(parsed.error);

  const existing = await prisma.staff.findUnique({ where: { email: parsed.data.email } });
  if (existing) return fail("Email already in use", 409);

  const hash = await bcrypt.hash(parsed.data.password, BCRYPT_COST);
  const member = await prisma.staff.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      role: parsed.data.role,
      passwordHash: hash,
      permissions: [],
    },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });

  return ok(member);
}
