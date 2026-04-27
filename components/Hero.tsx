import Link from "next/link";

type HeroProps = {
  isLoggedIn: boolean;
};

export default function Hero({ isLoggedIn }: HeroProps) {

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

          {/* ── 우측: 평균 지원금 돋보기 ── */}
          <div className="relative hidden lg:flex lg:justify-center lg:items-center lg:pb-16">
            {/* 장식 이모지 */}
            <div className="absolute -top-4 left-10 text-3xl select-none animate-bounce" style={{ animationDuration: "3s" }}>🎓</div>
            <div className="absolute top-20 -right-2 text-2xl select-none animate-bounce" style={{ animationDuration: "4s", animationDelay: "1s" }}>🌸</div>
            <div className="absolute bottom-16 left-0 text-xl select-none animate-bounce" style={{ animationDuration: "3.5s", animationDelay: "0.5s" }}>⭐</div>

            <div className="flex flex-col items-center gap-5">
              {/* 돋보기 컨테이너 */}
              <div className="relative" style={{ width: 280, height: 320 }}>

                {/* 손잡이 */}
                <div style={{
                  position: "absolute",
                  bottom: 0,
                  right: 62,
                  width: 26,
                  height: 100,
                  borderRadius: 13,
                  transform: "rotate(38deg)",
                  transformOrigin: "top center",
                  background: "linear-gradient(160deg, #cdeefa 0%, #8ec9e4 60%, #76b8d6 100%)",
                  boxShadow: "inset 3px 0 6px rgba(255,255,255,0.55), inset -2px 0 4px rgba(0,0,0,0.12), 0 6px 20px rgba(142,201,228,0.45)",
                }} />

                {/* 외부 링 (3D 효과) */}
                <div style={{
                  position: "absolute",
                  top: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 260,
                  height: 260,
                  borderRadius: "50%",
                  background: "linear-gradient(145deg, #ddf3fd 0%, #b3e4fb 45%, #8ec9e4 100%)",
                  boxShadow: [
                    "0 28px 70px rgba(142,201,228,0.55)",
                    "0 8px 20px rgba(100,170,200,0.3)",
                    "inset 0 6px 14px rgba(255,255,255,0.75)",
                    "inset 0 -8px 18px rgba(80,150,180,0.25)",
                  ].join(", "),
                }} />

                {/* 렌즈 내부 */}
                <div style={{
                  position: "absolute",
                  top: 22,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 216,
                  height: 216,
                  borderRadius: "50%",
                  overflow: "hidden",
                  background: "linear-gradient(160deg, #fdf6ec 0%, #f5e9d8 100%)",
                }}>
                  {/* 버블 (아래쪽) */}
                  <div style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "flex-end", gap: 5 }}>
                    {[{ w: 38, h: 38 }, { w: 26, h: 26 }, { w: 44, h: 44 }, { w: 22, h: 22 }, { w: 34, h: 34 }].map((b, i) => (
                      <div key={i} style={{ width: b.w, height: b.h, borderRadius: "50%", background: "rgba(179,228,251,0.68)", boxShadow: "inset 0 2px 4px rgba(255,255,255,0.6)" }} />
                    ))}
                  </div>
                  {/* 작은 보조 버블 */}
                  <div style={{ position: "absolute", bottom: 52, left: 18, display: "flex", gap: 4 }}>
                    {[14, 10, 16].map((s, i) => (
                      <div key={i} style={{ width: s, height: s, borderRadius: "50%", background: "rgba(254,162,118,0.38)" }} />
                    ))}
                  </div>

                  {/* 텍스트 카드 (기울어짐) */}
                  <div style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -54%) rotate(-9deg)",
                    width: "83%",
                    background: "linear-gradient(145deg, #3e2418 0%, #56352c 100%)",
                    borderRadius: 16,
                    padding: "18px 14px 14px",
                    textAlign: "center",
                    boxShadow: "0 10px 28px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
                  }}>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 2, letterSpacing: "0.05em" }}>평균</p>
                    <p style={{ fontSize: 34, fontWeight: 900, color: "#fff", lineHeight: 1.1, letterSpacing: "-0.02em" }}>300만원</p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", marginTop: 5 }}>장학금 지원 혜택*</p>
                  </div>
                </div>

                {/* 렌즈 상단 하이라이트 반사 */}
                <div style={{
                  position: "absolute",
                  top: 34,
                  left: "calc(50% - 44px)",
                  width: 76,
                  height: 32,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.52)",
                  filter: "blur(7px)",
                  transform: "rotate(-18deg)",
                  pointerEvents: "none",
                }} />
              </div>

              {/* 소각주 */}
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
