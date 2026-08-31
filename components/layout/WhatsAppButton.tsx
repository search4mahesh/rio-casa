"use client";

import { MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { PROPERTY } from "@/lib/property";

export default function WhatsAppButton() {
  const pathname = usePathname();
  // The booking wizard pins its running total and "Continue" to the bottom of
  // the viewport on a phone. A floating button in that corner lands on the
  // primary action of the page, and nudging it up by a fixed amount does not
  // help: the bar grows with the number of room types a party picks, so any
  // offset is wrong for some selection. It also covers the room prices as the
  // list scrolls past.
  //
  // So on a narrow screen it steps aside entirely while the guest is booking —
  // they are mid-checkout, and a chat button competing with "Continue" is not
  // what that moment needs. Desktop has the room, and keeps it.
  const inBookingFlow = pathname?.includes("/booking") ?? false;

  const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "919876543210";
  const message = encodeURIComponent(
    `Hi! I'd like to book a room at ${PROPERTY.name}, ${PROPERTY.city}. Please assist.`
  );
  const url = `https://wa.me/${phone}?text=${message}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className={`fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-12 h-12 sm:w-14 sm:h-14 bg-[#25D366] text-white rounded-full items-center justify-center shadow-lg hover:bg-[#1ebe57] transition-colors ${
        inBookingFlow ? "hidden sm:flex" : "flex"
      }`}
    >
      <MessageCircle size={24} className="sm:hidden" fill="white" />
      <MessageCircle size={26} className="hidden sm:block" fill="white" />
    </a>
  );
}
