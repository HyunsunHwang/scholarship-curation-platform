import Link from "next/link";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/95 backdrop-blur supports-backdrop-filter:bg-white/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <span className="text-sm font-bold text-white">K</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-gray-900">
            쿠넥트
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="#scholarships"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
          >
            장학금 둘러보기
          </Link>
          <Link
            href="#"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
          >
            이용 방법
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/auth"
            className="inline-flex h-7 items-center rounded-lg px-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            로그인
          </Link>
          <Link
            href="/auth"
            className="inline-flex h-7 items-center rounded-lg bg-indigo-600 px-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            회원가입
          </Link>
        </div>
      </div>
    </header>
  );
}
