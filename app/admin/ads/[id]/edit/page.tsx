import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdForm from "../../AdForm";
import { updateScholarship } from "../../../scholarships/actions";

export default async function EditAdPage({
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

  if (!scholarship || scholarship.is_advertisement !== true) notFound();

  const boundAction = updateScholarship.bind(null, scholarshipId);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/ads"
          className="text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          ← 목록으로
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          광고 수정: {scholarship.name}
        </h1>
      </div>
      <AdForm
        defaultValues={scholarship}
        action={boundAction}
        submitLabel="변경사항 저장"
        returnPath="/admin/ads"
      />
    </div>
  );
}
