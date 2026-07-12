import { redirect } from "next/navigation";

export default async function LegacyCrawledNoticeDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/review/scholarships/${id}`);
}
