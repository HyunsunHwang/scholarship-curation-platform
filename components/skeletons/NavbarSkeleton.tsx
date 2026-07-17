import { Skeleton } from "./skeleton";

/** 현재 AirbnbHeader 높이에 맞춘 내비 스켈레톤 */
export default function NavbarSkeleton() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200/80 bg-white">
      <div className="mx-auto flex h-14 max-w-[1760px] items-center gap-2 pl-1 pr-3 sm:h-[60px] sm:gap-3 sm:pl-2 sm:pr-6 lg:pl-3 lg:pr-10">
        <Skeleton className="h-10 w-28 shrink-0 rounded-lg sm:h-12 sm:w-36" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <Skeleton className="h-9 w-16 shrink-0 rounded-full" />
        </div>
      </div>
    </header>
  );
}
