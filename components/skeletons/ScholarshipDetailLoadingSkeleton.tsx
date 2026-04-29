import NavbarSkeleton from "./NavbarSkeleton";
import { SiteFooterSkeleton, Skeleton } from "./skeleton";

export default function ScholarshipDetailLoadingSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <NavbarSkeleton />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center justify-between">
            <Skeleton className="h-5 w-40" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24 rounded-lg" />
              <Skeleton className="h-9 w-24 rounded-lg" />
            </div>
          </div>

          <div className="flex flex-col items-start gap-8 md:flex-row">
            <div className="w-full shrink-0 md:w-56">
              <Skeleton className="aspect-2/3 w-full rounded-2xl" />
              <div className="mt-4 space-y-2">
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <Skeleton className="h-9 w-full max-w-2xl" />
              <Skeleton className="h-5 w-3/4 max-w-md" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-7 w-7 rounded-lg" />
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <div className="mt-5 space-y-0 overflow-hidden rounded-2xl border border-gray-200 divide-y divide-gray-200">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                    <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-5 w-48 max-w-full" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>
            </div>
          </div>
        </div>
      </main>
      <SiteFooterSkeleton />
    </div>
  );
}
