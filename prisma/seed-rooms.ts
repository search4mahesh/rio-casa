import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ROOMS = [
  // ── Floor 1 — Deluxe Rooms ──────────────────────────────────
  {
    roomNumber: "101", name: "Deluxe Room", slug: "deluxe-room-101",
    roomType: "deluxe", floor: 1, maxGuests: 2, extraBed: true,
    pricePerNight: 4500, baseRate: 4500,
    amenities: ["AC", "WiFi", "TV", "Hot Water", "Room Service", "Extra Bed Available"],
    descriptionEn: "A well-appointed deluxe room designed for comfort and relaxation. Perfect for couples or solo travellers seeking a peaceful hill station escape.",
    descriptionHi: "आराम और विश्राम के लिए डिज़ाइन किया गया एक सुसज्जित डीलक्स कमरा। जोड़ों या एकल यात्रियों के लिए एकदम सही।",
    descriptionMr: "आराम आणि विश्रांतीसाठी डिझाइन केलेली एक सुसज्जित डिलक्स खोली. जोडप्यांसाठी किंवा एकट्या प्रवाशांसाठी उत्तम.",
  },
  {
    roomNumber: "102", name: "Deluxe Room", slug: "deluxe-room-102",
    roomType: "deluxe", floor: 1, maxGuests: 2, extraBed: true,
    pricePerNight: 4500, baseRate: 4500,
    amenities: ["AC", "WiFi", "TV", "Hot Water", "Room Service", "Extra Bed Available"],
    descriptionEn: "A well-appointed deluxe room designed for comfort and relaxation. Perfect for couples or solo travellers seeking a peaceful hill station escape.",
    descriptionHi: "आराम और विश्राम के लिए डिज़ाइन किया गया एक सुसज्जित डीलक्स कमरा। जोड़ों या एकल यात्रियों के लिए एकदम सही।",
    descriptionMr: "आराम आणि विश्रांतीसाठी डिझाइन केलेली एक सुसज्जित डिलक्स खोली. जोडप्यांसाठी किंवा एकट्या प्रवाशांसाठी उत्तम.",
  },
  {
    roomNumber: "103", name: "Deluxe Room", slug: "deluxe-room-103",
    roomType: "deluxe", floor: 1, maxGuests: 2, extraBed: true,
    pricePerNight: 4500, baseRate: 4500,
    amenities: ["AC", "WiFi", "TV", "Hot Water", "Room Service", "Extra Bed Available"],
    descriptionEn: "A well-appointed deluxe room designed for comfort and relaxation. Perfect for couples or solo travellers seeking a peaceful hill station escape.",
    descriptionHi: "आराम और विश्राम के लिए डिज़ाइन किया गया एक सुसज्जित डीलक्स कमरा। जोड़ों या एकल यात्रियों के लिए एकदम सही।",
    descriptionMr: "आराम आणि विश्रांतीसाठी डिझाइन केलेली एक सुसज्जित डिलक्स खोली. जोडप्यांसाठी किंवा एकट्या प्रवाशांसाठी उत्तम.",
  },
  {
    roomNumber: "104", name: "Deluxe Room", slug: "deluxe-room-104",
    roomType: "deluxe", floor: 1, maxGuests: 2, extraBed: true,
    pricePerNight: 4500, baseRate: 4500,
    amenities: ["AC", "WiFi", "TV", "Hot Water", "Room Service", "Extra Bed Available", "Forest View"],
    descriptionEn: "A deluxe room with a beautiful forest view. Wake up to birdsong and misty treetops — a serene start to your Mahabaleshwar morning.",
    descriptionHi: "सुंदर जंगल के दृश्य वाला एक डीलक्स कमरा। पक्षियों के गीत और धुंधले पेड़ों के साथ जागें — आपकी महाबलेश्वर सुबह की एक शांत शुरुआत।",
    descriptionMr: "सुंदर जंगलाचे दृश्य असलेली डिलक्स खोली. पक्ष्यांच्या गाण्याने आणि धुक्याने झाकलेल्या झाडांसह जागे व्हा.",
  },
  // ── Floor 1 — Family Room ────────────────────────────────────
  {
    roomNumber: "105", name: "Family Room", slug: "family-room-105",
    roomType: "family", floor: 1, maxGuests: 4, extraBed: true,
    pricePerNight: 7500, baseRate: 7500,
    amenities: ["AC", "WiFi", "TV", "Hot Water", "Room Service", "2 Double Beds", "Extra Bed Available", "Seating Area"],
    descriptionEn: "Our spacious family room fits the whole family comfortably with two double beds and a dedicated seating area. An ideal base for a Mahabaleshwar family holiday.",
    descriptionHi: "हमारा विशाल फैमिली रूम दो डबल बेड और एक समर्पित बैठक क्षेत्र के साथ पूरे परिवार को आराम से समायोजित करता है।",
    descriptionMr: "आमची प्रशस्त फॅमिली रूम दोन डबल बेड आणि एका समर्पित बसण्याच्या क्षेत्रासह संपूर्ण कुटुंबाला आरामात सामावून घेते.",
  },
  // ── Floor 2 — Premium Rooms (with bathtub) ───────────────────
  {
    roomNumber: "201", name: "Premium Room", slug: "premium-room-201",
    roomType: "premium", floor: 2, maxGuests: 2, extraBed: true,
    pricePerNight: 6500, baseRate: 6500,
    amenities: ["AC", "WiFi", "TV", "Hot Water", "Bathtub", "Room Service", "Extra Bed Available", "Premium Toiletries"],
    descriptionEn: "An elevated premium room featuring a luxurious soaking bathtub. Unwind after a day of exploring Mahabaleshwar with a long, relaxing bath.",
    descriptionHi: "एक शानदार सोकिंग बाथटब वाला प्रीमियम कमरा। महाबलेश्वर की सैर के बाद एक लंबे आरामदायक स्नान के साथ तनाव दूर करें।",
    descriptionMr: "विलासी सोकिंग बाथटब असलेली एक उन्नत प्रीमियम खोली. महाबळेश्वर एक्सप्लोर केल्यानंतर दीर्घ, आरामदायक आंघोळीने ताजेतवाने व्हा.",
  },
  // ── Floor 2 — Deluxe Rooms ───────────────────────────────────
  {
    roomNumber: "202", name: "Deluxe Room", slug: "deluxe-room-202",
    roomType: "deluxe", floor: 2, maxGuests: 2, extraBed: true,
    pricePerNight: 4500, baseRate: 4500,
    amenities: ["AC", "WiFi", "TV", "Hot Water", "Room Service", "Extra Bed Available"],
    descriptionEn: "A well-appointed deluxe room on the upper floor with an open, airy feel. Designed for comfort and relaxation.",
    descriptionHi: "ऊपरी मंजिल पर एक सुसज्जित डीलक्स कमरा, खुला और हवादार। आराम और विश्राम के लिए डिज़ाइन किया गया।",
    descriptionMr: "वरच्या मजल्यावर एक सुसज्जित डिलक्स खोली, मोकळी आणि हवेशीर. आराम आणि विश्रांतीसाठी डिझाइन केलेली.",
  },
  {
    roomNumber: "203", name: "Deluxe Room", slug: "deluxe-room-203",
    roomType: "deluxe", floor: 2, maxGuests: 2, extraBed: true,
    pricePerNight: 4500, baseRate: 4500,
    amenities: ["AC", "WiFi", "TV", "Hot Water", "Room Service", "Extra Bed Available"],
    descriptionEn: "A well-appointed deluxe room on the upper floor with an open, airy feel. Designed for comfort and relaxation.",
    descriptionHi: "ऊपरी मंजिल पर एक सुसज्जित डीलक्स कमरा, खुला और हवादार। आराम और विश्राम के लिए डिज़ाइन किया गया।",
    descriptionMr: "वरच्या मजल्यावर एक सुसज्जित डिलक्स खोली, मोकळी आणि हवेशीर. आराम आणि विश्रांतीसाठी डिझाइन केलेली.",
  },
  // ── Floor 2 — Premium Room (with bathtub) ────────────────────
  {
    roomNumber: "204", name: "Premium Room", slug: "premium-room-204",
    roomType: "premium", floor: 2, maxGuests: 2, extraBed: true,
    pricePerNight: 6500, baseRate: 6500,
    amenities: ["AC", "WiFi", "TV", "Hot Water", "Bathtub", "Room Service", "Extra Bed Available", "Premium Toiletries"],
    descriptionEn: "An elevated premium room featuring a luxurious soaking bathtub. Unwind after a day of exploring Mahabaleshwar with a long, relaxing bath.",
    descriptionHi: "एक शानदार सोकिंग बाथटब वाला प्रीमियम कमरा। महाबलेश्वर की सैर के बाद एक लंबे आरामदायक स्नान के साथ तनाव दूर करें।",
    descriptionMr: "विलासी सोकिंग बाथटब असलेली एक उन्नत प्रीमियम खोली. महाबळेश्वर एक्सप्लोर केल्यानंतर दीर्घ, आरामदायक आंघोळीने ताजेतवाने व्हा.",
  },
];

async function main() {
  console.log("🏨 Resetting rooms...\n");

  // Clear existing data in dependency order
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

  // Create rooms
  for (const r of ROOMS) {
    await prisma.room.create({
      data: {
        ...r,
        images: [],
        photos: [],
        status: "available",
        isActive: true,
      },
    });
  }
  console.log(`  ✓ ${ROOMS.length} rooms created\n`);

  console.log("Room summary:");
  console.log("  Floor 1 — 101, 102, 103, 104 : Deluxe Room       ₹4,500/night (2 pax + extra bed)");
  console.log("  Floor 1 — 105               : Family Room        ₹7,500/night (4 pax + extra bed)");
  console.log("  Floor 2 — 201, 204           : Premium Room       ₹6,500/night (2 pax + extra bed, bathtub)");
  console.log("  Floor 2 — 202, 203           : Deluxe Room        ₹4,500/night (2 pax + extra bed)");
  console.log("\n✅ Done! Run seed-demo.ts next to add guests and bookings.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
