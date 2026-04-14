import Link from "next/link";

type HeroProps = {
  scholarshipCount: number;
  totalAmountMan: number; // 만원 단위 합계
  isLoggedIn: boolean;
};

export default function Hero({ scholarshipCount, totalAmountMan, isLoggedIn }: HeroProps) {
  const totalDisplay =
    totalAmountMan >= 10000
      ? `${(totalAmountMan / 10000).toFixed(0)}억+`
      : `${totalAmountMan.toLocaleString()}만+`;

  return (
    <section className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-indigo-600">
            장학금 큐레이션 플랫폼
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            나에게 딱 맞는
            <br />
            <span className="text-indigo-600">장학금</span>을 찾아드립니다
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            복잡한 장학금 정보를 한 곳에서 확인하세요.
            <br />
            내 조건을 입력하면 지금 바로 신청 가능한 장학금을 안내해드립니다.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href={isLoggedIn ? "/matched" : "/auth"}
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-indigo-600 px-8 text-sm font-medium text-white transition-colors hover:bg-indigo-700 sm:w-auto"
            >
              내 장학금 찾기
            </Link>
            <Link
              href="#scholarships"
              className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-8 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:w-auto"
            >
              전체 보기
            </Link>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-3 gap-8 border-t border-gray-100 pt-10">
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">
              {scholarshipCount > 0 ? `${scholarshipCount}+` : "—"}
            </p>
            <p className="mt-1 text-sm text-gray-500">등록된 장학금</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">
              {totalAmountMan > 0 ? totalDisplay : "—"}
            </p>
            <p className="mt-1 text-sm text-gray-500">총 장학금 규모</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">매일</p>
            <p className="mt-1 text-sm text-gray-500">업데이트</p>
          </div>
        </div>
      </div>
    </section>
  );
}
