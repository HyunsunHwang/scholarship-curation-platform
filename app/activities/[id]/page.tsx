import OpportunityDetailPage from "@/components/opportunity/OpportunityDetailPage";

export default function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <OpportunityDetailPage params={params} expectedKind="activity" />;
}
