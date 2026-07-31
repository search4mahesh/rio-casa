import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { okEmpty } from "@/lib/api-response";

export async function POST() {
  const res = okEmpty();
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
