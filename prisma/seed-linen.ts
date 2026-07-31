import { PrismaClient } from "@prisma/client";

// ─────────────────────────────────────────────────────────────
// The linen catalogue — the item types that go to the laundryman.
//
// Rates are per piece and are only defaults: each batch snapshots
// the rate at dispatch, so changing one here never rewrites what a
// past batch cost.
//
//   npx tsx prisma/seed-linen.ts
//
// Idempotent — upserts by name, so re-running adds new item types
// without resetting rates you have edited in the admin panel.
// ─────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

const LINEN = [
  // ── Towels ───────────────────────────────────────────────────
  { name: "Bath Towel", category: "towel", ratePerPiece: 15, sortOrder: 10 },
  { name: "Hand Towel", category: "towel", ratePerPiece: 8, sortOrder: 20 },
  { name: "Face Towel", category: "towel", ratePerPiece: 6, sortOrder: 30 },
  { name: "Bath Mat", category: "towel", ratePerPiece: 12, sortOrder: 40 },
  // ── Bedding ──────────────────────────────────────────────────
  { name: "Bedsheet (Double)", category: "bedding", ratePerPiece: 25, sortOrder: 50 },
  { name: "Bedsheet (Single)", category: "bedding", ratePerPiece: 18, sortOrder: 60 },
  { name: "Duvet Cover", category: "bedding", ratePerPiece: 35, sortOrder: 70 },
  { name: "Duvet / Blanket", category: "bedding", ratePerPiece: 60, sortOrder: 80 },
  { name: "Pillow Cover", category: "bedding", ratePerPiece: 6, sortOrder: 90 },
  { name: "Mattress Protector", category: "bedding", ratePerPiece: 30, sortOrder: 100 },
  // ── Other ────────────────────────────────────────────────────
  { name: "Curtain", category: "other", ratePerPiece: 50, sortOrder: 110 },
  { name: "Table Napkin", category: "other", ratePerPiece: 5, sortOrder: 120 },
  { name: "Table Cloth", category: "other", ratePerPiece: 20, sortOrder: 130 },
];

async function main() {
  console.log("🧺 Seeding linen catalogue...\n");

  let created = 0;
  let existing = 0;

  for (const item of LINEN) {
    const before = await prisma.linenItem.findUnique({ where: { name: item.name } });
    await prisma.linenItem.upsert({
      where: { name: item.name },
      // Keep rates the owner may have edited; only refresh grouping/order.
      update: { category: item.category, sortOrder: item.sortOrder },
      create: item,
    });
    if (before) existing += 1;
    else created += 1;
  }

  console.log(`  ✓ ${created} new item(s), ${existing} already present\n`);

  const all = await prisma.linenItem.findMany({ orderBy: { sortOrder: "asc" } });
  let category = "";
  for (const i of all) {
    if (i.category !== category) {
      category = i.category;
      console.log(`  ${category.toUpperCase()}`);
    }
    console.log(`    ${i.name.padEnd(22)} ₹${Number(i.ratePerPiece).toFixed(2)}/pc`);
  }
}

main()
  .catch((e) => { console.error("FAILED:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
