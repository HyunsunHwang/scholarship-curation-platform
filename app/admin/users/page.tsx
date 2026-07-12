import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UserRoleButton } from "./UserRoleButton";

const PAGE_SIZE = 40;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; q?: string }>;
}) {
  const resolved = (await searchParams) ?? {};
  const query = (resolved.q ?? "").trim();
  const pageFromQuery = Number.parseInt(resolved.page ?? "1", 10);
  const currentPage =
    Number.isFinite(pageFromQuery) && pageFromQuery > 0 ? pageFromQuery : 1;
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  let profilesQuery = supabase
    .from("profiles")
    .select("id, email, name, role, is_onboarded, created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (query) {
    const escaped = query.replace(/[%_]/g, "\\$&");
    profilesQuery = profilesQuery.or(
      `name.ilike.%${escaped}%,email.ilike.%${escaped}%`
    );
  }

  const { data: profiles, error, count } = await profilesQuery.range(from, to);

  if (error) {
    return (
      <div className="text-red-600 text-sm p-4 bg-red-50 rounded-lg">
        데이터를 불러오는 중 오류가 발생했습니다: {error.message}
      </div>
    );
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasNextPage = currentPage < totalPages;
  const adminCount = (profiles ?? []).filter((p) => p.role === "admin").length;
  const onboardedCount = (profiles ?? []).filter((p) => p.is_onboarded).length;

  function href(page: number) {
    const qs = new URLSearchParams();
    if (page > 1) qs.set("page", String(page));
    if (query) qs.set("q", query);
    const s = qs.toString();
    return `/admin/users${s ? `?${s}` : ""}`;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">사용자</h1>
        <p className="text-sm text-gray-500 mt-1">
          총 {totalCount}명 · 이 페이지 관리자 {adminCount}명 · 온보딩 완료 {onboardedCount}명
        </p>
      </div>

      <form method="get" action="/admin/users" className="mb-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="이름 또는 이메일 검색"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          검색
        </button>
      </form>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">이름 / 이메일</th>
              <th className="px-4 py-3">역할</th>
              <th className="px-4 py-3">온보딩</th>
              <th className="px-4 py-3">가입일</th>
              <th className="px-4 py-3 text-right">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {profiles && profiles.length > 0 ? (
              profiles.map((profile) => {
                const isSelf = profile.id === currentUser?.id;
                return (
                  <tr key={profile.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">
                        {profile.name ?? "—"}
                        {isSelf && (
                          <span className="ml-2 text-xs text-gray-400">(나)</span>
                        )}
                      </p>
                      <p className="text-gray-500 text-xs">{profile.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          profile.role === "admin"
                            ? "bg-violet-100 text-violet-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {profile.role === "admin" ? "관리자" : "일반 유저"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          profile.is_onboarded
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {profile.is_onboarded ? "완료" : "미완료"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {profile.created_at
                        ? new Date(profile.created_at).toLocaleDateString("ko-KR")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isSelf && (
                        <UserRoleButton
                          userId={profile.id}
                          currentRole={profile.role}
                          targetUserEmail={profile.email ?? profile.name ?? profile.id}
                        />
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                  사용자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex items-center justify-between text-sm">
        <Link
          href={href(Math.max(1, currentPage - 1))}
          aria-disabled={currentPage <= 1}
          className={`rounded-lg border px-3 py-1.5 ${
            currentPage <= 1
              ? "pointer-events-none border-gray-200 text-gray-300"
              : "border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          이전
        </Link>
        <span className="text-gray-600">
          페이지 {currentPage} / {totalPages}
        </span>
        <Link
          href={href(currentPage + 1)}
          aria-disabled={!hasNextPage}
          className={`rounded-lg border px-3 py-1.5 ${
            !hasNextPage
              ? "pointer-events-none border-gray-200 text-gray-300"
              : "border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          다음
        </Link>
      </div>
    </div>
  );
}
