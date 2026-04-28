import Image from "next/image";
import Link from "next/link";

type HeroProps = {
  heroIllustrationUrl: string;
  isLoggedIn: boolean;
};

export default function Hero({ heroIllustrationUrl, isLoggedIn }: HeroProps) {

  return (
    <section className="relative overflow-hidden bg-white pt-16 pb-0">
      {/* 배경 장식 원 */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-brand/8 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 -left-16 h-64 w-64 rounded-full bg-brand/5 blur-3xl" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8">

          {/* ── 좌측: 텍스트 ── */}
          <div className="pb-16 sm:pb-20 lg:pb-24">
            {/* 뱃지 */}
            <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-[#fea276]/60 bg-white/70 px-3.5 py-1.5 text-sm font-semibold text-brand shadow-sm backdrop-blur-sm">
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1l1.5 4.5H14l-3.75 2.75 1.5 4.5L8 10l-3.75 2.75 1.5-4.5L2 5.5h4.5L8 1z" />
              </svg>
              AI 맞춤 추천
            </div>

            {/* 제목 */}
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-ink sm:text-5xl lg:text-5xl">
              나에게 딱 맞는
              <br />
              <span className="text-brand">장학금</span>을 찾아드릴게요
            </h1>

            {/* 부제 */}
            <p className="mt-5 text-base leading-relaxed text-ink/60 sm:text-lg">
              AI가 당신의 조건과 관심사를 분석해
              <br className="hidden sm:block" />
              지금 지원 가능한 장학금을 추천해드려요.
            </p>

            {/* CTA 버튼 */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={isLoggedIn ? "/matched" : "/auth"}
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-7 text-sm font-semibold text-white shadow-md shadow-brand/25 transition hover:bg-brand/85 active:scale-95"
              >
                내 장학금 찾기
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1l1.5 4.5H14l-3.75 2.75 1.5 4.5L8 10l-3.75 2.75 1.5-4.5L2 5.5h4.5L8 1z" />
                </svg>
              </Link>
              <Link
                href="#scholarships"
                className="inline-flex h-12 items-center rounded-xl border border-gray-200 bg-white px-7 text-sm font-semibold text-ink shadow-sm transition hover:bg-[#fff0f0] active:scale-95"
              >
                전체 보기
              </Link>
            </div>

            {/* 소셜 프루프 */}
            <div className="mt-8 flex items-center gap-3">
              <div className="flex -space-x-2">
                {["bg-brand", "bg-[#c00000]", "bg-[#ff6060]", "bg-[#ff9090]"].map((c, i) => (
                  <div
                    key={i}
                    className={`h-8 w-8 rounded-full border-2 border-white ${c} flex items-center justify-center text-xs font-bold text-white`}
                  >
                    {["김", "이", "박", "최"][i]}
                  </div>
                ))}
              </div>
              <p className="text-sm text-ink/60">
                <span className="font-semibold text-ink">1,000+</span> 명의 학생들이 찾았어요!
              </p>
            </div>
          </div>

          {/* ── 우측: Storage `reading_glasses_red.png` ── */}
          <div className="relative hidden lg:flex lg:justify-center lg:items-center lg:pb-16">
            <div className="flex w-full max-w-md flex-col items-center xl:max-w-lg">
              <div className="relative w-full">
                <Image
                  src={heroIllustrationUrl}
                  alt="장학금 안내 일러스트"
                  width={640}
                  height={640}
                  className="h-auto w-full object-contain drop-shadow-[0_16px_40px_rgba(192,0,0,0.06)]"
                  priority
                  sizes="(min-width: 1280px) 28rem, (min-width: 1024px) 24rem, 0"
                />
              </div>
              <p className="mt-3 max-w-sm text-center text-xs leading-relaxed text-ink/40">
                *플랫폼 등록 장학금 기준 평균 지원 금액
              </p>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
