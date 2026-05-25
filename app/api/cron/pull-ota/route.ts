import { NextRequest, NextResponse } from "next/server";
import { pullOTABookings } from "@/lib/booking-service";

// Vercel Cron: every 3 minutes (see vercel.json)
// Protected by CRON_SECRET to prevent unauthorized triggers
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await pullOTABookings();
  return NextResponse.json({ success: true, timestamp: new Date().toISOString() });
}
