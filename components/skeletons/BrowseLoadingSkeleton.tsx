import { Skeleton } from "./skeleton";

/** /browse 탐색 허브·목록 전환 시 즉시 보이는 스켈레톤 */
export default function BrowseLoadingSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <div className="border-b border-gray-200/80 bg-white">
        <div className="mx-auto flex h-16 max-w-[1760px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Skeleton className="mb-5 h-8 w-40 sm:mb-6 sm:h-9" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className="aspect-5/3 w-full rounded-xl sm:aspect-2/1"
            />
          ))}
        </div>
      </main>
    </div>
  );
}
