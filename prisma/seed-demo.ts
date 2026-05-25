import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ROOMS = [
  {
    name: "Forest View Room",
    slug: "forest-view-room",
    roomNumber: "101",
    roomType: "standard",
    floor: 1,
    maxGuests: 2,
    pricePerNight: 4500,
    baseRate: 4500,
    descriptionEn: "A cozy room with a stunning view of the Mahabaleshwar forest canopy.",
    descriptionHi: "महाबलेश्वर के जंगल के मनोरम दृश्य वाला आरामदायक कमरा।",
    descriptionMr: "महाबळेश्वरच्या जंगलाचे सुंदर दृश्य असलेली आरामदायक खोली।",
    amenities: ["AC", "WiFi", "TV", "Hot Water", "Forest View", "Room Service"],
    images: ["/images/rooms/forest-view-1.jpg"],
  },
  {
    name: "Garden Suite",
    slug: "garden-suite",
    roomNumber: "102",
    roomType: "suite",
    floor: 1,
    maxGuests: 3,
    pricePerNight: 6500,
    baseRate: 6500,
    descriptionEn: "Spacious suite with a private garden patio and mountain views.",
    descriptionHi: "निजी बगीचे की छत और पहाड़ी दृश्य के साथ विशाल सुइट।",
    descriptionMr: "खाजगी बागेचे आणि डोंगराचे दृश्य असलेला प्रशस्त सुइट।",
    amenities: ["AC", "WiFi", "TV", "Hot Water", "Garden Patio", "Bathtub", "Mini Bar"],
    images: ["/images/rooms/garden-suite-1.jpg"],
  },
  {
    name: "Valley View Deluxe",
    slug: "valley-view-deluxe",
    roomNumber: "201",
    roomType: "deluxe",
    floor: 2,
    maxGuests: 2,
    pricePerNight: 5500,
    baseRate: 5500,
    descriptionEn: "Deluxe room with panoramic valley views and premium furnishings.",
    descriptionHi: "प्रीमियम साज-सज्जा और घाटी के मनोरम दृश्य वाला डीलक्स कमरा।",
    descriptionMr: "प्रीमियम सुविधा आणि दरीचे विहंगम दृश्य असलेली डिलक्स खोली।",
    amenities: ["AC", "WiFi", "TV", "Hot Water", "Valley View", "Balcony", "Tea/Coffee Maker"],
    images: ["/images/rooms/valley-view-1.jpg"],
  },
  {
    name: "Presidential Suite",
    slug: "presidential-suite",
    roomNumber: "202",
    roomType: "presidential",
    floor: 2,
    maxGuests: 4,
    pricePerNight: 12000,
    baseRate: 12000,
    descriptionEn: "Our most luxurious suite with a living room, kitchenette and 270° views.",
    descriptionHi: "लिविंग रूम, किचनेट और 270° दृश्य के साथ हमारा सबसे शानदार सुइट।",
    descriptionMr: "लिव्हिंग रूम, किचनेट आणि 270° दृश्य असलेला आमचा सर्वात विलासी सुइट।",
    amenities: ["AC", "WiFi", "Smart TV", "Hot Water", "360° View", "Living Room", "Jacuzzi", "Butler Service", "Mini Bar"],
    images: ["/images/rooms/presidential-1.jpg"],
  },
  {
    name: "Hillside Cottage",
    slug: "hillside-cottage",
    roomNumber: "C1",
    roomType: "cottage",
    floor: 0,
    maxGuests: 4,
    pricePerNight: 8500,
    baseRate: 8500,
    descriptionEn: "A standalone cottage nestled on the hillside, perfect for families.",
    descriptionHi: "पहाड़ी पर बसा एक अलग कॉटेज, परिवारों के लिए आदर्श।",
    descriptionMr: "डोंगराच्या उतारावर वसलेले एक स्वतंत्र कॉटेज, कुटुंबांसाठी उत्तम।",
    amenities: ["AC", "WiFi", "TV", "Hot Water", "Private Garden", "Fireplace", "Kitchen", "BBQ Grill"],
    images: ["/images/rooms/cottage-1.jpg"],
  },
  {
    name: "Treetop Room",
    slug: "treetop-room",
    roomNumber: "301",
    roomType: "standard",
    floor: 3,
    maxGuests: 2,
    pricePerNight: 4000,
    baseRate: 4000,
    descriptionEn: "Elevated room surrounded by tree canopy with bird watching opportunities.",
    descriptionHi: "पेड़ों की छतरी से घिरा ऊंचा कमरा, पक्षी दर्शन के लिए उत्तम।",
    descriptionMr: "झाडांच्या छताने वेढलेली उंच खोली, पक्षी निरीक्षणासाठी उत्तम।",
    amenities: ["WiFi", "TV", "Hot Water", "Tree View", "Hammock", "Room Service"],
    images: ["/images/rooms/treetop-1.jpg"],
  },
];

