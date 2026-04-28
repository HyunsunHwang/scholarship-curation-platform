import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { createClient } from "@/lib/supabase/server";

const nav = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/scholarships", label: "장학금 관리" },
  { href: "/admin/site-settings", label: "사이트 설정" },
];

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
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden md:block mt-auto p-4 border-t border-gray-100 text-xs text-gray-500">
          <p className="font-medium text-gray-700">{displayName}</p>
          <Link
            href="/"
            className="inline-block mt-2 text-brand hover:underline"
          >
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
