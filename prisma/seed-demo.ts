import { makeScriptClient } from "./script-client";
// Rooms come from the canonical inventory so the demo seed can never
// reintroduce duplicate room numbers — defining a second list here is
// exactly what produced the extra 101 / 201 / 202.
import { ROOMS } from "./seed-rooms";

const prisma = makeScriptClient();

/**
 * Remove duplicate packages and testimonials left by earlier, non-idempotent
 * runs. Off by default — this deletes rows, and the seeds below no longer
 * create duplicates, so the only thing it fixes is history.
 *
 *   npx tsx prisma/seed-demo.ts --prune
 */
const PRUNE = process.argv.includes("--prune");

const GUESTS = [
  { firstName: "Rahul",  lastName: "Sharma",   phone: "9823456701", email: "rahul.sharma@gmail.com",  city: "Pune",       state: "Maharashtra" },
  { firstName: "Priya",  lastName: "Patel",    phone: "9812345678", email: "priya.patel@yahoo.com",   city: "Mumbai",     state: "Maharashtra" },
  { firstName: "Amit",   lastName: "Desai",    phone: "9876543210", email: "amit.desai@outlook.com",  city: "Nashik",     state: "Maharashtra" },
  { firstName: "Sunita", lastName: "Kulkarni", phone: "9765432109", email: "sunita.k@gmail.com",      city: "Kolhapur",   state: "Maharashtra" },
  { firstName: "Vikram", lastName: "Singh",    phone: "9654321098", email: "vikram.singh@gmail.com",  city: "Bangalore",  state: "Karnataka"   },
  { firstName: "Meena",  lastName: "Joshi",    phone: "9543210987", email: "meena.joshi@gmail.com",   city: "Nagpur",     state: "Maharashtra" },
  { firstName: "Arun",   lastName: "Nair",     phone: "9432109876", email: "arun.nair@gmail.com",     city: "Hyderabad",  state: "Telangana"   },
  { firstName: "Kavita", lastName: "Mehta",    phone: "9321098765", email: "kavita.mehta@hotmail.com",city: "Surat",      state: "Gujarat"     },
  { firstName: "Suresh", lastName: "Iyer",     phone: "9210987654", email: "suresh.iyer@gmail.com",   city: "Chennai",    state: "Tamil Nadu"  },
  { firstName: "Deepa",  lastName: "Patil",    phone: "9109876543", email: "deepa.patil@gmail.com",   city: "Aurangabad", state: "Maharashtra" },
];

/**
 * Report — and with `--prune`, remove — rows sharing a key, keeping the oldest
 * of each. Only reachable for the two tables this script used to duplicate.
 */
