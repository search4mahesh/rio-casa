import { NextRequest } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { okMessage, failValidation } from "@/lib/api-response";
import { escapeHtml, escapeHtmlWithBreaks } from "@/lib/html-email";
import { checkRateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  message: z.string().min(10),
});

export async function POST(req: NextRequest) {
  // Unthrottled, this wrote a row and sent an email per call — so the cost of
  // spamming it was ours, in Resend volume and sender reputation (B-64).
  const limit = await checkRateLimit("contact", clientIp(req));
  if (!limit.ok) {
    return tooManyRequests(
      limit.retryAfter,
      "You have sent several messages already. Please wait a little before sending another."
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return failValidation(parsed.error);
  }
  const { name, email, phone, message } = parsed.data;

  // The write must succeed — it's the only durable record of this inquiry.
  // This used to only `console.log` the body, so a submission that never got
  // read here existed nowhere else once the log rotated (B-36).
  const inquiry = await prisma.contactInquiry.create({
    data: { name, email, phone, message },
  });

  // Best-effort staff notification, same reasoning as the booking-confirmation
  // email in app/api/payment/verify/route.ts: the inquiry is already recorded,
  // so a Resend outage must not turn a successful submission into an error the
  // guest sees.
  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    try {
      // The SDK resolves `{ data, error }` for an API-level failure (bad key,
      // rejected recipient, …) rather than throwing — only a network failure
      // throws. Checking `error` explicitly is what makes this genuinely
      // best-effort rather than silently pretending to have sent.
      const { error: sendError } = await resend.emails.send({
        from: process.env.EMAIL_FROM ?? "bookings@riocasa.in",
        to: process.env.EMAIL_RESORT ?? "info@riocasa.in",
        replyTo: email,
        // The subject is plain text in every client — no escaping, or the
        // reader sees `&amp;` in their inbox list.
        subject: `New contact inquiry — ${name}`,
        html: `
          <div style="font-family:Arial;max-width:600px;padding:20px;color:#2C2416;">
            <p><strong>Name:</strong> ${escapeHtml(name)}</p>
            <p><strong>Email:</strong> ${escapeHtml(email)}</p>
            <p><strong>Phone:</strong> ${escapeHtml(phone) || "—"}</p>
            <p><strong>Message:</strong></p>
            <p>${escapeHtmlWithBreaks(message)}</p>
          </div>
        `,
      });
      if (sendError) {
        console.error(`[contact] Notification email failed for inquiry ${inquiry.id}:`, sendError);
      }
    } catch (err) {
      console.error(`[contact] Notification email failed for inquiry ${inquiry.id}:`, err);
    }
  }

  return okMessage("Inquiry received. We will contact you shortly.");
}
