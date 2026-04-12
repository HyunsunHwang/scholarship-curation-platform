import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import ScholarshipDashboard from "@/components/ScholarshipDashboard";
import { createClient } from "@/lib/supabase/server";

async function SupabaseStatusBanner() {
  let status: "success" | "error" = "error";
  let message = "";
  let detail = "";

  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true });

    if (error) {
      message = "Supabase 연결 실패";
      detail = error.message;
    } else {
      status = "success";
      message = "Supabase 연결 성공";
      detail = `profiles 테이블 접근 확인 (현재 행 수: ${count ?? 0})`;
    }
  } catch (e) {
    message = "Supabase 연결 실패";
    detail = e instanceof Error ? e.message : "알 수 없는 오류";
  }

  return (
    <div
      className={`mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8`}
    >
      <div
        className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
          status === "success"
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-red-200 bg-red-50 text-red-800"
        }`}
      >
        <span className="mt-0.5 text-base leading-none">
          {status === "success" ? "✅" : "❌"}
        </span>
        <div>
          <p className="font-semibold">{message}</p>
          <p className="mt-0.5 text-xs opacity-80">{detail}</p>
        </div>
      </div>
    </div>
  );
}

export default async function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <SupabaseStatusBanner />
        <Hero />
        <ScholarshipDashboard />
      </main>
      <footer className="border-t border-gray-100 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-indigo-600">
                <span className="text-xs font-bold text-white">K</span>
              </div>
              <span className="text-sm font-semibold text-gray-700">
                쿠넥트
              </span>
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
