import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { hasMinRole, forbidden } from "@/lib/rbac";
import { z } from "zod";
import bcrypt from "bcryptjs";

const CreateSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.enum(["owner", "manager", "frontdesk", "housekeeping"]),
  password: z.string().min(6),
});

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });
  if (!hasMinRole(staff.role, "manager")) return forbidden("manager");

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

  return NextResponse.json({ success: true, staff: members });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const me = token ? await verifyAdminToken(token) : null;
  if (!me || me.role !== "owner") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });

  const existing = await prisma.staff.findUnique({ where: { email: parsed.data.email } });
  if (existing) return NextResponse.json({ success: false, error: "Email already in use" }, { status: 409 });

  const hash = await bcrypt.hash(parsed.data.password, 12);
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

  return NextResponse.json({ success: true, staff: member });
}
