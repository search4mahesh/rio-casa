import { NextRequest } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, failValidation, fail } from "@/lib/api-response";
import { dateOnly, today as todayDate, isDayString } from "@/lib/dates";
import { escapeHtml } from "@/lib/html-email";
import { PROPERTY } from "@/lib/property";

// ─── Audience resolver ────────────────────────────────────────────────────────

const FilterSchema = z.object({
  type: z.enum(["upcoming-arrivals", "checked-in", "past-guests", "manual"]),
  days: z.number().int().min(1).max(30).optional(),
  fromDate: z.string().refine(isDayString, "Use a real date in YYYY-MM-DD form").optional(),
  toDate: z.string().refine(isDayString, "Use a real date in YYYY-MM-DD form").optional(),
  recipients: z.array(z.object({
    guestName: z.string(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
  })).optional(),
});

type Filter = z.infer<typeof FilterSchema>;

type Recipient = {
  guestName: string;
  phone: string | null;
  email: string | null;
  bookingNumber?: string;
  checkIn?: string;
  roomName?: string;
};

/** The identifier a campaign actually reaches someone on. */
type Channel = "email" | "whatsapp";

/**
 * One message per person, keyed on the identifier that channel messages them by.
 *
 * This used to be a `distinct: ["guestEmail"]` in the past-guests query, which
 * is right for an email campaign — two stays by one guest should not mean two
 * emails — but the channel filter ran *afterwards*, so a WhatsApp campaign had
 * already been deduplicated on the wrong column. The walk-in form takes an
 * email marked "optional" and stores `""` when it is blank, so every guest
 * without one shared a single key and all but one were dropped before their
 * phone numbers were ever looked at (B-50).
 */
function dedupeByChannel(rows: Recipient[], channel: Channel): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const r of rows) {
    const key = (channel === "email" ? r.email : r.phone)?.trim().toLowerCase() ?? "";
    // No usable identifier — keep it, so it is counted as skipped rather than
    // collapsed into whichever other contactless guest happened to come first.
    if (!key) { out.push(r); continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

async function resolveRecipients(filter: Filter, channel: Channel): Promise<Recipient[]> {
  if (filter.type === "manual") {
    return (filter.recipients ?? []).map((r) => ({
      guestName: r.guestName,
      phone: r.phone ?? null,
      email: r.email ?? null,
    }));
  }

  const today = todayDate();

  if (filter.type === "upcoming-arrivals") {
    const days = filter.days ?? 1;
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + days);
    const rows = await prisma.booking.findMany({
      where: { checkIn: { gte: today, lt: endDate }, status: "confirmed" },
      select: {
        guestName: true, guestPhone: true, guestEmail: true,
        bookingNumber: true, checkIn: true,
        room: { select: { name: true } },
      },
      orderBy: { checkIn: "asc" },
      take: 500,
    });
    return rows.map((r) => ({
      guestName: r.guestName, phone: r.guestPhone, email: r.guestEmail,
      bookingNumber: r.bookingNumber,
      checkIn: r.checkIn.toISOString().split("T")[0],
      roomName: r.room.name,
    }));
  }

  if (filter.type === "checked-in") {
    const rows = await prisma.booking.findMany({
      where: { status: "checked_in" },
      select: {
        guestName: true, guestPhone: true, guestEmail: true,
        bookingNumber: true, checkIn: true,
        room: { select: { name: true } },
      },
      take: 500,
    });
    return rows.map((r) => ({
      guestName: r.guestName, phone: r.guestPhone, email: r.guestEmail,
      bookingNumber: r.bookingNumber,
      checkIn: r.checkIn.toISOString().split("T")[0],
      roomName: r.room.name,
    }));
  }

  // past-guests
  const fromDate = filter.fromDate ? dateOnly(filter.fromDate) : new Date(today.getTime() - 365 * 86400000);
  const toDate = filter.toDate ? new Date(filter.toDate + "T23:59:59") : new Date(today.getTime() - 30 * 86400000);
  const rows = await prisma.booking.findMany({
    where: { checkOut: { gte: fromDate, lte: toDate }, status: "checked_out" },
    select: {
      guestName: true, guestPhone: true, guestEmail: true,
      bookingNumber: true, checkIn: true,
      room: { select: { name: true } },
    },
    take: 1000,
  });
  // Deduplicated here rather than in SQL, because which column identifies a
  // person depends on the channel — see `dedupeByChannel`.
  return dedupeByChannel(
    rows.map((r) => ({
      guestName: r.guestName, phone: r.guestPhone, email: r.guestEmail,
      bookingNumber: r.bookingNumber,
      checkIn: r.checkIn.toISOString().split("T")[0],
      roomName: r.room.name,
    })),
    channel
  );
}

/**
 * Fill the merge tags in a staff-composed template.
 *
 * `escape` is off for the WhatsApp path — that is a plain-text `wa.me` URL,
 * where HTML entities would be shown to the guest literally ("Rahul &amp;
 * Co"). It is on for email, where the substituted values (a guest name typed
 * at booking) would otherwise be markup inside a message the property appears
 * to have written (B-63).
 */
function substituteTags(template: string, r: Recipient, escape = false): string {
  const v = (value: string | null | undefined) =>
    escape ? escapeHtml(value ?? "") : (value ?? "");

  return template
    .replace(/\{\{\s*guestName\s*\}\}/g, v(r.guestName))
    .replace(/\{\{\s*bookingNumber\s*\}\}/g, v(r.bookingNumber))
    .replace(/\{\{\s*checkIn\s*\}\}/g, v(r.checkIn))
    .replace(/\{\{\s*roomName\s*\}\}/g, v(r.roomName));
}

// ─── GET: list past communications ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const logs = await prisma.communicationLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return ok(logs);
}

