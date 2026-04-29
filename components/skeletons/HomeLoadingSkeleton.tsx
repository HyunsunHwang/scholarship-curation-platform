import NavbarSkeleton from "./NavbarSkeleton";
import { SiteFooterSkeleton, Skeleton } from "./skeleton";

export default function HomeLoadingSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      <NavbarSkeleton />
      <main className="flex-1">
        <section className="relative overflow-hidden bg-white pt-16 pb-0">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8">
              <div className="space-y-4 pb-16 sm:pb-20 lg:pb-24">
                <Skeleton className="h-10 w-full max-w-md" />
                <Skeleton className="h-10 w-4/5 max-w-sm" />
                <Skeleton className="mt-5 h-4 w-full max-w-lg" />
                <Skeleton className="h-4 w-4/5 max-w-md" />
                <div className="mt-8 flex flex-wrap gap-3">
                  <Skeleton className="h-12 w-36 rounded-xl" />
                  <Skeleton className="h-12 w-28 rounded-xl" />
                </div>
                <div className="mt-8 flex gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-8 rounded-full" />
                  ))}
                </div>
              </div>
              <div className="hidden pb-16 lg:block">
                <Skeleton className="aspect-square max-h-[min(100%,420px)] w-full rounded-3xl" />
              </div>
            </div>
          </div>
        </section>

        <section className="bg-beige py-16" id="scholarships">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-2">
                <Skeleton className="h-8 w-44" />
                <Skeleton className="h-4 w-28" />
              </div>
              <div className="flex min-h-9 flex-nowrap gap-2 overflow-x-auto pb-1 sm:max-w-[min(100%,28rem)] sm:flex-1 sm:justify-end">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-20 shrink-0 rounded-full" />
                ))}
              </div>
            </div>
            <Skeleton className="relative mt-6 h-11 w-full max-w-xl rounded-xl" />
            <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <Skeleton className="aspect-2/3 w-full rounded-xl sm:rounded-2xl" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
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
