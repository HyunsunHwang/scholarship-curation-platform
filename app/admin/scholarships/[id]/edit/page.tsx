import { redirect } from "next/navigation";

export default async function LegacyScholarshipEditRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/content/scholarships/${id}/edit`);
}
