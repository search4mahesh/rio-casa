"use client";

import { MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { PROPERTY } from "@/lib/property";
import { whatsappUrl } from "@/lib/whatsapp";

/**
 * Pages that pin their own action to the bottom of a phone screen.
 *
 * The booking wizard pins its running total and "Continue"; a room detail page
 * pins the price and "Book This Room". A floating button in that corner lands
 * on the primary action of the page, and nudging it up by a fixed amount does
 * not help — the wizard’s bar grows with the number of room types a party
 * picks, so any offset is wrong for some selection.
 *
 * So on a narrow screen it steps aside entirely: the guest is mid-booking, and
 * a chat button competing with the button that completes it is not what that
 * moment needs. Desktop has the room, and keeps it.
 *
 * `/rooms` itself is not in this list — the catalogue pins nothing, and the
 * button is genuinely useful to someone browsing it.
 */
function hasPinnedActionBar(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname.includes("/booking")) return true;
  // A room *detail* page, i.e. /rooms/<slug> — with or without a locale prefix.
  return /\/rooms\/[^/]+/.test(pathname);
}

export default function WhatsAppButton() {
  const pathname = usePathname();
  const pinnedBarBelow = hasPinnedActionBar(pathname);

  const url = whatsappUrl(
    `Hi! I'd like to book a room at ${PROPERTY.name}, ${PROPERTY.city}. Please assist.`
  );
  // No number configured, no button. It used to fall back to a real number
  // belonging to someone else, who then received guests' booking enquiries
  // (B-73).
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className={`fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-12 h-12 sm:w-14 sm:h-14 bg-[#25D366] text-white rounded-full items-center justify-center shadow-lg hover:bg-[#1ebe57] transition-colors ${
        pinnedBarBelow ? "hidden sm:flex" : "flex"
      }`}
    >
      <MessageCircle size={24} className="sm:hidden" fill="white" />
      <MessageCircle size={26} className="hidden sm:block" fill="white" />
    </a>
  );
}
