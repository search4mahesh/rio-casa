import { NextRequest } from "next/server";
import { pullOTABookings } from "@/lib/channel-manager";
import { ok } from "@/lib/api-response";
import { denyIfNotCron } from "@/lib/cron-auth";

// NOT SCHEDULED — deliberately absent from vercel.json.
//
// pullOTABookings() targets eZee Centrix, a channel manager this property
// does not use; the integration was evaluated and shelved. EZEE_API_URL is
// still set in .env, so scheduling this would fire real HTTP requests at a
// third party every run using placeholder credentials.
//
// Kept reachable for manual testing only. Delete this route together with
// pullOTABookings/syncWithChannelManager in lib/booking-service.ts when the
// eZee stubs are removed.
export async function GET(req: NextRequest) {
  const denied = denyIfNotCron(req);
  if (denied) return denied;

  await pullOTABookings();
  return ok(new Date().toISOString());
}
