import { redirect } from "next/navigation";

export default function LegacyCrawledNoticesRedirect() {
  redirect("/admin/review?kind=scholarship");
}
