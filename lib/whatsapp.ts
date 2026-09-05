/**
 * The property's WhatsApp link, or nothing.
 *
 * `NEXT_PUBLIC_WHATSAPP_NUMBER` is a per-deployment value, so it lives in the
 * environment rather than in `lib/property.ts` with the facts that hold
 * wherever the app is deployed.
 *
 * **There is deliberately no fallback number.** Three call sites each had
 * `?? "919876543210"`, a real number belonging to someone else, so a
 * deployment that forgot the variable sent guests — with their booking
 * references and enquiries — to a stranger's phone (B-73). A missing number is
 * a configuration mistake; a wrong number is a stranger receiving somebody's
 * reservation details, which is worse than no button at all.
 *
 * Returns `null` when unset, and every caller renders nothing rather than a
 * dead or misdirected link. `app/[locale]/booking/error.tsx` already worked
 * this way and is where the pattern comes from.
 */
export function whatsappUrl(message: string): string | null {
  const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
