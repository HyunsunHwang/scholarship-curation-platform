import Link from "next/link";

type HeroProps = {
  scholarshipCount: number;
  totalAmountMan: number;
  isLoggedIn: boolean;
};

export default function Hero({ scholarshipCount, totalAmountMan, isLoggedIn }: HeroProps) {
  const totalDisplay =
    totalAmountMan >= 10000
      ? `${(totalAmountMan / 10000).toFixed(0)}억+`
      : `${totalAmountMan.toLocaleString()}만+`;

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

          {/* ── 우측: 추천 카드 목업 ── */}
          <div className="relative hidden lg:flex lg:justify-center lg:pb-10">
            {/* 장식 */}
            <div className="absolute -top-4 left-10 text-3xl select-none animate-bounce" style={{ animationDuration: "3s" }}>🎓</div>
            <div className="absolute top-16 -right-2 text-2xl select-none animate-bounce" style={{ animationDuration: "4s", animationDelay: "1s" }}>🌸</div>
            <div className="absolute bottom-8 left-4 text-xl select-none animate-bounce" style={{ animationDuration: "3.5s", animationDelay: "0.5s" }}>⭐</div>

            {/* 카드 */}
            <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl shadow-[#fea276]/20 border border-[#e8d9c8]">
              <div className="mb-4">
                <p className="text-base font-bold text-ink">안녕하세요! 👋</p>
                <p className="mt-0.5 text-xs text-ink/50">당신에게 추천하는 장학금이에요.</p>
              </div>

              <div className="flex flex-col gap-3">
                {[
                  { icon: "🎓", name: "미래 인재 장학금", amount: "500만원", d: "D-15", pct: 95, color: "text-emerald-700 bg-emerald-50" },
                  { icon: "🌸", name: "꿈나무 장학금",   amount: "300만원", d: "D-7",  pct: 90, color: "text-brand bg-[#fff2df]" },
                  { icon: "⭐", name: "지역 인재 장학금", amount: "400만원", d: "D-20", pct: 85, color: "text-ink bg-skyblue/40" },
                ].map((item) => (
                  <div key={item.name} className="flex items-center justify-between rounded-xl bg-[#fff2df] px-3.5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{item.icon}</span>
                      <div>
                        <p className="text-xs font-semibold text-ink">{item.name}</p>
                        <p className="text-[11px] text-ink/50">{item.amount} · {item.d}</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.color}`}>
                      추천도 {item.pct}%
                    </span>
                  </div>
                ))}
              </div>

              {/* 브랜드 아이콘 */}
              <div className="absolute -bottom-5 -right-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-2xl shadow-lg shadow-brand/30">
                🤖
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 통계 바 ── */}
      <div className="mt-4 border-t border-[#e8d9c8]/60 bg-white/60 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-3 divide-x divide-[#e8d9c8] py-6">
            <div className="flex flex-col items-center gap-0.5 px-4 text-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fbeca8] text-lg">📄</div>
              <p className="mt-1.5 text-2xl font-extrabold text-ink">
                {scholarshipCount > 0 ? `${scholarshipCount}+` : "—"}
              </p>
              <p className="text-xs text-ink/60">등록된 장학금</p>
              <p className="text-[10px] text-ink/40">다양한 장학금을 한 곳에서</p>
            </div>
            <div className="flex flex-col items-center gap-0.5 px-4 text-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fea276]/30 text-lg">💰</div>
              <p className="mt-1.5 text-2xl font-extrabold text-ink">
                {totalAmountMan > 0 ? totalDisplay : "—"}
              </p>
              <p className="text-xs text-ink/60">총 장학금 규모</p>
              <p className="text-[10px] text-ink/40">더 많은 기회, 더 큰 꿈을 위해</p>
            </div>
            <div className="flex flex-col items-center gap-0.5 px-4 text-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-skyblue/40 text-lg">🔄</div>
              <p className="mt-1.5 text-2xl font-extrabold text-ink">매일</p>
              <p className="text-xs text-ink/60">새로운 장학금 업데이트</p>
              <p className="text-[10px] text-ink/40">놓치지 않고 최신 정보를 받아보세요</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
