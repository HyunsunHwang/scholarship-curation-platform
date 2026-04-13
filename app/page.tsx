import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import ScholarshipDashboard from "@/components/ScholarshipDashboard";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
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
