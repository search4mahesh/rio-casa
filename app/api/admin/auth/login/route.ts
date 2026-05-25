import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signAdminToken, ADMIN_COOKIE, cookieOptions } from "@/lib/admin-auth";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = LoginSchema.parse(body);

    const staff = await prisma.staff.findUnique({ where: { email } });
    if (!staff || !staff.isActive) {
      return NextResponse.json({ success: false, error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, staff.passwordHash);
    if (!valid) {
      return NextResponse.json({ success: false, error: "Invalid credentials" }, { status: 401 });
    }

    await prisma.staff.update({
      where: { id: staff.id },
      data: { lastLogin: new Date() },
    });

    const token = await signAdminToken({
      staffId: staff.id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
    });

    const res = NextResponse.json({
      success: true,
      staff: { name: staff.name, email: staff.email, role: staff.role },
    });
    res.cookies.set(ADMIN_COOKIE, token, cookieOptions);
    return res;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    console.error("Login error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
