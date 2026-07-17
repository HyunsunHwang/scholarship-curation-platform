import { redirect } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ScholarshipDashboard from "@/components/ScholarshipDashboard";
import { createClient } from "@/lib/supabase/server";
import { loadMatchedPageData } from "@/lib/matched-data";
import { getBookmarkedScholarshipIds } from "@/lib/user-bookmarks";

export default async function MatchedPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope: scopeParam } = await searchParams;
  const initialScope =
    scopeParam === "campus" || scopeParam === "external" || scopeParam === "all"
      ? scopeParam
      : "all";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const [{ data: profile }, bookmarkedIds] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_onboarded, name")
      .eq("id", user.id)
      .single(),
    getBookmarkedScholarshipIds(supabase, user.id),
  ]);

  if (!profile?.is_onboarded) redirect("/onboarding");

  const { scholarships, totalCount, scopeCounts, errorMessage } =
    await loadMatchedPageData(user.id);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar currentUser={user} currentUserName={profile?.name ?? null} />

      <main className="flex-1">
        <div className="border-b border-gray-200 bg-white py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-brand">
                  맞춤 큐레이션
                </p>
                <h1 className="text-2xl font-bold text-ink">
                  {profile.name ? `${profile.name}님` : "나"}에게 맞는 장학금
                </h1>
                <p className="mt-1 text-sm text-ink/60">
                  프로필 정보를 기반으로 자격 조건이 충족되는 장학금만 모았습니다.
                </p>
              </div>
              <div className="flex shrink-0 gap-3">
                <Link
                  href="/onboarding"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-cream"
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
                <Link
                  href="/"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-ink/60 transition-colors hover:bg-cream"
                >
                  전체 보기
                </Link>
              </div>
            </div>

            {errorMessage && (
              <div className="mt-4 rounded-lg border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-brand">
                매칭 중 오류가 발생했습니다: {errorMessage}
              </div>
            )}
          </div>
        </div>

        {!errorMessage && totalCount === 0 ? (
          <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10">
              <svg
                className="h-8 w-8 text-peach"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 14l9-5-9-5-9 5 9 5zm0 0v6"
                />
              </svg>
            </div>
            <p className="text-lg font-semibold text-ink">
              현재 조건에 맞는 장학금이 없습니다
            </p>
            <p className="mt-2 text-sm text-ink/60">
              프로필 정보를 최신 상태로 업데이트하거나, 전체 장학금 목록을
              확인해보세요.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                href="/onboarding"
                className="inline-flex items-center rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/85"
              >
                프로필 업데이트
              </Link>
              <Link
                href="/"
                className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-cream"
              >
                전체 장학금 보기
              </Link>
            </div>
          </div>
        ) : (
          <ScholarshipDashboard
            scholarships={scholarships}
            bookmarkedIds={bookmarkedIds}
            totalScholarshipCount={totalCount}
            scopeCounts={scopeCounts}
            heading={
              initialScope === "campus"
                ? "교내 장학금"
                : initialScope === "external"
                  ? "교외 장학금"
                  : "맞춤 장학금"
            }
            showScopeTabs
            initialScope={initialScope}
          />
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center text-sm text-gray-600">
            문의 메일:{" "}
            <a
              href="mailto:hyunsun4819@gmail.com"
              className="font-medium text-brand hover:underline"
            >
              hyunsun4819@gmail.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
