import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signAdminToken, ADMIN_COOKIE, cookieOptions } from "@/lib/admin-auth";
import { ok, fail } from "@/lib/api-response";
import { checkRateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  // Keyed by address, never by email: keying by account would let anyone lock
  // a staff member out by guessing at their address on purpose.
  const limit = await checkRateLimit("login", clientIp(req));
  if (!limit.ok) {
    return tooManyRequests(limit.retryAfter, "Too many sign-in attempts. Please wait and try again.");
  }

  try {
    const body = await req.json();
    const { email, password } = LoginSchema.parse(body);

    const staff = await prisma.staff.findUnique({ where: { email } });
    if (!staff || !staff.isActive) {
      return fail("Invalid credentials", 401);
    }

    const valid = await bcrypt.compare(password, staff.passwordHash);
    if (!valid) {
      return fail("Invalid credentials", 401);
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

    const res = ok({ name: staff.name, email: staff.email, role: staff.role });
    res.cookies.set(ADMIN_COOKIE, token, cookieOptions);
    return res;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return fail("Invalid input", 400);
    }
    console.error("Login error:", err);
    return fail("Server error", 500);
  }
}