// ─── POST: send (with action=preview to dry-run) ──────────────────────────────

const SendSchema = z.object({
  action: z.enum(["preview", "send"]).default("send"),
  channel: z.enum(["email", "whatsapp"]),
  filter: FilterSchema,
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(4000),
});

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;
  const staff = auth.staff;

  const reqBody = await req.json();
  const parsed = SendSchema.safeParse(reqBody);
  if (!parsed.success) {
    return failValidation(parsed.error);
  }

  const { action, channel, filter, subject, body } = parsed.data;

  if (channel === "email" && !subject) {
    return fail("Subject is required for email", 400);
  }

  const recipients = await resolveRecipients(filter, channel);

  // Channel-specific recipient filtering
  const reachable = recipients.filter((r) => (channel === "email" ? !!r.email : !!r.phone));

  if (action === "preview") {
    const sample = reachable[0]
      ? {
          to: channel === "email" ? reachable[0].email : reachable[0].phone,
          subject: subject ? substituteTags(subject, reachable[0]) : undefined,
          body: substituteTags(body, reachable[0]),
        }
      : null;
    return ok({
        totalRecipients: recipients.length,
        reachableCount: reachable.length,
        skippedCount: recipients.length - reachable.length,
        recipients: reachable.slice(0, 10),
        sample,
      });
  }

  // Live send
  if (reachable.length === 0) {
    return fail("No reachable recipients", 400);
  }

  let sentCount = 0;
  const errors: string[] = [];
  const whatsappLinks: { phone: string; url: string; guestName: string }[] = [];

  if (channel === "email") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return fail("Email service not configured", 503);
    }
    const resend = new Resend(apiKey);

    for (const r of reachable) {
      try {
        // The SDK resolves `{ data, error }` for an API-level failure (bad
        // key, rejected recipient, …) rather than throwing — only a network
        // failure throws. Counting on the promise merely resolving used to
        // credit `sentCount` for every recipient regardless, so a bad key
        // reported "sent to N guests" for a campaign that reached nobody (B-37).
        const { error: sendError } = await resend.emails.send({
          from: process.env.EMAIL_FROM ?? PROPERTY.bookingsEmail,
          to: r.email!,
          subject: substituteTags(subject!, r),
          // The template is staff-authored and may legitimately carry markup;
          // only the substituted guest values are escaped (B-63). Newlines
          // become <br/> after substitution, as before.
          html: `<div style="font-family: Arial; max-width: 600px; padding: 20px; color: #2C2416;">${substituteTags(body, r, true).replace(/\n/g, "<br/>")}</div>`,
        });
        if (sendError) {
          errors.push(`${r.guestName}: ${sendError.message}`);
          continue;
        }
        sentCount += 1;
      } catch (err) {
        errors.push(`${r.guestName}: ${err instanceof Error ? err.message : "send failed"}`);
      }
    }
  } else {
    // WhatsApp: generate click-to-chat URLs (owner clicks each to send via WhatsApp Web/app)
    for (const r of reachable) {
      const cleanPhone = (r.phone ?? "").replace(/\D/g, "");
      if (cleanPhone.length < 10) {
        errors.push(`${r.guestName}: invalid phone`);
        continue;
      }
      const message = encodeURIComponent(substituteTags(body, r));
      whatsappLinks.push({
        guestName: r.guestName,
        phone: r.phone!,
        url: `https://wa.me/${cleanPhone}?text=${message}`,
      });
      sentCount += 1;
    }
  }

  // Log the campaign
  await prisma.communicationLog.create({
    data: {
      channel,
      subject: subject ?? null,
      body,
      recipients: sentCount,
      sentBy: staff.name,
      filter: JSON.stringify(filter),
    },
  });

  return ok({ sentCount, skippedCount: recipients.length - sentCount, errors, whatsappLinks: channel === "whatsapp" ? whatsappLinks : undefined });
}
