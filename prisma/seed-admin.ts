import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = "admin123"; // Change this after first login!
  const hash = await bcrypt.hash(password, 12);

  const staff = await prisma.staff.upsert({
    where: { email: "admin@riocasa.in" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@riocasa.in",
      role: "owner",
      passwordHash: hash,
      permissions: ["all"],
      isActive: true,
    },
  });

  console.log(`\n✅ Admin user ready:`);
  console.log(`   Email:    admin@riocasa.in`);
  console.log(`   Password: ${password}`);
  console.log(`   Role:     owner`);
  console.log(`   ID:       ${staff.id}`);
  console.log(`\n⚠️  Change the password after first login!\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
