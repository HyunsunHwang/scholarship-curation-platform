import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/Navbar";
import ScholarshipDashboard from "@/components/ScholarshipDashboard";
import type { CardScholarship } from "@/components/ScholarshipCard";
import { isScholarshipExpired } from "@/lib/scholarship-dates";

export default async function MyPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const [{ data: profile }, { data: bookmarkRows }] = await Promise.all([
    supabase.from("profiles").select("name, email").eq("id", user.id).single(),
    supabase
      .from("bookmarks")
      .select("scholarship_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const bookmarkedIds = (bookmarkRows ?? []).map((b) => b.scholarship_id);

  // 북마크된 장학금 상세 정보를 별도 쿼리로 조회
  const { data: scholarshipRows } =
    bookmarkedIds.length > 0
      ? await supabase
          .from("scholarships")
          .select(
            "id, name, organization, institution_type, support_types, support_amount, apply_end_date, poster_image_url, created_at"
          )
          .in("id", bookmarkedIds)
      : { data: [] };

  // bookmarks 순서(최신 북마크순) 유지
  const scholarshipMap = new Map(
    (scholarshipRows ?? []).map((s) => [s.id, s])
  );
  const bookmarkedScholarships: CardScholarship[] = bookmarkedIds.flatMap((id) => {
    const s = scholarshipMap.get(id);
    if (!s) return [];
    if (isScholarshipExpired(s.apply_end_date)) return [];
    return [{
      id: s.id,
      name: s.name,
      organization: s.organization,
      institution_type: s.institution_type as string,
      support_types: s.support_types as string[],
      support_amount: s.support_amount,
      apply_end_date: s.apply_end_date,
      poster_image_url: s.poster_image_url ?? null,
      created_at: s.created_at,
    }];
  });

  const displayName = profile?.name ?? user.email ?? "";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Navbar />

      <main className="flex-1">
        {/* 프로필 헤더 */}
        <div className="bg-white border-b border-gray-100">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xl font-bold text-white">
                  {initial}
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl font-bold text-gray-900 truncate">
                    {displayName}
                  </h1>
                  <p className="mt-0.5 text-sm text-gray-500 truncate">
                    {user.email}
                  </p>
                </div>
              </div>
              <Link
                href="/onboarding"
                className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors sm:self-center"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"
                  />
                </svg>
                프로필 수정
              </Link>
            </div>
          </div>
        </div>

        {/* 북마크 섹션 */}
        {bookmarkedScholarships.length === 0 ? (
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24 flex flex-col items-center text-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="h-10 w-10 text-gray-300"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
                />
              </svg>
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">
                아직 북마크한 장학금이 없어요
              </p>
              <p className="mt-1 text-sm text-gray-500">
                관심 있는 장학금에 북마크를 추가해보세요.
              </p>
            </div>
            <Link
              href="/#scholarships"
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              장학금 둘러보기
            </Link>
          </div>
        ) : (
          <div>
            {/* 섹션 헤더 */}
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 pb-0">
              <div className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 fill-indigo-500 stroke-indigo-500"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
                  />
                </svg>
                <h2 className="text-lg font-bold text-gray-900">내 북마크</h2>
                <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                  {bookmarkedScholarships.length}개
                </span>
              </div>
            </div>
            <ScholarshipDashboard
              scholarships={bookmarkedScholarships}
              bookmarkedIds={bookmarkedIds}
            />
          </div>
        )}
      </main>

      <footer className="border-t border-gray-100 bg-white py-8">
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
