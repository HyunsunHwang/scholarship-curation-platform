import Link from "next/link";

type HeroProps = {
  isLoggedIn: boolean;
};

export default function Hero({ isLoggedIn }: HeroProps) {

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#fff2df] via-[#fbeca8]/60 to-[#fea276]/30 pt-16 pb-0">
      {/* 배경 장식 원 */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-[#fea276]/20 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 -left-16 h-64 w-64 rounded-full bg-[#b3e4fb]/25 blur-3xl" />

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
                className="inline-flex h-12 items-center rounded-xl border border-[#e8d9c8] bg-white px-7 text-sm font-semibold text-ink shadow-sm transition hover:bg-[#fbeca8]/50 active:scale-95"
              >
                전체 보기
              </Link>
            </div>

            {/* 소셜 프루프 */}
            <div className="mt-8 flex items-center gap-3">
              <div className="flex -space-x-2">
                {["bg-brand", "bg-peach", "bg-[#fbeca8]", "bg-skyblue"].map((c, i) => (
                  <div
                    key={i}
                    className={`h-8 w-8 rounded-full border-2 border-white ${c} flex items-center justify-center text-xs font-bold ${c === "bg-[#fbeca8]" ? "text-ink" : "text-white"}`}
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

          {/* ── 우측: 평균 지원금 돋보기 ── */}
          <div className="relative hidden lg:flex lg:justify-center lg:pb-10">
            {/* 장식 이모지 */}
            <div className="absolute -top-4 left-10 text-3xl select-none animate-bounce" style={{ animationDuration: "3s" }}>🎓</div>
            <div className="absolute top-16 -right-2 text-2xl select-none animate-bounce" style={{ animationDuration: "4s", animationDelay: "1s" }}>🌸</div>
            <div className="absolute bottom-8 left-4 text-xl select-none animate-bounce" style={{ animationDuration: "3.5s", animationDelay: "0.5s" }}>⭐</div>

            <div className="flex flex-col items-center gap-6">
              {/* 돋보기 */}
              <div className="relative flex items-center justify-center">
                {/* 손잡이 */}
                <div
                  className="absolute z-0 h-[56px] w-[22px] rounded-full bg-[#56352c]/80"
                  style={{ bottom: "-36px", right: "30px", transform: "rotate(40deg)", transformOrigin: "top center" }}
                />
                {/* 렌즈 원 */}
                <div className="relative z-10 flex h-56 w-56 flex-col items-center justify-center rounded-full bg-ink shadow-2xl overflow-hidden">
                  {/* 장식 원들 */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 opacity-30">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-7 w-7 rounded-full bg-white/60" />
                    ))}
                  </div>
                  {/* 텍스트 */}
                  <p className="relative z-10 text-sm font-medium text-white/70">평균</p>
                  <p className="relative z-10 text-3xl font-extrabold tracking-tight text-white leading-tight">
                    300만원
                  </p>
                  <p className="relative z-10 mt-1 text-[11px] text-white/50">장학금 지원 혜택*</p>
                </div>
              </div>

              {/* 안내 문구 */}
              <p className="text-center text-xs text-ink/40 leading-relaxed">
                *플랫폼 등록 장학금 기준 평균 지원 금액
              </p>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
