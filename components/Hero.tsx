import Image from "next/image";
import Link from "next/link";

type HeroProps = {
  heroIllustrationUrl: string;
};

export default function Hero({ heroIllustrationUrl }: HeroProps) {

  return (
    <section className="relative overflow-hidden bg-white pt-12 pb-0 lg:pt-14">
      {/* 배경 장식 원 */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-brand/8 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 -left-16 h-64 w-64 rounded-full bg-brand/5 blur-3xl" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-6">

          {/* ── 좌측: 텍스트 ── */}
          <div className="pb-10 sm:pb-14 lg:pb-16">
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
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/matched"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-brand px-7 text-sm font-semibold text-white shadow-md shadow-brand/25 transition hover:bg-brand/85 active:scale-95"
              >
                내 장학금 찾기
              </Link>
              <Link
                href="#scholarships"
                className="inline-flex h-12 items-center rounded-xl border border-gray-200 bg-white px-7 text-sm font-semibold text-ink shadow-sm transition hover:bg-cream active:scale-95"
              >
                전체 보기
              </Link>
            </div>

          </div>

          {/* ── 우측: Storage `reading_glasses_red.png` ── */}
          <div className="relative hidden lg:flex lg:items-center lg:justify-center lg:pb-8">
            <div className="flex w-full max-w-[15.5rem] flex-col items-center xl:max-w-[17.5rem]">
              <div className="relative w-full">
                <Image
                  src={heroIllustrationUrl}
                  alt="장학금 안내 일러스트"
                  width={420}
                  height={420}
                  priority
                  className="h-auto w-full object-contain drop-shadow-[0_10px_28px_rgba(192,0,0,0.05)]"
                  sizes="(min-width: 1280px) 17.5rem, (min-width: 1024px) 15.5rem, 0"
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
