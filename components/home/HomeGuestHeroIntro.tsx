import Link from "next/link";

/**
 * 비로그인 홈 히어로 왼쪽 슬롯.
 * 카피·CTA는 마케팅 인트로, 높이는 로그인 대시보드 footprint에 맞춤.
 */
export default function HomeGuestHeroIntro() {
  return (
    <div className="relative z-10 flex w-full shrink-0 flex-col justify-between animate-in fade-in slide-in-from-bottom-2 duration-500 lg:max-w-md lg:min-h-[calc(2rem+0.5rem+1.25rem+1rem+2*4.5rem+0.625rem)] lg:self-end xl:max-w-lg">
      <div className="pointer-events-none absolute -left-6 -top-8 h-32 w-32 rounded-full bg-brand/8 blur-3xl" />
      <div className="pointer-events-none absolute right-4 top-2 h-28 w-28 rounded-full bg-peach/10 blur-3xl" />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-2 left-8 h-20 w-40 rounded-full bg-skyblue/40 blur-3xl"
      />

      <div>
        <p className="mb-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] text-brand/80 sm:mb-3 sm:text-xs">
          <span aria-hidden className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/35 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
          </span>
          이루리 · CAREER FOR YOU
        </p>

        <h2
          id="home-hero-intro-heading"
          className="text-[1.65rem] font-extrabold leading-[1.3] tracking-tight text-ink sm:text-[1.95rem] md:text-[2.15rem]"
        >
          나에게{" "}
          <span className="relative inline-block">
            <span className="bg-linear-to-r from-ink via-ink to-brand bg-clip-text text-transparent">
              꼭 맞는
            </span>
            <span
              aria-hidden
              className="absolute -bottom-0.5 left-0 right-0 h-1.5 rounded-full bg-brand/15"
            />
          </span>
          <br />
          커리어 정보를 한눈에
        </h2>

        <p className="mt-3 max-w-[22rem] text-[13px] font-medium leading-relaxed text-ink/60 sm:mt-3.5 sm:max-w-none sm:text-sm">
          교내 장학금, 대외활동부터 채용까지 내 프로필 기반{" "}
          <span className="font-semibold text-ink/80">맞춤 추천</span>
        </p>
      </div>

      <div className="pt-2">
        <div
          aria-hidden
          className="mb-4 h-px w-16 bg-linear-to-r from-brand/35 to-transparent sm:mb-5"
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <Link
            href="/matched"
            className="group inline-flex items-center gap-1.5 rounded-full bg-peach px-5 py-2.5 text-sm font-bold text-white shadow-[0_10px_28px_-14px_rgba(128,25,222,0.55)] transition hover:bg-peach/85 hover:shadow-[0_14px_32px_-12px_rgba(128,25,222,0.65)] active:scale-[0.98] sm:px-6 sm:py-3"
          >
            내 공고 보러가기
            <svg
              className="h-4 w-4 transition group-hover:translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.4}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>
          <Link
            href="/auth"
            className="group inline-flex items-center gap-1 text-[13px] font-semibold text-ink/60 transition hover:text-brand sm:text-sm"
          >
            로그인하고 더 정확하게
            <svg
              className="h-3.5 w-3.5 text-ink/35 transition group-hover:translate-x-0.5 group-hover:text-brand"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.2}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m8.25 4.5 7.5 7.5-7.5 7.5"
              />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
