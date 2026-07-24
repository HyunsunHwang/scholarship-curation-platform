import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import HomeSearchRoot from "@/components/home/HomeSearchRoot";
import SpotifyTopNav from "@/components/home/SpotifyTopNav";
import ProfilePreview from "@/components/profile/ProfilePreview";
import SiteFooter from "@/components/SiteFooter";
import { coerceSpecItem } from "@/lib/profile-spec";
import { normalizeInterestCategories } from "@/lib/interestCategories";
import { normalizeInterestIndustries } from "@/lib/interestIndustries";
import { normalizeSkills } from "@/lib/skills";
import { resolveNavUserContext } from "@/lib/nav-user-context";

function enrollmentBadge(status: string | null, academicYear: number | null): string {
  const parts: string[] = [];
  if (academicYear) parts.push(`${academicYear}학년`);
  if (status) parts.push(status);
  return parts.join(" · ");
}

export default async function ProfilePreviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const [{ data: profile }, specItemsResult, navContext] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "name, headline, bio, interest_categories, interest_industries, skills, school_name, department, academic_year, enrollment_status, is_profile_public"
      )
      .eq("id", user.id)
      .single(),
    supabase
      .from("profile_spec_items")
      .select(
        "id, item_type, title, organization, description, start_date, end_date, is_current, star_role, star_action, star_result, skills, artifacts"
      )
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    resolveNavUserContext(user),
  ]);

  const items = (specItemsResult.data ?? []).map((row) =>
    coerceSpecItem(row as Parameters<typeof coerceSpecItem>[0])
  );
  const interests = normalizeInterestCategories(profile?.interest_categories ?? null);
  const industries = normalizeInterestIndustries(profile?.interest_industries ?? null);
  const skills = normalizeSkills(profile?.skills ?? null);
  const displayName = profile?.name ?? user.email ?? "이름 없음";
  const schoolLine = [profile?.school_name, profile?.department]
    .filter(Boolean)
    .join(" · ");
  const statusLine = enrollmentBadge(
    profile?.enrollment_status ?? null,
    profile?.academic_year ?? null
  );
  const isPublic = Boolean(profile?.is_profile_public);

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
        <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-beige px-3 py-1 text-xs font-bold text-ink/70">
                미리보기
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  isPublic
                    ? "bg-brand/10 text-brand"
                    : "bg-gray-100 text-ink/50"
                }`}
              >
                {isPublic ? "공개 중" : "비공개"}
              </span>
            </div>
            <Link
              href="/mypage"
              className="text-sm font-semibold text-brand hover:text-brand/80"
            >
              프로필로 돌아가기
            </Link>
          </div>

          <ProfilePreview
            name={displayName}
            headline={profile?.headline ?? null}
            bio={profile?.bio ?? null}
            schoolLine={schoolLine}
            statusLine={statusLine}
            interests={interests}
            industries={industries}
            skills={skills}
            items={items}
          />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
