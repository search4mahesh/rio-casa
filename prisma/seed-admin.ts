import { makeScriptClient } from "./script-client";
import bcrypt from "bcryptjs";

const prisma = makeScriptClient();

const ACCOUNTS = [
  {
    name: "Admin",
    email: "admin@riocasa.in",
    role: "owner",
    password: "admin123",
    permissions: ["all"],
  },
  {
    name: "Priya Sharma",
    email: "manager@riocasa.in",
    role: "manager",
    password: "manager123",
    permissions: [],
  },
  {
    name: "Ravi Kulkarni",
    email: "frontdesk@riocasa.in",
    role: "frontdesk",
    password: "frontdesk123",
    permissions: [],
  },
  {
    name: "Sunita Patil",
    email: "housekeeping@riocasa.in",
    role: "housekeeping",
    password: "hk123",
    permissions: [],
  },
] as const;

async function main() {
  for (const account of ACCOUNTS) {
    const hash = await bcrypt.hash(account.password, 12);
    const s = await prisma.staff.upsert({
      where: { email: account.email },
      update: {},
      create: {
        name: account.name,
        email: account.email,
        role: account.role,
        passwordHash: hash,
        permissions: [...account.permissions],
        isActive: true,
      },
    });
    console.log(`✅  ${s.role.padEnd(12)} ${s.email}  (pw: ${account.password})`);
  }
  console.log("\n⚠️  Change passwords after first login!\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
