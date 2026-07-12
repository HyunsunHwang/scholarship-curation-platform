import Link from "next/link";
import ScholarshipForm from "@/app/admin/scholarships/ScholarshipForm";
import { createScholarship } from "@/app/admin/scholarships/actions";
import { createClient } from "@/lib/supabase/server";
import { loadCrawlerDepartments } from "@/lib/crawler-departments";

export default async function NewContentScholarshipPage({
  searchParams,
}: {
  searchParams?: Promise<{ type?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const preferredType =
    resolvedSearchParams.type === "on_campus" ||
    resolvedSearchParams.type === "off_campus"
      ? resolvedSearchParams.type
      : "off_campus";
  const returnPath = `/admin/content?kind=scholarship${
    preferredType !== "off_campus" ? `&type=${preferredType}` : ""
  }`;

  const supabase = await createClient();
  const [{ data: universities }, crawlerDepartments] = await Promise.all([
    supabase.from("universities").select("id, name").order("name"),
    loadCrawlerDepartments(),
  ]);
  const universityNames = (universities ?? []).map((u) => u.name);

  return (
    <div>
      <div className="mb-6">
        <Link
          href={returnPath}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ← 목록으로
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">장학금 추가</h1>
      </div>
      <ScholarshipForm
        defaultValues={{ scholarship_type: preferredType }}
        action={createScholarship}
        submitLabel="장학금 등록"
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