async function pruneDuplicates(model: "package" | "testimonial", keyField: "nameEn" | "guestName") {
  const rows: Array<Record<string, unknown>> =
    model === "package"
      ? await prisma.package.findMany({ orderBy: { createdAt: "asc" } })
      : await prisma.testimonial.findMany({ orderBy: { createdAt: "asc" } });

  const seen = new Set<string>();
  const extra: string[] = [];
  for (const r of rows) {
    const key = String(r[keyField]);
    if (seen.has(key)) extra.push(String(r.id));
    else seen.add(key);
  }
  if (extra.length === 0) return;

  if (!PRUNE) {
    console.log(
      `  ! ${extra.length} duplicate ${model}(s) from earlier runs — re-run with --prune to remove them`
    );
    return;
  }
  const { count } =
    model === "package"
      ? await prisma.package.deleteMany({ where: { id: { in: extra } } })
      : await prisma.testimonial.deleteMany({ where: { id: { in: extra } } });
  console.log(`  ✓ pruned ${count} duplicate ${model}(s)`);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function bookingNumber() {
  return "RC" + Date.now().toString().slice(-6) + randomInt(10, 99);
}

async function main() {
  console.log("🌱 Seeding demo data for Rio Casa...\n");

  // ── Rooms ──────────────────────────────────────────────────────
  console.log("Creating rooms...");
  const rooms = [];
  for (const r of ROOMS) {
    const room = await prisma.room.upsert({
      where: { slug: r.slug },
      update: {},
      create: {
        ...r,
        images: [],
        photos: [],
        status: "available",
        isActive: true,
      },
    });
    rooms.push(room);
  }
  console.log(`  ✓ ${rooms.length} rooms created`);

  // ── Guests ─────────────────────────────────────────────────────
  console.log("Creating guests...");
  const guests = [];
  for (const g of GUESTS) {
    const guest = await prisma.guest.upsert({
      where: { id: (await prisma.guest.findFirst({ where: { phone: g.phone } }))?.id ?? "new" },
      update: {},
      create: { ...g, country: "India", nationality: "Indian" },
    });
    guests.push(guest);
  }
  console.log(`  ✓ ${guests.length} guests created`);

  // ── Bookings ───────────────────────────────────────────────────
  // Room 0 = Forest View Room (max 2), Room 1 = Valley View Deluxe (max 2), Room 2 = Presidential Suite (max 4)
  // No overlapping bookings within the same room.
  console.log("Creating bookings...");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bookingScenarios = [
    // ── Room 0 (Forest View Room) ──────────────────────────────
    { guestIdx: 0, roomIdx: 0, checkInOffset: -2, nights: 3,  status: "checked_in",  paymentStatus: "paid",     source: "website",     adults: 2 },
    { guestIdx: 5, roomIdx: 0, checkInOffset:  1, nights: 1,  status: "confirmed",   paymentStatus: "pending",  source: "walkin",      adults: 1 },
    { guestIdx: 6, roomIdx: 0, checkInOffset:  4, nights: 2,  status: "confirmed",   paymentStatus: "paid",     source: "mmt",         adults: 2 },
    { guestIdx: 8, roomIdx: 0, checkInOffset:  7, nights: 2,  status: "confirmed",   paymentStatus: "paid",     source: "goibibo",     adults: 2 },
    { guestIdx: 2, roomIdx: 0, checkInOffset: -25, nights: 3, status: "checked_out", paymentStatus: "paid",     source: "booking_com", adults: 2 },
    { guestIdx: 0, roomIdx: 0, checkInOffset: -15, nights: 2, status: "checked_out", paymentStatus: "paid",     source: "phone",       adults: 2 },

    // ── Room 1 (Valley View Deluxe) ────────────────────────────
    { guestIdx: 1, roomIdx: 1, checkInOffset: -1, nights: 2,  status: "checked_in",  paymentStatus: "paid",     source: "booking_com", adults: 2 },
    { guestIdx: 3, roomIdx: 1, checkInOffset:  3, nights: 3,  status: "confirmed",   paymentStatus: "paid",     source: "website",     adults: 2 },
    { guestIdx: 7, roomIdx: 1, checkInOffset:  8, nights: 4,  status: "confirmed",   paymentStatus: "pending",  source: "website",     adults: 2 },
    { guestIdx: 9, roomIdx: 1, checkInOffset: -10, nights: 3, status: "checked_out", paymentStatus: "paid",     source: "website",     adults: 2 },
    { guestIdx: 6, roomIdx: 1, checkInOffset: -5, nights: 2,  status: "cancelled",   paymentStatus: "refunded", source: "website",     adults: 2 },

    // ── Room 2 (Presidential Suite) ────────────────────────────
    { guestIdx: 4, roomIdx: 2, checkInOffset: -3, nights: 5,  status: "checked_in",  paymentStatus: "paid",     source: "phone",       adults: 4, children: 1 },
    { guestIdx: 2, roomIdx: 2, checkInOffset:  3, nights: 3,  status: "confirmed",   paymentStatus: "paid",     source: "website",     adults: 2 },
    { guestIdx: 7, roomIdx: 2, checkInOffset: -8, nights: 1,  status: "no_show",     paymentStatus: "pending",  source: "phone",       adults: 1 },
    { guestIdx: 3, roomIdx: 2, checkInOffset: -30, nights: 2, status: "checked_out", paymentStatus: "paid",     source: "website",     adults: 2 },
    { guestIdx: 1, roomIdx: 2, checkInOffset: -20, nights: 1, status: "checked_out", paymentStatus: "cash",     source: "walkin",      adults: 1 },
  ];

  const createdBookings = [];
  for (const s of bookingScenarios) {
    const room = rooms[s.roomIdx];
    const guest = guests[s.guestIdx];
    const checkIn = addDays(today, s.checkInOffset);
    const checkOut = addDays(checkIn, s.nights);
    const total = room.pricePerNight * s.nights;

    const booking = await prisma.booking.create({
      data: {
        bookingNumber: bookingNumber(),
        guestId: guest.id,
        guestName: `${guest.firstName} ${guest.lastName}`,
        guestEmail: guest.email ?? "",
        guestPhone: guest.phone,
        roomId: room.id,
        checkIn,
        checkOut,
        nights: s.nights,
        adults: s.adults,
        children: (s as { children?: number }).children ?? 0,
        totalAmount: total,
        status: s.status,
        paymentStatus: s.paymentStatus,
        source: s.source,
        razorpayOrderId: s.paymentStatus === "paid" ? `order_demo${randomInt(100000, 999999)}` : null,
        razorpayPaymentId: s.paymentStatus === "paid" ? `pay_demo${randomInt(100000, 999999)}` : null,
        actualCheckin: s.status === "checked_in" || s.status === "checked_out" ? checkIn : null,
        actualCheckout: s.status === "checked_out" ? checkOut : null,
        cancelledAt: s.status === "cancelled" ? addDays(checkIn, -2) : null,
      },
    });
    createdBookings.push(booking);
  }
  console.log(`  ✓ ${createdBookings.length} bookings created`);

  // ── Room Status (front desk board) ─────────────────────────────
  console.log("Setting room statuses...");
  const roomStatusMap: Record<number, { occupancy: string; housekeeping: string }> = {
    0: { occupancy: "occupied",    housekeeping: "dirty"    },
    1: { occupancy: "occupied",    housekeeping: "clean"    },
    2: { occupancy: "occupied",    housekeeping: "dirty"    },
  };

  for (let i = 0; i < rooms.length; i++) {
    const cfg = roomStatusMap[i];
    const checkedInBooking = createdBookings.find(
      (b) => b.roomId === rooms[i].id && b.status === "checked_in"
    );
    const checkedInGuest = checkedInBooking
      ? guests.find((g) => g.id === checkedInBooking.guestId)
      : null;

    await prisma.roomStatus.upsert({
      where: { roomId: rooms[i].id },
      update: {
        occupancy: cfg.occupancy,
        housekeeping: cfg.housekeeping,
        currentBookingId: checkedInBooking?.id ?? null,
        currentGuestId: checkedInGuest?.id ?? null,
      },
      create: {
        roomId: rooms[i].id,
        occupancy: cfg.occupancy,
        housekeeping: cfg.housekeeping,
        currentBookingId: checkedInBooking?.id ?? null,
        currentGuestId: checkedInGuest?.id ?? null,
        lastCleanedAt: new Date(),
      },
    });
  }
  console.log(`  ✓ Room statuses set`);

  // ── Housekeeping tasks ─────────────────────────────────────────
  console.log("Creating housekeeping tasks...");
  const hkTasks = [
    { roomIdx: 0, taskType: "cleaning",    status: "pending",     assignedTo: "Ramu",   notes: "Guest checked out — deep clean required" },
    { roomIdx: 2, taskType: "cleaning",    status: "in_progress", assignedTo: "Sunita", notes: "Guest still in — light tidy only" },
    { roomIdx: 1, taskType: "inspection",  status: "pending",     assignedTo: "Ramesh", notes: "Pre-arrival inspection before 2pm check-in" },
    { roomIdx: 0, taskType: "turndown",    status: "pending",     assignedTo: "Priya",  notes: "Evening turndown service at 7pm" },
    { roomIdx: 1, taskType: "laundry",     status: "completed",   assignedTo: "Sunita", notes: "Extra pillows requested" },
    { roomIdx: 2, taskType: "maintenance", status: "pending",     assignedTo: null,     notes: "AC remote not working — needs replacement", maintenanceFlag: true },
    { roomIdx: 0, taskType: "inspection",  status: "pending",     assignedTo: "Ramesh", notes: "VIP arrival tomorrow — verify all amenities" },
  ];

  for (const t of hkTasks) {
    await prisma.housekeepingLog.create({
      data: {
        roomId: rooms[t.roomIdx].id,
        taskType: t.taskType,
        status: t.status,
        assignedTo: t.assignedTo ?? undefined,
        notes: t.notes,
        maintenanceFlag: (t as { maintenanceFlag?: boolean }).maintenanceFlag ?? false,
        startedAt: t.status === "in_progress" ? new Date() : undefined,
        completedAt: t.status === "completed" ? new Date() : undefined,
      },
    });
  }
  console.log(`  ✓ ${hkTasks.length} housekeeping tasks created`);

  // ── Update guest stats ─────────────────────────────────────────
  console.log("Updating guest stay counts...");
  for (const guest of guests) {
    const guestBookings = createdBookings.filter(
      (b) => b.guestId === guest.id && ["checked_in", "checked_out"].includes(b.status)
    );
    const totalRevenue = guestBookings.reduce((sum, b) => sum + b.totalAmount, 0);
    await prisma.guest.update({
      where: { id: guest.id },
      data: { totalStays: guestBookings.length, totalRevenue },
    });
  }
  console.log(`  ✓ Guest stats updated`);

  // ── Packages ───────────────────────────────────────────────────
  console.log("Creating packages...");
  const packages = [
    {
      nameEn: "Romantic Getaway", nameHi: "रोमांटिक गेटवे", nameMr: "रोमँटिक गेटवे",
      descEn: "Perfect for couples — includes candlelight dinner, spa for two, and valley view room for 2 nights.",
      descHi: "जोड़ों के लिए परफेक्ट — कैंडललाइट डिनर, दो के लिए स्पा और 2 रातों के लिए घाटी दृश्य कमरा।",
      descMr: "जोडप्यांसाठी परफेक्ट — कँडललाइट डिनर, दोघांसाठी स्पा आणि 2 रात्री व्हॅली व्ह्यू रूम।",
      price: 14999,
      inclusions: ["2 Nights Stay", "Candlelight Dinner", "Spa for Two", "Breakfast", "Late Checkout"],
      imageUrl: "/images/packages/romantic.jpg",
      isActive: true,
    },
    {
      nameEn: "Family Fun Pack", nameHi: "फैमिली फन पैक", nameMr: "फॅमिली फन पॅक",
      descEn: "3-night stay for the whole family with kids activities, bonfire, and nature walks.",
      descHi: "पूरे परिवार के लिए 3 रात, बच्चों की गतिविधियां, बोनफायर और नेचर वॉक।",
      descMr: "संपूर्ण कुटुंबासाठी 3 रात, मुलांचे उपक्रम, बोनफायर आणि निसर्ग सहल।",
      price: 22999,
      inclusions: ["3 Nights Stay", "All Meals", "Kids Activity Kit", "Bonfire Night", "Nature Walk Guide", "Free Extra Bed"],
      imageUrl: "/images/packages/family.jpg",
      isActive: true,
    },
    {
      nameEn: "Monsoon Magic", nameHi: "मानसून मैजिक", nameMr: "मान्सून मॅजिक",
      descEn: "Special monsoon package — 2 nights with waterfall trek, hot soup evenings, and rain dance.",
      descHi: "विशेष मानसून पैकेज — झरना ट्रेक, गर्म सूप शाम और रेन डांस के साथ 2 रातें।",
      descMr: "विशेष मान्सून पॅकेज — धबधबा ट्रेक, गरम सूप संध्याकाळ आणि रेन डान्ससह 2 रात्री।",
      price: 9999,
      inclusions: ["2 Nights Stay", "Waterfall Trek", "Hot Soup Evenings", "Rain Dance", "Breakfast"],
      imageUrl: "/images/packages/monsoon.jpg",
      isActive: true,
    },
  ];

  // Keyed on `nameEn` rather than blind-created. This used to be
  // `create(...).catch(() => {})`, apparently meant to make re-runs safe — but
  // there is no unique constraint on `nameEn`, so the insert *succeeded* and
  // duplicated, and the `catch` only hid genuine errors. Four runs left the
  // database holding four copies of every package (B-54). `upsert` is not
  // available without that constraint, and a unique index cannot be added
  // while the duplicates exist, so this matches by name explicitly.
  let pkgCreated = 0, pkgUpdated = 0;
  for (const p of packages) {
    const existing = await prisma.package.findFirst({ where: { nameEn: p.nameEn } });
    if (existing) {
      await prisma.package.update({ where: { id: existing.id }, data: p });
      pkgUpdated++;
    } else {
      await prisma.package.create({ data: p });
      pkgCreated++;
    }
  }
  console.log(`  ✓ packages: ${pkgCreated} created, ${pkgUpdated} updated`);
  await pruneDuplicates("package", "nameEn");

  // ── Testimonials ───────────────────────────────────────────────
  console.log("Creating testimonials...");
  const testimonials = [
    { guestName: "Rahul & Priya S.", location: "Pune",      rating: 5, review: "Absolutely magical stay! The forest view room was breathtaking. Woke up to birds chirping and mist in the valley. Staff was incredibly attentive. Will definitely come back!", isApproved: true },
    { guestName: "Amit D.",          location: "Mumbai",    rating: 5, review: "The presidential suite was worth every rupee. The 270° view of the valley is something you have to see to believe. Perfect for our anniversary.", isApproved: true },
    { guestName: "Kavita Mehta",     location: "Surat",     rating: 4, review: "Great property with excellent food. The valley view deluxe room was stunning — we spent our evenings on the balcony watching the sunset. Minor issue with hot water but staff resolved it quickly.", isApproved: true },
    { guestName: "Suresh & Family",  location: "Chennai",   rating: 5, review: "Brought the whole family for the weekend. Kids loved the space and the bonfire. The nature walk was a highlight. Highly recommend for families!", isApproved: true },
    { guestName: "Meena J.",         location: "Nagpur",    rating: 5, review: "Rio Casa sets the standard for hospitality in Mahabaleshwar. The food was exceptional — especially the local Maharashtrian thali. Clean rooms, stunning views.", isApproved: true },
    { guestName: "Vikram Singh",     location: "Bangalore", rating: 4, review: "Lovely property. Waking up to the forest view every morning was something special. Would have given 5 stars but the WiFi was patchy. Everything else was perfect.", isApproved: true },
  ];

  // Same reasoning as packages above — matched by guest name so a re-run
  // refreshes rather than multiplies (B-54).
  let tstCreated = 0, tstUpdated = 0;
  for (const t of testimonials) {
    const existing = await prisma.testimonial.findFirst({ where: { guestName: t.guestName } });
    if (existing) {
      await prisma.testimonial.update({ where: { id: existing.id }, data: t });
      tstUpdated++;
    } else {
      await prisma.testimonial.create({
        data: { ...t, stayDate: addDays(today, -randomInt(10, 60)) },
      });
      tstCreated++;
    }
  }
  console.log(`  ✓ testimonials: ${tstCreated} created, ${tstUpdated} updated`);
  await pruneDuplicates("testimonial", "guestName");

  // ── Expenses ───────────────────────────────────────────────────
  console.log("Creating expenses...");
  const expenseEntries = [
    // Staff
    { daysAgo: 1,  category: "staff",        description: "Housekeeping staff wages",    amount: 18000, paymentMethod: "bank",   vendor: "Payroll",          recordedBy: "Manager" },
    { daysAgo: 1,  category: "staff",        description: "Front desk staff wages",      amount: 12000, paymentMethod: "bank",   vendor: "Payroll",          recordedBy: "Manager" },
    // Utilities
    { daysAgo: 3,  category: "utilities",    description: "Electricity bill",            amount:  8500, paymentMethod: "bank",   vendor: "MSEDCL",           recordedBy: "Manager" },
    { daysAgo: 3,  category: "utilities",    description: "Water charges",               amount:  1200, paymentMethod: "cash",   vendor: "Municipality",     recordedBy: "Manager" },
    { daysAgo: 5,  category: "utilities",    description: "LPG cylinders x4",           amount:  3600, paymentMethod: "cash",   vendor: "HP Gas",           recordedBy: "Ramu"    },
    // Food & Beverage
    { daysAgo: 2,  category: "food",         description: "Vegetables & groceries",      amount:  4200, paymentMethod: "cash",   vendor: "Local Market",     recordedBy: "Chef"    },
    { daysAgo: 2,  category: "food",         description: "Dairy products",              amount:  1800, paymentMethod: "cash",   vendor: "Amul Distributor", recordedBy: "Chef"    },
    { daysAgo: 6,  category: "food",         description: "Beverages & soft drinks",     amount:  2500, paymentMethod: "upi",    vendor: "Coca-Cola Dist.",  recordedBy: "Chef"    },
    // Housekeeping
    { daysAgo: 4,  category: "housekeeping", description: "Cleaning supplies",           amount:  2200, paymentMethod: "cash",   vendor: "Cleaning Store",   recordedBy: "Sunita"  },
    { daysAgo: 7,  category: "housekeeping", description: "Laundry service",             amount:  3500, paymentMethod: "upi",    vendor: "Quick Laundry",    recordedBy: "Sunita"  },
    { daysAgo: 8,  category: "housekeeping", description: "Guest toiletries restock",    amount:  1600, paymentMethod: "cash",   vendor: "Wholesale Mart",   recordedBy: "Sunita"  },
    // Maintenance
    { daysAgo: 5,  category: "maintenance",  description: "AC servicing — 3 units",     amount:  4500, paymentMethod: "cash",   vendor: "Cool Care AC",     recordedBy: "Manager" },
    { daysAgo: 9,  category: "maintenance",  description: "Plumbing repairs",            amount:  1800, paymentMethod: "cash",   vendor: "Ramesh Plumber",   recordedBy: "Manager" },
    { daysAgo: 12, category: "maintenance",  description: "Electrical wiring fix",       amount:  2400, paymentMethod: "cash",   vendor: "Shinde Electricals",recordedBy: "Manager"},
    // Marketing
    { daysAgo: 10, category: "marketing",    description: "Google Ads — June campaign",  amount:  5000, paymentMethod: "bank",   vendor: "Google",           recordedBy: "Manager" },
    { daysAgo: 15, category: "marketing",    description: "Instagram content shoot",     amount:  3000, paymentMethod: "upi",    vendor: "Clicks Studio",    recordedBy: "Manager" },
    // Other
    { daysAgo: 6,  category: "other",        description: "Office stationery",           amount:   450, paymentMethod: "cash",   vendor: "Local Shop",       recordedBy: "Priya"   },
    { daysAgo: 11, category: "other",        description: "Internet & cable bill",       amount:  1500, paymentMethod: "bank",   vendor: "JioFiber",         recordedBy: "Manager" },
  ];

  for (const e of expenseEntries) {
    await prisma.expense.create({
      data: {
        date: addDays(today, -e.daysAgo),
        category: e.category,
        description: e.description,
        amount: e.amount,
        paymentMethod: e.paymentMethod,
        vendor: e.vendor,
        recordedBy: e.recordedBy,
      },
    });
  }
  console.log(`  ✓ ${expenseEntries.length} expenses created`);

  // ── Summary ────────────────────────────────────────────────────
  console.log("\n✅ Demo data seeded successfully!\n");
  console.log("  Rooms:         ", rooms.length);
  console.log("  Guests:        ", guests.length);
  console.log("  Bookings:      ", createdBookings.length);
  console.log("  HK Tasks:      ", hkTasks.length);
  console.log("  Expenses:      ", expenseEntries.length);
  console.log("  Packages:      ", packages.length);
  console.log("  Testimonials:  ", testimonials.length);
  console.log("\n  Dashboard → http://localhost:3000/admin/dashboard");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
