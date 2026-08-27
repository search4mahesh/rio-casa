import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { okMessage, fail, failValidation } from "@/lib/api-response";
import { MIN_PASSWORD_LENGTH, BCRYPT_COST } from "@/lib/passwords";

// ─────────────────────────────────────────────────────────────
// Change your own password.
//
// `passwordHash` used to be written in exactly one place — staff
// *creation* — so the four accounts `prisma/seed-admin.ts` seeds kept
// their seeded passwords forever. `admin123` on the owner account is
// printed in README.md and test.md, both tracked in git, and the only
// remedies were creating a second owner or editing the database by
// hand (B-59).
//
// Deliberately self-service and not role-gated: every rank has a
// password, so every rank needs to be able to rotate it. An owner
// resetting *someone else's* password is a separate, unbuilt concern —
// it needs a delivery channel for the new one, which this route does
// not need because the person changing it is the person typing it.
// ─────────────────────────────────────────────────────────────

const Schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `New password must be at least ${MIN_PASSWORD_LENGTH} characters`),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must be different from the current one",
    path: ["newPassword"],
  });

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return failValidation(parsed.error);

  // Read the row rather than trusting the token: the token carries a 12-hour-old
  // snapshot of this account, and an account deactivated since then must not be
  // able to reset its own way back in.
  const staff = await prisma.staff.findUnique({
    where: { id: auth.staff.staffId },
    select: { id: true, name: true, passwordHash: true, isActive: true },
  });
  if (!staff || !staff.isActive) {
    return fail("Your account is no longer active — please contact the owner.", 403);
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, staff.passwordHash);
  if (!valid) {
    // Same wording as a failed login, and deliberately not "wrong password" —
    // this endpoint is reachable with a stolen session cookie, and the reply
    // should not confirm a guess to whoever is holding it.
    return fail("Current password is incorrect", 401);
  }

  const hash = await bcrypt.hash(parsed.data.newPassword, BCRYPT_COST);

  await prisma.staff.update({
    where: { id: staff.id },
    data: { passwordHash: hash },
  });

  // Bookkeeping, and non-fatal for the same reason as the booking audit rows:
  // the password is already changed, and losing the log entry must not tell the
  // caller their change failed when it did not.
  try {
    await prisma.auditLog.create({
      data: {
        userId: staff.id,
        action: "change_password",
        entityType: "staff",
        entityId: staff.id,
        // Never the password, old or new — an audit row is not a place to put
        // one, and the hash is enough to confirm the change happened.
        newValue: { by: staff.name },
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      },
    });
  } catch (err) {
    console.error("[auth/password] Audit row failed for staff", staff.id, err);
  }

  // The session cookie stays valid: the JWT carries no password material, so
  // there is nothing in it to invalidate. Sessions already issued on *other*
  // devices also survive, which is the same gap B-60 describes — role and
  // status are read at login and never re-checked. Closing it needs a token
  // version on `Staff`, not a change here.
  return okMessage("Password changed.");
}
