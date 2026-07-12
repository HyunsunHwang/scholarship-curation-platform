import { redirect } from "next/navigation";

export default async function LegacyScholarshipNewRedirect({
  searchParams,
}: {
  searchParams?: Promise<{ type?: string }>;
}) {
  const resolved = (await searchParams) ?? {};
  const qs = new URLSearchParams();
  if (resolved.type === "on_campus" || resolved.type === "off_campus") {
    qs.set("type", resolved.type);
  }
  const query = qs.toString();
  redirect(`/admin/content/scholarships/new${query ? `?${query}` : ""}`);
}
