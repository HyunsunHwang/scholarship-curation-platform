import { Skeleton } from "./skeleton";

export default function HomeLoadingSkeleton() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-beige">
      {/* Top nav */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-200/80 bg-white px-3 sm:h-16 sm:px-4">
        <Skeleton className="h-9 w-28 rounded-lg sm:h-11 sm:w-36" />
        <Skeleton className="h-9 w-9 rounded-full sm:h-10 sm:w-10" />
        <Skeleton className="mx-auto h-10 w-full max-w-xl rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full sm:h-9 sm:w-24" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 sm:p-2.5 lg:flex-row">
        {/* Library sidebar */}
        <div className="flex h-[min(42vh,22rem)] shrink-0 flex-col rounded-2xl bg-white p-4 lg:h-auto lg:w-[280px] xl:w-[320px]">
          <Skeleton className="h-5 w-28" />
          <div className="mt-3 flex gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-14 rounded-full" />
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Feed */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-white p-4 sm:p-5">
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-16 rounded-full" />
            ))}
          </div>
          <Skeleton className="mt-6 h-7 w-40" />
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-2/3 w-full rounded-xl" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-10 h-7 w-32" />
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-2/3 w-full rounded-xl" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
