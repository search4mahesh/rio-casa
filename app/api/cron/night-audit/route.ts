import { NextRequest, NextResponse } from "next/server";
import { runNightAudit } from "@/lib/booking-service";

// Vercel Cron: midnight daily (see vercel.json)
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runNightAudit();
  return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
}
