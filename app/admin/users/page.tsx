import { createClient } from "@/lib/supabase/server";
import { UserRoleButton } from "./UserRoleButton";

export default async function AdminUsersPage() {
  const supabase = await createClient();

  const { data: { user: currentUser } } = await supabase.auth.getUser();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, name, role, is_onboarded, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="text-red-600 text-sm p-4 bg-red-50 rounded-lg">
        데이터를 불러오는 중 오류가 발생했습니다: {error.message}
      </div>
    );
  }

  const totalCount = profiles?.length ?? 0;
  const adminCount = profiles?.filter((p) => p.role === "admin").length ?? 0;
  const onboardedCount = profiles?.filter((p) => p.is_onboarded).length ?? 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">유저 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          총 {totalCount}명 · 관리자 {adminCount}명 · 온보딩 완료 {onboardedCount}명
        </p>
      </div>

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
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(profile.created_at).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isSelf ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : (
                        <UserRoleButton
                          userId={profile.id}
                          currentRole={profile.role}
                          targetUserEmail={profile.email}
                        />
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                  가입한 유저가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
