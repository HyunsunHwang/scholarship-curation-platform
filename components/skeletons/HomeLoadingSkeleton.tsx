import { Skeleton } from "./skeleton";

/** 홈 피드 영역만 — 실카드/그림자 없이 pulse 블록으로 전환 깜빡임을 줄인다 */
export function HomeFeedLoadingFallback() {
  return (
    <div
      className="w-full px-4 pb-10 pt-4 sm:px-6 sm:pt-5 lg:px-10"
      aria-busy="true"
      aria-label="홈 불러오는 중"
    >
      <Skeleton className="mb-6 h-48 w-full rounded-2xl sm:h-56 sm:rounded-3xl" />
      <Skeleton className="mb-4 h-7 w-44" />
      <div className="flex gap-3 overflow-hidden sm:gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-[138px] shrink-0 space-y-2 sm:w-44">
            <Skeleton className="aspect-2/3 w-full rounded-xl" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
      <Skeleton className="mb-4 mt-10 h-7 w-36" />
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
