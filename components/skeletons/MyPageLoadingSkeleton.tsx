import NavbarSkeleton from "./NavbarSkeleton";
import { SiteFooterSkeleton, Skeleton } from "./skeleton";

export default function MyPageLoadingSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <NavbarSkeleton />
      <main className="flex-1">
        <div className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
                <div className="min-w-0 space-y-2">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-56 max-w-full" />
                </div>
              </div>
              <Skeleton className="h-10 w-32 shrink-0 self-start rounded-lg sm:self-center" />
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-5 sm:px-6">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-3 h-8 w-full max-w-xl" />
              <Skeleton className="mt-2 h-4 w-full max-w-md" />
            </div>
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="space-y-4 p-4 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-9 w-40 rounded-lg" />
                  <Skeleton className="h-9 w-16 rounded-full" />
                </div>
                <div className="grid grid-cols-7 gap-1 border-b border-gray-100 pb-2 sm:gap-2">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <Skeleton key={i} className="mx-auto h-4 w-6" />
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-2">
                  {Array.from({ length: 14 }).map((_, i) => (
                    <Skeleton key={i} className="min-h-16 rounded-2xl sm:min-h-20" />
                  ))}
                </div>
              </div>
              <div className="border-t border-gray-100 bg-beige p-5 lg:border-l lg:border-t-0">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-2 h-7 w-28" />
                <div className="mt-5 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-2xl" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="bg-beige py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-9 w-full max-w-xs rounded-full sm:max-w-none" />
            </div>
            <Skeleton className="relative mt-6 h-11 w-full max-w-xl rounded-xl" />
            <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
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
