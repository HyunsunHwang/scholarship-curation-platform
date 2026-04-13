import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScholarshipForm from "../../ScholarshipForm";
import { updateScholarship } from "../../actions";

export default async function EditScholarshipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scholarshipId = parseInt(id, 10);

  if (isNaN(scholarshipId)) notFound();

  const supabase = await createClient();
  const { data: scholarship } = await supabase
    .from("scholarships")
    .select("*")
    .eq("id", scholarshipId)
    .single();

  if (!scholarship) notFound();

  const boundAction = updateScholarship.bind(null, scholarshipId);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/scholarships"
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ← 목록으로
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">
          장학금 수정: {scholarship.name}
        </h1>
      </div>
      <ScholarshipForm
        defaultValues={scholarship}
        action={boundAction}
        submitLabel="변경사항 저장"
      />
    </div>
  );
}
