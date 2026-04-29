import NavbarSkeleton from "./NavbarSkeleton";
import { SiteFooterSkeleton, Skeleton } from "./skeleton";

export default function MatchedLoadingSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <NavbarSkeleton />
      <main className="flex-1">
        <div className="border-b border-gray-200 bg-white py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-8 w-72 max-w-full" />
                <Skeleton className="h-4 w-96 max-w-full" />
              </div>
              <div className="flex shrink-0 gap-3">
                <Skeleton className="h-10 w-32 rounded-lg" />
                <Skeleton className="h-10 w-24 rounded-lg" />
              </div>
            </div>
          </div>
        </div>

        <section className="bg-beige py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-5 flex flex-wrap gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-28 rounded-full" />
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-9 w-full max-w-xs rounded-full sm:max-w-none" />
            </div>
            <Skeleton className="relative mt-6 h-11 w-full max-w-xl rounded-xl" />
            <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <Skeleton className="aspect-2/3 w-full rounded-xl sm:rounded-2xl" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooterSkeleton />
    </div>
  );
}
