import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ToggleVerifiedButton, DeleteButton } from "./ScholarshipRowActions";

export default async function AdminScholarshipsPage() {
  const supabase = await createClient();

  const { data: scholarships, error } = await supabase
    .from("scholarships")
    .select(
      "id, name, organization, apply_start_date, apply_end_date, support_amount, is_verified, support_types"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="text-red-600 text-sm p-4 bg-red-50 rounded-lg">
        데이터를 불러오는 중 오류가 발생했습니다: {error.message}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">장학금 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            총 {scholarships?.length ?? 0}개의 장학금
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

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">이름 / 기관</th>
              <th className="px-4 py-3">지원 유형</th>
              <th className="px-4 py-3">지원금액</th>
              <th className="px-4 py-3">신청 기간</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3 text-right">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {scholarships && scholarships.length > 0 ? (
              scholarships.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{s.name}</p>
                    <p className="text-gray-500 text-xs">{s.organization}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(s.support_types as string[]).map((t) => (
                        <span
                          key={t}
                          className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {s.support_amount.toLocaleString()}원
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {s.apply_start_date} ~<br />
                    {s.apply_end_date}
                  </td>
                  <td className="px-4 py-3">
                    <ToggleVerifiedButton id={s.id} isVerified={s.is_verified} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/scholarships/${s.id}/edit`}
                        className="px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        수정
                      </Link>
                      <DeleteButton id={s.id} name={s.name} />
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  등록된 장학금이 없습니다.{" "}
                  <Link
                    href="/admin/scholarships/new"
                    className="text-blue-600 hover:underline"
                  >
                    첫 장학금을 추가해보세요.
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
