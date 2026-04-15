import { notFound } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { createClient } from "@/lib/supabase/server";
import BookmarkApplyButtons from "./BookmarkApplyButtons";
import {
  formatApplyPeriodRange,
  isAlwaysOpenRecruitment,
} from "@/lib/scholarship-dates";

// yyyy-mm-dd → yyyy/mm/dd
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return dateStr.replace(/-/g, "/");
}

function formatAmount(won: number): string {
  if (won === 0) return "전액";
  const manWon = won / 10000;
  if (manWon >= 10000) return `연 ${(manWon / 10000).toFixed(0)}억원`;
  if (manWon >= 1) return `연 ${manWon.toLocaleString()}만원`;
  return `연 ${won.toLocaleString()}원`;
}

function getDaysUntilDeadline(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(dateStr);
  return Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

const institutionGradient: Record<string, string> = {
  국가기관: "from-indigo-400 to-blue-700",
  공공기관: "from-blue-400 to-cyan-600",
  지방자치단체: "from-orange-400 to-amber-600",
  기업: "from-violet-400 to-purple-600",
  재단법인: "from-emerald-400 to-teal-600",
  학교법인: "from-cyan-400 to-sky-600",
  "언론/방송": "from-red-400 to-rose-600",
  종교단체: "from-yellow-400 to-amber-600",
  기타: "from-gray-400 to-gray-600",
};

export default async function ScholarshipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scholarshipId = parseInt(id, 10);
  if (isNaN(scholarshipId)) notFound();

  const supabase = await createClient();

  const [{ data: scholarship }, { data: { user } }] = await Promise.all([
    supabase.from("scholarships").select("*").eq("id", scholarshipId).single(),
    supabase.auth.getUser(),
  ]);

  if (!scholarship) notFound();

  let initialBookmarked = false;
  if (user) {
    const { data: bm } = await supabase
      .from("bookmarks")
      .select("id")
      .eq("user_id", user.id)
      .eq("scholarship_id", scholarshipId)
      .maybeSingle();
    initialBookmarked = !!bm;
  }

  const alwaysOpen = isAlwaysOpenRecruitment(scholarship.apply_end_date);
  const days = alwaysOpen
    ? 0
    : getDaysUntilDeadline(scholarship.apply_end_date);
  const gradient = institutionGradient[scholarship.institution_type] ?? "from-gray-400 to-gray-600";

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Navbar />

      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">

          {/* 뒤로 가기 */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-6"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            목록으로
          </Link>

          {/* 헤더 — 제목 + D-day 배지 */}
          <div className="mb-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <DeadlineBadge days={days} alwaysOpen={alwaysOpen} />
                <h1 className="mt-2 text-2xl font-bold text-gray-900 leading-snug">
                  {scholarship.name}
                </h1>
              </div>
            </div>

            {/* 기관 정보 바 */}
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <div className={`h-8 w-8 rounded-lg bg-linear-to-br ${gradient} flex items-center justify-center`}>
                  <span className="text-xs font-bold text-white">
                    {scholarship.organization.charAt(0)}
                  </span>
                </div>
                <span className="text-sm font-semibold text-gray-800">
                  {scholarship.organization}
                </span>
              </div>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                {scholarship.institution_type}
              </span>
              {scholarship.is_verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  검증된 정보
                </span>
              )}
            </div>
          </div>

          {/* 본문 2컬럼 */}
          <div className="flex gap-7 items-start flex-col md:flex-row">

            {/* 왼쪽 — 포스터 + 버튼 */}
            <div className="w-full md:w-64 shrink-0">
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm aspect-3/4">
                {scholarship.poster_image_url ? (
                  <img
                    src={scholarship.poster_image_url}
                    alt={`${scholarship.name} 포스터`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className={`h-full w-full bg-linear-to-br ${gradient} flex items-center justify-center`}>
                    <span className="text-4xl font-bold text-white/30">
                      {scholarship.organization.charAt(0)}
                    </span>
                  </div>
                )}
              </div>

              {/* 북마크 + 지원하기 */}
              <BookmarkApplyButtons
                scholarshipId={scholarship.id}
                applyUrl={scholarship.apply_url}
                initialBookmarked={initialBookmarked}
              />

              {/* 홈페이지 링크 */}
              {scholarship.homepage_url && (
                <a
                  href={scholarship.homepage_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-medium text-gray-500 border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                >
                  홈페이지 방문
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              )}
            </div>

            {/* 오른쪽 — 상세 정보 */}
            <div className="flex-1 min-w-0 space-y-4">

              {/* 핵심 정보 카드 */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-700">장학금 정보</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  <InfoRow
                    label="지원 형태"
                    value={
                      <div className="flex flex-wrap gap-1.5">
                        {scholarship.support_types.map((t: string) => (
                          <span
                            key={t}
                            className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    }
                  />
                  <InfoRow
                    label="지원 금액"
                    value={
                      <span className="text-lg font-extrabold text-indigo-600">
                        {formatAmount(scholarship.support_amount)}
                      </span>
                    }
                  />
                  <InfoRow
                    label="접수 기간"
                    value={
                      <span className={alwaysOpen ? "font-medium text-indigo-700" : undefined}>
                        {formatApplyPeriodRange(
                          scholarship.apply_start_date,
                          scholarship.apply_end_date
                        )}
                      </span>
                    }
                  />
                  <InfoRow
                    label="선발 인원"
                    value={
                      scholarship.selection_count
                        ? `${scholarship.selection_count.toLocaleString()}명`
                        : "인원 제한 없음"
                    }
                  />
                  {scholarship.announcement_date && (
                    <InfoRow
                      label="발표일"
                      value={formatDate(scholarship.announcement_date)}
                    />
                  )}
                  <InfoRow
                    label="중복 수혜"
                    value={scholarship.can_overlap ? "가능" : "불가"}
                  />
                </div>
              </div>

              {/* 자격 요건 카드 */}
              {hasQualifications(scholarship) && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-700">자격 요건</h2>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {scholarship.qual_gpa_min && (
                      <InfoRow label="최소 학점 (누적)" value={`${scholarship.qual_gpa_min} 이상`} />
                    )}
                    {scholarship.qual_gpa_last_semester_min && (
                      <InfoRow label="최소 학점 (직전)" value={`${scholarship.qual_gpa_last_semester_min} 이상`} />
                    )}
                    {scholarship.qual_income_level_max && (
                      <InfoRow
                        label="소득 분위"
                        value={`${scholarship.qual_income_level_min ?? 1} ~ ${scholarship.qual_income_level_max}분위`}
                      />
                    )}
                    {scholarship.qual_gender && (
                      <InfoRow label="성별" value={scholarship.qual_gender} />
                    )}
                    {(scholarship.qual_age_min || scholarship.qual_age_max) && (
                      <InfoRow
                        label="연령"
                        value={`${scholarship.qual_age_min ?? "—"}세 ~ ${scholarship.qual_age_max ?? "—"}세`}
                      />
                    )}
                    {scholarship.qual_region && scholarship.qual_region.length > 0 && (
                      <InfoRow label="지역" value={scholarship.qual_region.join(", ")} />
                    )}
                    {scholarship.qual_major && scholarship.qual_major.length > 0 && (
                      <InfoRow label="전공" value={scholarship.qual_major.join(", ")} />
                    )}
                    {scholarship.qual_special_info && scholarship.qual_special_info.length > 0 && (
                      <InfoRow
                        label="특별 요건"
                        value={
                          <div className="flex flex-wrap gap-1">
                            {scholarship.qual_special_info.map((t: string) => (
                              <span key={t} className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                                {t}
                              </span>
                            ))}
                          </div>
                        }
                      />
                    )}
                    {scholarship.qual_nationality && (
                      <InfoRow label="국적" value={scholarship.qual_nationality} />
                    )}
                  </div>
                </div>
              )}

              {/* 신청 방법 카드 */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-700">신청 방법</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  <InfoRow label="신청 방법" value={scholarship.apply_method} />
                  {scholarship.required_documents && scholarship.required_documents.length > 0 && (
                    <InfoRow label="제출 서류" value={scholarship.required_documents.join(", ")} />
                  )}
                  {scholarship.contact && (
                    <InfoRow label="문의처" value={scholarship.contact} />
                  )}
                </div>
              </div>

              {/* 선발 절차 카드 */}
              {scholarship.selection_stages > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-700">선발 절차</h2>
                  </div>
                  <div className="px-5 py-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      {[1, 2, 3, 4, 5].map((n) => {
                        const stage = (scholarship as Record<string, unknown>)[`selection_stage_${n}`] as string | null;
                        if (!stage) return null;
                        return (
                          <div key={n} className="flex items-center gap-2">
                            {n > 1 && (
                              <svg className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
                              <span className="h-4 w-4 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold">
                                {n}
                              </span>
                              {stage}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {scholarship.selection_note && (
                      <p className="mt-3 text-xs text-gray-500">{scholarship.selection_note}</p>
                    )}
                  </div>
                </div>
              )}

              {/* 비고 */}
              {scholarship.note && (
                <div className="bg-amber-50 rounded-2xl border border-amber-200 px-5 py-4">
                  <p className="text-xs font-semibold text-amber-700 mb-1">비고</p>
                  <p className="text-sm text-amber-900">{scholarship.note}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-100 bg-white py-8 mt-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-indigo-600">
                <span className="text-xs font-bold text-white">K</span>
              </div>
              <span className="text-sm font-semibold text-gray-700">쿠넥트</span>
            </div>
            <p className="text-xs text-gray-400">
              © 2026 쿠넥트. 장학금 정보는 각 기관의 공식 발표를 기준으로 합니다.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── 재사용 컴포넌트 ────────────────────────────────────────────────

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-3">
      <span className="w-28 shrink-0 text-xs font-medium text-gray-500">{label}</span>
      <span className="flex-1 text-sm text-gray-800">{value}</span>
    </div>
  );
}

function DeadlineBadge({ days, alwaysOpen }: { days: number; alwaysOpen?: boolean }) {
  if (alwaysOpen) {
    return (
      <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
        상시모집
      </span>
    );
  }
  if (days < 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">
        마감됨
      </span>
    );
  }
  if (days === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-600">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
        D-Day
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        D-{days}
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-600">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        D-{days}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
      D-{days}
    </span>
  );
}

function hasQualifications(s: Record<string, unknown>): boolean {
  return !!(
    s.qual_gpa_min ||
    s.qual_gpa_last_semester_min ||
    s.qual_income_level_max ||
    s.qual_gender ||
    s.qual_age_min ||
    s.qual_age_max ||
    (Array.isArray(s.qual_region) && (s.qual_region as unknown[]).length > 0) ||
    (Array.isArray(s.qual_major) && (s.qual_major as unknown[]).length > 0) ||
    (Array.isArray(s.qual_special_info) && (s.qual_special_info as unknown[]).length > 0) ||
    s.qual_nationality
  );
}
