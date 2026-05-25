import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ success: false }, { status: 401 });
  }
  const staff = await verifyAdminToken(token);
  if (!staff) {
    return NextResponse.json({ success: false }, { status: 401 });
  }
  return NextResponse.json({ success: true, staff });
}
