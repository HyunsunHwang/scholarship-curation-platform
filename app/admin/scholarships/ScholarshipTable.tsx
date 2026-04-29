"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ToggleVerifiedButton, ToggleRecommendedButton, DeleteButton } from "./ScholarshipRowActions";
import { updatePosterImageUrl } from "./actions";

type ScholarshipRow = {
  id: number;
  name: string;
  organization: string;
  apply_start_date: string;
  apply_end_date: string;
  support_amount: number;
  support_amount_text: string | null;
  is_verified: boolean;
  support_types: string[];
  poster_image_url: string | null;
  list_on_home: boolean;
  is_recommended: boolean;
  recommended_sort_order: number | null;
};

function PosterUrlCell({
  id,
  initialUrl,
}: {
  id: number;
  initialUrl: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialUrl ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const frame = requestAnimationFrame(() => setValue(initialUrl ?? ""));
    return () => cancelAnimationFrame(frame);
  }, [initialUrl]);

  const save = () => {
    setError("");
    startTransition(async () => {
      const result = await updatePosterImageUrl(id, value.trim() || null);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-1 min-w-[200px] max-w-[280px]">
      <div className="flex gap-1.5">
        <input
          type="url"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          placeholder="https://..."
          className="min-w-0 flex-1 rounded border border-[#e8d9c8] px-2 py-1.5 text-xs text-ink placeholder:text-ink/40 outline-none focus:border-peach focus:ring-1 focus:ring-peach/20"
          disabled={pending}
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="shrink-0 rounded border border-skyblue/60 bg-skyblue/30 px-2 py-1.5 text-xs font-medium text-ink hover:bg-skyblue/60 disabled:opacity-50"
        >
          {pending ? "..." : "저장"}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600 leading-tight">{error}</p>}
    </div>
  );
}

type SortDir = "none" | "asc" | "desc";

function nextSortDir(current: SortDir): SortDir {
  if (current === "none") return "asc";
  if (current === "asc") return "desc";
  return "none";
}

function sortByDeadline(rows: ScholarshipRow[], dir: SortDir): ScholarshipRow[] {
  if (dir === "none") return rows;
  return [...rows].sort((a, b) => {
    const aVal = a.apply_end_date ?? "";
    const bVal = b.apply_end_date ?? "";
    // null/empty values always go to the end regardless of sort direction
    if (!aVal && !bVal) return 0;
    if (!aVal) return 1;
    if (!bVal) return -1;
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return dir === "asc" ? cmp : -cmp;
  });
}

/** 목록 기본 순서: 추천·순서값 우선, 그다음 생성일(최신) */
function sortDefaultAdminOrder(rows: ScholarshipRow[]): ScholarshipRow[] {
  return [...rows].sort((a, b) => {
    if (a.is_recommended !== b.is_recommended) return a.is_recommended ? -1 : 1;
    const ao = a.recommended_sort_order;
    const bo = b.recommended_sort_order;
    if (ao != null || bo != null) {
      if (ao == null) return 1;
      if (bo == null) return -1;
      if (ao !== bo) return ao - bo;
    }
    return b.id - a.id;
  });
}

export default function ScholarshipTable({
  scholarships,
}: {
  scholarships: ScholarshipRow[];
}) {
  const [query, setQuery] = useState("");
  const [deadlineSort, setDeadlineSort] = useState<SortDir>("none");

  const q = query.trim().toLowerCase();
  const narrowed = q
    ? scholarships.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.organization.toLowerCase().includes(q)
      )
    : scholarships;
  const forSort = deadlineSort === "none" ? sortDefaultAdminOrder(narrowed) : narrowed;
  const filtered = sortByDeadline(forSort, deadlineSort);

  return (
    <>
      <div className="relative mb-4">
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="장학금 이름 또는 기관명으로 검색..."
          className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {q && (
        <p className="mb-3 text-xs text-gray-500">
          검색 결과: <span className="font-semibold text-gray-700">{filtered.length}</span>건
        </p>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">이름 / 기관</th>
              <th className="px-4 py-3">포스터 URL</th>
              <th className="px-4 py-3">지원 유형</th>
              <th className="px-4 py-3">지원금액</th>
              <th className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => setDeadlineSort(nextSortDir(deadlineSort))}
                  className="inline-flex items-center gap-1 hover:text-gray-800 transition-colors"
                  title={
                    deadlineSort === "none"
                      ? "마감일 오름차순 정렬"
                      : deadlineSort === "asc"
                      ? "마감일 내림차순 정렬"
                      : "정렬 해제"
                  }
                >
                  신청 기간
                  <span className="flex flex-col leading-none -space-y-px">
                    <svg
                      className={`w-2.5 h-2.5 ${deadlineSort === "asc" ? "text-blue-600" : "text-gray-300"}`}
                      viewBox="0 0 10 6"
                      fill="currentColor"
                    >
                      <path d="M5 0L10 6H0z" />
                    </svg>
                    <svg
                      className={`w-2.5 h-2.5 ${deadlineSort === "desc" ? "text-blue-600" : "text-gray-300"}`}
                      viewBox="0 0 10 6"
                      fill="currentColor"
                    >
                      <path d="M5 6L0 0H10z" />
                    </svg>
                  </span>
                </button>
              </th>
              <th className="px-4 py-3">추천</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3 text-right">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length > 0 ? (
              filtered.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-medium text-gray-900">{s.name}</p>
                      {s.list_on_home === false && (
                        <span
                          className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200"
                          title="홈 전체 목록에는 표시되지 않고 맞춤 장학금에서만 노출"
                        >
                          맞춤만
                        </span>
                      )}
                      {s.is_recommended && (
                        <span
                          className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-800 ring-1 ring-indigo-200"
                          title={
                            s.recommended_sort_order != null
                              ? `추천 순서 ${s.recommended_sort_order}`
                              : "홈 전체 목록 상단 추천"
                          }
                        >
                          추천
                          {s.recommended_sort_order != null ? ` #${s.recommended_sort_order}` : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs">{s.organization}</p>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <PosterUrlCell id={s.id} initialUrl={s.poster_image_url} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {s.support_types.map((t) => (
                        <span
                          key={t}
                          className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <p className="max-w-[220px] line-clamp-2">
                      {s.support_amount_text?.trim() || `${s.support_amount.toLocaleString()}원`}
                    </p>
                    {s.support_amount_text?.trim() && (
                      <p className="mt-0.5 text-xs text-gray-400">
                        정렬금액 {s.support_amount.toLocaleString()}원
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {s.apply_start_date} ~<br />
                    {s.apply_end_date}
                  </td>
                  <td className="px-4 py-3">
                    <ToggleRecommendedButton id={s.id} isRecommended={s.is_recommended} />
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
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                  {q ? (
                    <>
                      <span className="font-medium">&ldquo;{query}&rdquo;</span>에 대한 검색 결과가 없습니다.
                    </>
                  ) : (
                    <>
                      등록된 장학금이 없습니다.{" "}
                      <Link
                        href="/admin/scholarships/new"
                        className="text-blue-600 hover:underline"
                      >
                        첫 장학금을 추가해보세요.
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
