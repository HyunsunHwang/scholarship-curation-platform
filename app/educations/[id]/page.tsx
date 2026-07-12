import OpportunityDetailPage from "@/components/opportunity/OpportunityDetailPage";

export default function EducationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <OpportunityDetailPage params={params} expectedKind="education" />;
}
