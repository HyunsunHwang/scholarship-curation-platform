import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScholarshipForm from "../../ScholarshipForm";
import { updateScholarship } from "../../actions";
import { loadCrawlerDepartments } from "@/lib/crawler-departments";

export default async function EditScholarshipPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ type?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const returnPath =
    resolvedSearchParams.type === "on_campus" || resolvedSearchParams.type === "off_campus"
      ? `/admin/scholarships?type=${resolvedSearchParams.type}`
      : "/admin/scholarships";
  const scholarshipId = parseInt(id, 10);

  if (isNaN(scholarshipId)) notFound();

  const supabase = await createClient();
  const [{ data: scholarship }, { data: universities }, crawlerDepartments] = await Promise.all([
    supabase.from("scholarships").select("*").eq("id", scholarshipId).single(),
    supabase.from("universities").select("id, name").order("name"),
    loadCrawlerDepartments(),
  ]);
  const universityNames = (universities ?? []).map((u) => u.name);

  if (!scholarship || scholarship.is_advertisement === true) notFound();

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
        universities={universityNames}
        universityDepartments={crawlerDepartments.map((entry) => ({
          university: entry.university,
          department: entry.department,
        }))}
        returnPath={returnPath}
      />
    </div>
  );
}
