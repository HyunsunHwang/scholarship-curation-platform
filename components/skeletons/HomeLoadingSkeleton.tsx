import { Skeleton } from "./skeleton";

/** 홈 개인화 선반(이어서 보기 등) 자리 표시용 — 공개 쉘은 이미 그려진 뒤 */
export function HomePersonalizationShelfFallback() {
  return (
    <div className="mt-2 mb-6" aria-busy="true" aria-label="추천 불러오는 중">
      <Skeleton className="mb-4 h-7 w-40" />
      <div className="flex gap-3 overflow-hidden sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-[138px] shrink-0 space-y-2 sm:w-44">
            <Skeleton className="aspect-2/3 w-full rounded-xl" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 홈 피드 영역만 — 실카드/그림자 없이 pulse 블록으로 전환 깜빡임을 줄인다 */
export function HomeFeedLoadingFallback() {
  return (
    <div className="w-full" aria-busy="true" aria-label="홈 불러오는 중">
      <div className="relative mb-6 min-h-[280px] sm:mb-8 sm:min-h-[320px] lg:min-h-[360px]">
        <Skeleton className="absolute inset-0 rounded-none" />
        <div className="relative mx-auto flex h-full min-h-[280px] max-w-6xl flex-col justify-end px-4 pb-5 pt-12 sm:min-h-[320px] sm:px-6 sm:pb-6 md:px-10 lg:min-h-[360px]">
          <div className="mb-4 ml-auto w-full max-w-[min(100%,calc(5*92px+4*0.625rem))] space-y-2 sm:max-w-[calc(5*108px+4*0.75rem)]">
            <Skeleton className="ml-auto h-6 w-28 rounded-full" />
            <Skeleton className="ml-auto h-8 w-40" />
            <Skeleton className="ml-auto h-4 w-48" />
          </div>
          <div className="ml-auto flex w-full max-w-[min(100%,calc(5*92px+4*0.625rem))] gap-2.5 overflow-hidden sm:max-w-[calc(5*108px+4*0.75rem)] sm:gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-[92px] shrink-0 space-y-1.5 sm:w-[108px]">
                <Skeleton className="aspect-2/3 w-full rounded-lg" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full px-4 pb-10 pt-4 sm:px-6 sm:pt-5 lg:px-10">
        <Skeleton className="mb-4 h-7 w-36" />
        <div className="flex gap-3 overflow-hidden sm:gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-[138px] shrink-0 space-y-2 sm:w-44">
              <Skeleton className="aspect-2/3 w-full rounded-xl" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomeLoadingSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      {/* 현재 AirbnbHeader와 맞춘 컴팩트 상단바 — 옛 카테고리 아이콘 행 제거 */}
      <div className="border-b border-gray-200/80 bg-white">
        <div className="mx-auto flex h-14 max-w-[1760px] items-center gap-2 pl-1 pr-3 sm:h-[60px] sm:gap-3 sm:pl-2 sm:pr-6 lg:pl-3 lg:pr-10">
          <Skeleton className="h-10 w-28 shrink-0 rounded-lg sm:h-12 sm:w-36" />
          <div className="hidden gap-1 md:flex">
            <Skeleton className="h-8 w-14 rounded-full" />
            <Skeleton className="h-8 w-14 rounded-full" />
            <Skeleton className="h-8 w-14 rounded-full" />
          </div>
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
            <Skeleton className="h-9 w-full max-w-42 rounded-full sm:max-w-md" />
            <Skeleton className="h-9 w-16 shrink-0 rounded-full" />
          </div>
        </div>
      </div>

      <div className="flex-1">
        <HomeFeedLoadingFallback />
      </div>

      <footer className="shrink-0 border-t border-gray-200/80 bg-white px-4 py-2.5">
        <Skeleton className="mx-auto h-3 w-48" />
      </footer>
    </div>
  );
}
