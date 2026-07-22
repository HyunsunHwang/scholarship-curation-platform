import { Skeleton } from "./skeleton";

/** 현재 AirbnbHeader 높이에 맞춘 내비 스켈레톤 */
export default function NavbarSkeleton() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-transparent bg-transparent">
      <div className="mx-auto flex h-14 max-w-440 items-center gap-2 pl-1 pr-3 sm:h-15 sm:gap-3 sm:pl-2 sm:pr-6 lg:pl-3 lg:pr-10">
        <Skeleton className="h-4 w-16 shrink-0 rounded-lg sm:h-4 sm:w-18" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <Skeleton className="h-9 w-16 shrink-0 rounded-full" />
        </div>
      </div>
    </header>
  );
}
