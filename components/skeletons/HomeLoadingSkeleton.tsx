import { Skeleton } from "./skeleton";

export default function HomeLoadingSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      {/* Airbnb-style top nav */}
      <div className="border-b border-gray-200/80 bg-white">
        <div className="mx-auto flex h-20 max-w-[1760px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
          <Skeleton className="h-12 w-36 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-full" />
        </div>
        <div className="flex justify-center gap-4 pb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <Skeleton className="h-7 w-7 rounded-md" />
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
        <div className="flex justify-center px-4 pb-5">
          <Skeleton className="h-14 w-full max-w-2xl rounded-full" />
        </div>
      </div>

      {/* Feed */}
      <div className="mx-auto w-full max-w-[1760px] px-4 py-8 sm:px-6 lg:px-10">
        <Skeleton className="mb-4 h-7 w-40" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-40 shrink-0 space-y-2 sm:w-44">
              <Skeleton className="aspect-2/3 w-full rounded-xl" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
        <Skeleton className="mb-4 mt-10 h-7 w-32" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-40 shrink-0 space-y-2 sm:w-44">
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
