import { Skeleton } from "./skeleton";

export default function NavbarSkeleton() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur supports-backdrop-filter:bg-white/80">
      <div className="mx-auto flex h-16 min-h-16 max-h-16 max-w-7xl items-center justify-between gap-2 overflow-visible pl-1 pr-3 sm:gap-3 sm:pl-3 sm:pr-6 lg:pl-4 lg:pr-8">
        <Skeleton className="h-9 w-28 shrink-0 rounded-lg sm:w-36" />
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Skeleton className="h-8 w-20 rounded-lg sm:w-24" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </div>
    </header>
  );
}
