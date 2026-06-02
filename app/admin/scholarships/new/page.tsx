import Link from "next/link";
import ScholarshipForm from "../ScholarshipForm";
import { createScholarship } from "../actions";
import { createClient } from "@/lib/supabase/server";

export default async function NewScholarshipPage({
  searchParams,
}: {
  searchParams?: Promise<{ type?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const preferredType =
    resolvedSearchParams.type === "on_campus" || resolvedSearchParams.type === "off_campus"
      ? resolvedSearchParams.type
      : "off_campus";
  const returnPath =
    preferredType === "off_campus" ? "/admin/scholarships?type=off_campus" : "/admin/scholarships?type=on_campus";

  const supabase = await createClient();
  const { data: universities } = await supabase
    .from("universities")
    .select("name")
    .order("name");
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
        returnPath={returnPath}
      />
    </div>
  );
}
