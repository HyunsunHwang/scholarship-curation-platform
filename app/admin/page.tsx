import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [{ count: scholarshipCount }, { count: userCount }, { count: adminCount }] =
    await Promise.all([
      supabase.from("scholarships").select("*", { count: "exact", head: true }),
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin"),
    ]);

  const stats = [
    {
      label: "총 장학금 수",
      value: scholarshipCount ?? 0,
      href: "/admin/scholarships",
      color: "bg-blue-50 text-blue-600",
      iconBg: "bg-blue-100",
    },
    {
      label: "가입 유저 수",
      value: userCount ?? 0,
      href: "/admin/users",
      color: "bg-emerald-50 text-emerald-600",
      iconBg: "bg-emerald-100",
    },
    {
      label: "관리자 수",
      value: adminCount ?? 0,
      href: "/admin/users",
      color: "bg-violet-50 text-violet-600",
      iconBg: "bg-violet-100",
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <p className="text-sm text-gray-500 mt-1">쿠넥트 관리자 패널에 오신 것을 환영합니다.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-10">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <p className="text-sm font-medium text-gray-500">{s.label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {s.value.toLocaleString()}
            </p>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">빠른 작업</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/scholarships/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            장학금 추가
          </Link>
          <Link
            href="/admin/scholarships"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            장학금 목록 보기
          </Link>
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            유저 관리
          </Link>
        </div>
      </div>
    </div>
  );
}
