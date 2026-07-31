import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────
// Canonical inventory: 9 rooms, one per room number.
//
//   101–104   standard
//   105       family
//   202, 203  deluxe
//   201, 204  luxury   (bathtub, premium toiletries)
//
// Rates form a ladder: standard < deluxe < luxury < family. The
// deluxe rate is what room 201 was already priced at before the
// inventory was tidied up, so it is grounded in existing data
// rather than invented.
// ─────────────────────────────────────────────────────────────

const RATE = {
  standard: 4500,
  deluxe: 5500,
  luxury: 6500,
  family: 7500,
} as const;

const BASE_AMENITIES = ["AC", "WiFi", "TV", "Hot Water", "Room Service", "Extra Bed Available"];

const DESC = {
  standard: {
    descriptionEn:
      "A well-appointed standard room designed for comfort and relaxation. Perfect for couples or solo travellers seeking a peaceful hill station escape.",
    descriptionHi:
      "आराम और विश्राम के लिए डिज़ाइन किया गया एक सुसज्जित स्टैंडर्ड कमरा। जोड़ों या एकल यात्रियों के लिए एकदम सही।",
    descriptionMr:
      "आराम आणि विश्रांतीसाठी डिझाइन केलेली एक सुसज्जित स्टँडर्ड खोली. जोडप्यांसाठी किंवा एकट्या प्रवाशांसाठी उत्तम.",
  },
  deluxe: {
    descriptionEn:
      "A spacious deluxe room on the upper floor with an open, airy feel, a private balcony and upgraded furnishings.",
    descriptionHi:
      "ऊपरी मंजिल पर एक विशाल डीलक्स कमरा — खुला, हवादार, निजी बालकनी और बेहतर साज-सज्जा के साथ।",
    descriptionMr:
      "वरच्या मजल्यावरील एक प्रशस्त डिलक्स खोली — मोकळी, हवेशीर, खासगी बाल्कनी आणि उत्तम सजावटीसह.",
  },
  luxury: {
    descriptionEn:
      "Our finest room, featuring a luxurious soaking bathtub and premium toiletries. Unwind after a day of exploring Mahabaleshwar with a long, relaxing bath.",
    descriptionHi:
      "हमारा सबसे बेहतरीन कमरा — शानदार सोकिंग बाथटब और प्रीमियम प्रसाधन सामग्री के साथ। महाबलेश्वर की सैर के बाद तनाव दूर करें।",
    descriptionMr:
      "आमची सर्वोत्तम खोली — विलासी सोकिंग बाथटब आणि प्रीमियम प्रसाधनांसह. महाबळेश्वर एक्सप्लोर केल्यानंतर ताजेतवाने व्हा.",
  },
};

function standard(roomNumber: string, floor: number, extraAmenities: string[] = []) {
  return {
    roomNumber,
    name: "Standard Room",
    slug: "standard-room-" + roomNumber,
    roomType: "standard",
    floor,
    maxGuests: 2,
    extraBed: true,
    pricePerNight: RATE.standard,
    baseRate: RATE.standard,
    amenities: [...BASE_AMENITIES, ...extraAmenities],
    ...DESC.standard,
  };
}

function deluxe(roomNumber: string, floor: number) {
  return {
    roomNumber,
    name: "Deluxe Room",
    slug: "deluxe-room-" + roomNumber,
    roomType: "deluxe",
    floor,
    maxGuests: 2,
    extraBed: true,
    pricePerNight: RATE.deluxe,
    baseRate: RATE.deluxe,
    amenities: [...BASE_AMENITIES, "Balcony"],
    ...DESC.deluxe,
  };
}

function luxury(roomNumber: string, floor: number) {
  return {
    roomNumber,
    name: "Luxury Room",
    slug: "luxury-room-" + roomNumber,
    roomType: "luxury",
    floor,
    maxGuests: 2,
    extraBed: true,
    pricePerNight: RATE.luxury,
    baseRate: RATE.luxury,
    amenities: [...BASE_AMENITIES, "Bathtub", "Premium Toiletries"],
    ...DESC.luxury,
  };
}

const ROOMS = [
  // ── Floor 1 ──────────────────────────────────────────────────
  standard("101", 1),
  standard("102", 1),
  standard("103", 1),
  standard("104", 1, ["Forest View"]),
  {
    roomNumber: "105",
    name: "Family Room",
    slug: "family-room-105",
    roomType: "family",
    floor: 1,
    maxGuests: 4,
    extraBed: true,
    pricePerNight: RATE.family,
    baseRate: RATE.family,
    amenities: [...BASE_AMENITIES, "2 Double Beds", "Seating Area"],
    descriptionEn:
      "Our spacious family room fits the whole family comfortably with two double beds and a dedicated seating area. An ideal base for a Mahabaleshwar family holiday.",
    descriptionHi:
      "हमारा विशाल फैमिली रूम दो डबल बेड और एक समर्पित बैठक क्षेत्र के साथ पूरे परिवार को आराम से समायोजित करता है।",
    descriptionMr:
      "आमची प्रशस्त फॅमिली रूम दोन डबल बेड आणि एका समर्पित बसण्याच्या क्षेत्रासह संपूर्ण कुटुंबाला आरामात सामावून घेते.",
  },
  // ── Floor 2 ──────────────────────────────────────────────────
  luxury("201", 2),
  deluxe("202", 2),
  deluxe("203", 2),
  luxury("204", 2),
];

export { ROOMS, RATE };

async function main() {
  console.log("🏨 Resetting rooms...\n");
  console.log("⚠️  This DELETES all bookings, guests and invoices.");
  console.log("    To reshape existing data without losing it, use");
  console.log("    `npx tsx prisma/normalize-rooms.ts` instead.\n");

  await prisma.channelSyncLog.deleteMany();
  await prisma.housekeepingLog.deleteMany();
  await prisma.blockedDate.deleteMany();
  await prisma.roomStatus.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.room.deleteMany();
  console.log("  ✓ Old data cleared");

  for (const r of ROOMS) {
    await prisma.room.create({
      data: { ...r, images: [], photos: [], status: "available", isActive: true },
    });
  }
  console.log(`  ✓ ${ROOMS.length} rooms created\n`);

  console.log("Room summary:");
  console.log(`  Floor 1 — 101, 102, 103, 104 : Standard Room  ₹${RATE.standard.toLocaleString("en-IN")}/night (2 pax + extra bed)`);
  console.log(`  Floor 1 — 105                : Family Room    ₹${RATE.family.toLocaleString("en-IN")}/night (4 pax + extra bed)`);
  console.log(`  Floor 2 — 202, 203           : Deluxe Room    ₹${RATE.deluxe.toLocaleString("en-IN")}/night (2 pax + extra bed)`);
  console.log(`  Floor 2 — 201, 204           : Luxury Room    ₹${RATE.luxury.toLocaleString("en-IN")}/night (2 pax + extra bed, bathtub)`);
  console.log("\n✅ Done! Run seed-demo.ts next to add guests and bookings.");
}

if (require.main === module) {
  main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
