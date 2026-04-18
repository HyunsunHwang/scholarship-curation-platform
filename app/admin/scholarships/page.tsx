import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ScholarshipTable from "./ScholarshipTable";

export default async function AdminScholarshipsPage() {
  const supabase = await createClient();

  const { data: scholarships, error } = await supabase
    .from("scholarships")
    .select(
      "id, name, organization, apply_start_date, apply_end_date, support_amount, is_verified, support_types, poster_image_url, list_on_home"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="text-red-600 text-sm p-4 bg-red-50 rounded-lg">
        데이터를 불러오는 중 오류가 발생했습니다: {error.message}
      </div>
    );
  }

  const rows = (scholarships ?? []).map((s) => ({
    ...s,
    support_types: s.support_types as string[],
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">장학금 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            총 {rows.length}개의 장학금
          </p>
        </div>
        <Link
          href="/admin/scholarships/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          장학금 추가
        </Link>
      </div>

      <ScholarshipTable scholarships={rows} />
    </div>
  );
}
