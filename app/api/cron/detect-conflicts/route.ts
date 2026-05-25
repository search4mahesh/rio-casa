import { NextRequest, NextResponse } from "next/server";
import { detectConflicts } from "@/lib/booking-service";

// Vercel Cron: every hour (see vercel.json)
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conflicts = await detectConflicts();
  return NextResponse.json({
    success: true,
    conflicts: conflicts.length,
    data: conflicts,
    timestamp: new Date().toISOString(),
  });
}
