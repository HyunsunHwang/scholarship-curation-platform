import { redirect } from "next/navigation";

export default function LegacySiteSettingsRedirect() {
  redirect("/admin/settings");
}
