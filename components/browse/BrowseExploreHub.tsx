import Image from "next/image";
import Link from "next/link";
import type { BrowseExploreTile } from "@/lib/browse-data";

function ExploreTileCard({ tile }: { tile: BrowseExploreTile }) {
  return (
    <Link
      href={tile.href}
      className="group relative aspect-5/3 overflow-hidden rounded-xl shadow-sm transition duration-200 hover:scale-[1.02] hover:shadow-md active:scale-[0.99] sm:aspect-2/1"
      style={{ backgroundColor: tile.color }}
    >
      <h2 className="relative z-10 p-3 text-lg font-extrabold leading-tight tracking-tight text-white sm:p-4 sm:text-xl md:text-2xl">
        {tile.label}
      </h2>

      {tile.coverUrl ? (
        <div className="pointer-events-none absolute -bottom-2 -right-3 h-[58%] w-[42%] overflow-hidden rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition duration-300 rotate-25 group-hover:scale-105 sm:-bottom-3 sm:-right-4 sm:h-[62%] sm:w-[40%]">
          <Image
            src={tile.coverUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 40vw, 20vw"
            className="object-cover"
          />
        </div>
      ) : (
        <div
          className="pointer-events-none absolute -bottom-2 -right-3 flex h-[58%] w-[42%] items-center justify-center rounded-md bg-black/20 text-3xl font-black text-white/35 shadow-[0_8px_24px_rgba(0,0,0,0.25)] rotate-25 sm:-bottom-3 sm:-right-4 sm:h-[62%] sm:w-[40%] sm:text-4xl"
          aria-hidden
        >
          {tile.label.charAt(0)}
        </div>
      )}
    </Link>
  );
}

export default function BrowseExploreHub({
  tiles,
}: {
  tiles: BrowseExploreTile[];
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight text-ink sm:mb-6 sm:text-3xl">
        모두 둘러보기
      </h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3">
        {tiles.map((tile) => (
          <ExploreTileCard key={tile.key} tile={tile} />
        ))}
      </div>
    </div>
  );
}
