"use client";

import { MessageCircle } from "lucide-react";

export default function WhatsAppButton() {
  const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "919876543210";
  const message = encodeURIComponent(
    "Hi! I'd like to book a room at Rio Casa, Mahabaleshwar. Please assist."
  );
  const url = `https://wa.me/${phone}?text=${message}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#25D366] text-white rounded-full flex items-center justify-center shadow-lg hover:bg-[#1ebe57] transition-colors"
    >
      <MessageCircle size={26} fill="white" />
    </a>
  );
}
