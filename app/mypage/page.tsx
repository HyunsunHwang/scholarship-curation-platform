import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import HomeSearchRoot from "@/components/home/HomeSearchRoot";
import SpotifyTopNav from "@/components/home/SpotifyTopNav";
import ProfileAvatar from "@/components/ProfileAvatar";
import ProfileSpecBoard from "@/components/profile/ProfileSpecBoard";
import { SPEC_SECTIONS, coerceSpecItem } from "@/lib/profile-spec";
import { normalizeInterestCategories } from "@/lib/interestCategories";
import { resolveNavUserContext } from "@/lib/nav-user-context";

function enrollmentBadge(status: string | null, academicYear: number | null): string {
  const parts: string[] = [];
  if (academicYear) parts.push(`${academicYear}학년`);
  if (status) parts.push(status);
  return parts.join(" · ");
}

export default async function MyPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const [{ data: profile }, specItemsResult, navContext] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "name, email, headline, bio, interest_categories, school_name, department, academic_year, enrollment_status"
      )
      .eq("id", user.id)
      .single(),
    supabase
      .from("profile_spec_items")
      .select(
        "id, item_type, title, organization, description, start_date, end_date, is_current, star_role, star_action, star_result, artifacts"
      )
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    resolveNavUserContext(user),
  ]);

  const specItems = (specItemsResult.data ?? []).map((row) =>
    coerceSpecItem(row as Parameters<typeof coerceSpecItem>[0])
  );

  const displayName = profile?.name ?? user.email ?? "";
  const schoolLine = [profile?.school_name, profile?.department]
    .filter(Boolean)
    .join(" · ");
  const statusLine = enrollmentBadge(
    profile?.enrollment_status ?? null,
    profile?.academic_year ?? null
  );

  const interestCategories = normalizeInterestCategories(
    profile?.interest_categories ?? null
  );

  // 프로필 완성도: 소개 3항목(한줄·소개·관심직무) + 섹션별 1개 이상
  const filledSections = SPEC_SECTIONS.filter((s) =>
    specItems.some((item) => item.item_type === s.type)
  ).length;
  const introFilled =
    Number(Boolean(profile?.headline)) +
    Number(Boolean(profile?.bio)) +
    Number(interestCategories.length > 0);
  const completeness = Math.round(
    ((introFilled + filledSections) / (3 + SPEC_SECTIONS.length)) * 100
  );

  return (
    <div className="flex min-h-screen flex-col bg-cream/40">
      <HomeSearchRoot>
        <SpotifyTopNav
          variant="compact"
          currentUser={user}
          currentUserRole={navContext.role}
          currentUserName={profile?.name ?? navContext.name}
          urgentBookmarkCount={navContext.urgentBookmarkCount}
        />
      </HomeSearchRoot>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          {/* 프로필 히어로 카드 */}
          <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white">
            <div className="h-24 bg-linear-to-r from-brand via-brand to-peach sm:h-28" />
            <div className="px-5 pb-5 sm:px-8 sm:pb-6">
              <div className="-mt-10 flex items-end justify-between sm:-mt-12">
                <ProfileAvatar
                  alt={displayName || "프로필"}
                  className="h-20 w-20 border-4 border-white sm:h-24 sm:w-24"
                  sizes="96px"
                  priority
                />
                <Link
                  href="/onboarding"
                  className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-cream"
                >
                  기본 정보 수정
                </Link>
              </div>

              <div className="mt-3">
                <h1 className="text-2xl font-extrabold tracking-tight text-ink">
                  {displayName}
                </h1>
                {profile?.headline ? (
                  <p className="mt-1 text-sm font-medium text-ink/75">
                    {profile.headline}
                  </p>
                ) : null}
                <div className="mt-1.5 space-y-0.5 text-sm text-ink/55">
                  {schoolLine ? <p>{schoolLine}</p> : null}
                  {statusLine ? <p>{statusLine}</p> : null}
                  <p>{user.email}</p>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
            {/* 메인: 소개 + 스펙 섹션 */}
            <ProfileSpecBoard
              intro={{
                headline: profile?.headline ?? null,
                bio: profile?.bio ?? null,
                interest_categories: interestCategories,
              }}
              items={specItems}
            />

            {/* 사이드바 */}
            <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
              <section className="rounded-2xl border border-gray-200/80 bg-white p-5">
                <h2 className="text-sm font-bold text-ink">프로필 완성도</h2>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-brand transition-[width]"
                    style={{ width: `${completeness}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-ink/55">
                  <span className="font-bold text-brand">{completeness}%</span>{" "}
                  완성 — 스펙을 채울수록 지원서 준비가 쉬워져요.
                </p>
              </section>

              <section className="rounded-2xl border border-gray-200/80 bg-white p-5">
                <h2 className="text-sm font-bold text-ink">바로가기</h2>
                <ul className="mt-2 space-y-1">
                  <li>
                    <Link
                      href="/library/saved"
                      className="flex items-center justify-between rounded-lg px-2 py-2 text-sm font-medium text-ink/75 hover:bg-beige hover:text-ink"
                    >
                      담은 공고
                      <span aria-hidden>→</span>
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/matched"
                      className="flex items-center justify-between rounded-lg px-2 py-2 text-sm font-medium text-ink/75 hover:bg-beige hover:text-ink"
                    >
                      조건에 맞는 장학금
                      <span aria-hidden>→</span>
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/library/recent"
                      className="flex items-center justify-between rounded-lg px-2 py-2 text-sm font-medium text-ink/75 hover:bg-beige hover:text-ink"
                    >
                      최근 조회
                      <span aria-hidden>→</span>
                    </Link>
                  </li>
                </ul>
              </section>
            </aside>
          </div>
        </div>
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
