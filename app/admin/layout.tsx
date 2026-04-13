import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, name")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin Sidebar */}
      <div className="flex">
        <aside className="w-64 min-h-screen bg-gray-900 text-white flex flex-col fixed top-0 left-0 z-40">
          <div className="px-6 py-5 border-b border-gray-700">
            <Link href="/admin" className="block">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                관리자 패널
              </p>
              <p className="text-lg font-bold text-white mt-0.5">쿠넥트</p>
            </Link>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1">
            <NavItem href="/admin" label="대시보드" icon={IconDashboard} />
            <NavItem
              href="/admin/scholarships"
              label="장학금 관리"
              icon={IconScholarship}
            />
            <NavItem href="/admin/users" label="유저 관리" icon={IconUsers} />
          </nav>

          <div className="px-6 py-4 border-t border-gray-700">
            <p className="text-xs text-gray-400">로그인 계정</p>
            <p className="text-sm font-medium text-white truncate mt-0.5">
              {profile?.name ?? user.email}
            </p>
            <Link
              href="/"
              className="mt-2 text-xs text-gray-400 hover:text-white transition-colors block"
            >
              ← 사이트로 돌아가기
            </Link>
          </div>
        </aside>

        {/* Main Content */}
        <main className="ml-64 flex-1 p-8 min-h-screen">{children}</main>
      </div>
    </div>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.FC<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors text-sm font-medium"
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </Link>
  );
}

function IconDashboard({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function IconScholarship({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
    </svg>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