const GUESTS = [
  { firstName: "Rahul", lastName: "Sharma", phone: "9823456701", email: "rahul.sharma@gmail.com", city: "Pune", state: "Maharashtra" },
  { firstName: "Priya", lastName: "Patel", phone: "9812345678", email: "priya.patel@yahoo.com", city: "Mumbai", state: "Maharashtra" },
  { firstName: "Amit", lastName: "Desai", phone: "9876543210", email: "amit.desai@outlook.com", city: "Nashik", state: "Maharashtra" },
  { firstName: "Sunita", lastName: "Kulkarni", phone: "9765432109", email: "sunita.k@gmail.com", city: "Kolhapur", state: "Maharashtra" },
  { firstName: "Vikram", lastName: "Singh", phone: "9654321098", email: "vikram.singh@gmail.com", city: "Bangalore", state: "Karnataka" },
  { firstName: "Meena", lastName: "Joshi", phone: "9543210987", email: "meena.joshi@gmail.com", city: "Nagpur", state: "Maharashtra" },
  { firstName: "Arun", lastName: "Nair", phone: "9432109876", email: "arun.nair@gmail.com", city: "Hyderabad", state: "Telangana" },
  { firstName: "Kavita", lastName: "Mehta", phone: "9321098765", email: "kavita.mehta@hotmail.com", city: "Surat", state: "Gujarat" },
  { firstName: "Suresh", lastName: "Iyer", phone: "9210987654", email: "suresh.iyer@gmail.com", city: "Chennai", state: "Tamil Nadu" },
  { firstName: "Deepa", lastName: "Patil", phone: "9109876543", email: "deepa.patil@gmail.com", city: "Aurangabad", state: "Maharashtra" },
];

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
        baseRate: r.baseRate,
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
  console.log("Creating bookings...");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bookingScenarios = [
    // Currently checked in
    { guestIdx: 0, roomIdx: 0, checkInOffset: -2, nights: 3, status: "checked_in", paymentStatus: "paid", source: "website", adults: 2 },
    { guestIdx: 1, roomIdx: 2, checkInOffset: -1, nights: 2, status: "checked_in", paymentStatus: "paid", source: "booking_com", adults: 2 },
    { guestIdx: 4, roomIdx: 4, checkInOffset: -3, nights: 5, status: "checked_in", paymentStatus: "paid", source: "phone", adults: 4, children: 1 },

    // Today's arrivals
    { guestIdx: 2, roomIdx: 1, checkInOffset: 0, nights: 2, status: "confirmed", paymentStatus: "paid", source: "website", adults: 2 },
    { guestIdx: 5, roomIdx: 5, checkInOffset: 0, nights: 1, status: "confirmed", paymentStatus: "pending", source: "walkin", adults: 1 },

    // Upcoming
    { guestIdx: 3, roomIdx: 3, checkInOffset: 1, nights: 3, status: "confirmed", paymentStatus: "paid", source: "website", adults: 2 },
    { guestIdx: 6, roomIdx: 0, checkInOffset: 2, nights: 2, status: "confirmed", paymentStatus: "paid", source: "mmt", adults: 2 },
    { guestIdx: 7, roomIdx: 2, checkInOffset: 3, nights: 4, status: "confirmed", paymentStatus: "pending", source: "website", adults: 3 },
    { guestIdx: 8, roomIdx: 1, checkInOffset: 5, nights: 2, status: "confirmed", paymentStatus: "paid", source: "goibibo", adults: 2 },

    // Past checkouts
    { guestIdx: 9, roomIdx: 4, checkInOffset: -10, nights: 3, status: "checked_out", paymentStatus: "paid", source: "website", adults: 4 },
    { guestIdx: 0, roomIdx: 3, checkInOffset: -15, nights: 2, status: "checked_out", paymentStatus: "paid", source: "phone", adults: 2 },
    { guestIdx: 1, roomIdx: 5, checkInOffset: -20, nights: 1, status: "checked_out", paymentStatus: "cash", source: "walkin", adults: 1 },
    { guestIdx: 2, roomIdx: 0, checkInOffset: -25, nights: 3, status: "checked_out", paymentStatus: "paid", source: "booking_com", adults: 2 },
    { guestIdx: 3, roomIdx: 2, checkInOffset: -30, nights: 2, status: "checked_out", paymentStatus: "paid", source: "website", adults: 2 },

    // Cancelled / no-show
    { guestIdx: 6, roomIdx: 1, checkInOffset: -5, nights: 2, status: "cancelled", paymentStatus: "refunded", source: "website", adults: 2 },
    { guestIdx: 7, roomIdx: 3, checkInOffset: -8, nights: 1, status: "no_show", paymentStatus: "pending", source: "phone", adults: 1 },
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
    0: { occupancy: "occupied",     housekeeping: "dirty" },
    1: { occupancy: "due_checkin",  housekeeping: "clean" },
    2: { occupancy: "occupied",     housekeeping: "clean" },
    3: { occupancy: "due_checkin",  housekeeping: "inspected" },
    4: { occupancy: "occupied",     housekeeping: "dirty" },
    5: { occupancy: "due_checkin",  housekeeping: "clean" },
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
    { roomIdx: 4, taskType: "cleaning",    status: "in_progress", assignedTo: "Sunita", notes: "Guest still in — light tidy only" },
    { roomIdx: 1, taskType: "inspection",  status: "pending",     assignedTo: "Ramesh", notes: "Pre-arrival inspection before 2pm check-in" },
    { roomIdx: 3, taskType: "inspection",  status: "pending",     assignedTo: "Ramesh", notes: "VIP arrival tomorrow — verify all amenities" },
    { roomIdx: 2, taskType: "turndown",    status: "pending",     assignedTo: "Priya",  notes: "Evening turndown service at 7pm" },
    { roomIdx: 5, taskType: "laundry",     status: "completed",   assignedTo: "Sunita", notes: "Extra pillows requested" },
    { roomIdx: 0, taskType: "maintenance", status: "pending",     assignedTo: null,     notes: "AC remote not working — needs replacement", maintenanceFlag: true },
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
      descEn: "3-night cottage stay for the whole family with kids activities, bonfire, and nature walks.",
      descHi: "पूरे परिवार के लिए 3 रात कॉटेज, बच्चों की गतिविधियां, बोनफायर और नेचर वॉक।",
      descMr: "संपूर्ण कुटुंबासाठी 3 रात कॉटेज, मुलांचे उपक्रम, बोनफायर आणि निसर्ग सहल।",
      price: 22999,
      inclusions: ["3 Nights Cottage", "All Meals", "Kids Activity Kit", "Bonfire Night", "Nature Walk Guide", "Free Extra Bed"],
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

  for (const p of packages) {
    await prisma.package.create({ data: p }).catch(() => {});
  }
  console.log(`  ✓ ${packages.length} packages created`);

  // ── Testimonials ───────────────────────────────────────────────
  console.log("Creating testimonials...");
  const testimonials = [
    { guestName: "Rahul & Priya S.", location: "Pune", rating: 5, review: "Absolutely magical stay! The forest view room was breathtaking. Woke up to birds chirping and mist in the valley. Staff was incredibly attentive. Will definitely come back!", isApproved: true },
    { guestName: "Amit D.", location: "Mumbai", rating: 5, review: "The presidential suite was worth every rupee. The 270° view of the valley is something you have to see to believe. Perfect for our anniversary.", isApproved: true },
    { guestName: "Kavita Mehta", location: "Surat", rating: 4, review: "Great property with excellent food. The garden suite had a beautiful patio where we spent our evenings. Minor issue with hot water but staff resolved it quickly.", isApproved: true },
    { guestName: "Suresh & Family", location: "Chennai", rating: 5, review: "Brought the whole family for the weekend. Kids loved the cottage and the bonfire. The nature walk was a highlight. Highly recommend for families!", isApproved: true },
    { guestName: "Meena J.", location: "Nagpur", rating: 5, review: "Rio Casa sets the standard for hospitality in Mahabaleshwar. The food was exceptional — especially the local Maharashtrian thali. Clean rooms, stunning views.", isApproved: true },
    { guestName: "Vikram Singh", location: "Bangalore", rating: 4, review: "Lovely property. The treetop room felt like sleeping in a treehouse. Would have given 5 stars but the WiFi was patchy. Everything else was perfect.", isApproved: true },
  ];

  for (const t of testimonials) {
    await prisma.testimonial.create({ data: { ...t, stayDate: addDays(today, -randomInt(10, 60)) } });
  }
  console.log(`  ✓ ${testimonials.length} testimonials created`);

  // ── Summary ────────────────────────────────────────────────────
  console.log("\n✅ Demo data seeded successfully!\n");
  console.log("  Rooms:         ", rooms.length);
  console.log("  Guests:        ", guests.length);
  console.log("  Bookings:      ", createdBookings.length);
  console.log("  HK Tasks:      ", hkTasks.length);
  console.log("  Packages:      ", packages.length);
  console.log("  Testimonials:  ", testimonials.length);
  console.log("\n  Dashboard → http://localhost:3000/admin/dashboard");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
