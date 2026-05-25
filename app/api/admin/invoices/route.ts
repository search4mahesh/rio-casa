import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search");
  const status = searchParams.get("status");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const pageSize = 25;

  const where: Record<string, unknown> = {};
  if (status && status !== "all") where.status = status;
  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: "insensitive" } },
      { guestName: { contains: search, mode: "insensitive" } },
    ];
  }

  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      include: {
        booking: { select: { bookingNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({ success: true, invoices, total, page, pageSize });
}
