import { redirect } from "next/navigation";

export default function LegacyScholarshipsRedirect() {
  redirect("/admin/content?kind=scholarship");
}
