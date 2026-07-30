import { redirect } from "next/navigation";

// Moved into a hub page — kept so existing bookmarks keep working.
export default function Page() {
  redirect("/admin/money?tab=nightaudit");
}
