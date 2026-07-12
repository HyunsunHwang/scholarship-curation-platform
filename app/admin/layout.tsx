import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { createClient } from "@/lib/supabase/server";

/** AI 초안 생성은 LLM 호출이라 Vercel 기본 타임아웃보다 길 수 있음 */
export const maxDuration = 60;

const opsNav = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/review", label: "검수 큐" },
  { href: "/admin/content", label: "콘텐츠" },
] as const;

const systemNav = [
  { href: "/admin/users", label: "사용자" },
  { href: "/admin/settings", label: "설정" },
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let displayName = user?.email ?? "";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .single();
    displayName = profile?.name ?? user.email ?? "";
  }

  const [{ count: scholarshipReviewCount }, { count: contestReviewCount }] =
    await Promise.all([
      supabase
        .from("crawled_notices")
        .select("id", { count: "exact", head: true })
        .eq("status", "new"),
      supabase
        .from("crawled_contests")
        .select("id", { count: "exact", head: true })
        .eq("status", "new"),
    ]);

  const reviewBadge = (scholarshipReviewCount ?? 0) + (contestReviewCount ?? 0);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      <aside className="shrink-0 border-b md:border-b-0 md:border-r border-gray-200 bg-white md:w-56 md:min-h-screen md:flex md:flex-col">
        <div className="p-4 border-b border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            관리자 패널
          </p>
          <p className="text-lg font-bold text-gray-900 mt-0.5">장학쌤</p>
        </div>

        <nav className="p-2 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible md:flex-1">
          <p className="hidden md:block px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            운영
          </p>
          {opsNav.map((item) => (
            <AdminNavLink
              key={item.href}
              href={item.href}
              label={item.label}
              badge={item.href === "/admin/review" ? reviewBadge : undefined}
            />
          ))}

          <p className="hidden md:block px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            시스템
          </p>
          {systemNav.map((item) => (
            <AdminNavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>

        <div className="hidden md:block mt-auto p-4 border-t border-gray-100 text-xs text-gray-500">
          <p className="font-medium text-gray-700">{displayName}</p>
          <Link href="/" className="inline-block mt-2 text-brand hover:underline">
            ← 사이트로 돌아가기
          </Link>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

function AdminNavLink({
  href,
  label,
  badge,
}: {
  href: string;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors inline-flex items-center gap-2"
    >
      <span>{label}</span>
      {typeof badge === "number" && badge > 0 ? (
        <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}
