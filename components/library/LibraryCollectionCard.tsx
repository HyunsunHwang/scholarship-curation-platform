import Image from "next/image";
import Link from "next/link";

export type LibraryCover =
  | { type: "collage"; urls: (string | null)[] }
  | { type: "single"; url: string | null };

function CoverCell({ url, label }: { url: string | null; label: string }) {
  if (url) {
    return (
      <div className="relative h-full w-full bg-cream">
        <Image
          src={url}
          alt=""
          fill
          sizes="200px"
          className="object-cover"
        />
      </div>
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-beige text-sm font-bold text-ink/25">
      {label.charAt(0)}
    </div>
  );
}

function CollectionCover({ cover, title }: { cover: LibraryCover; title: string }) {
  if (cover.type === "single") {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-cream shadow-[0_6px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5 transition duration-200 group-hover:shadow-[0_10px_28px_rgba(0,0,0,0.12)]">
        <CoverCell url={cover.url} label={title} />
      </div>
    );
  }

  if (cover.urls.length <= 1) {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-cream shadow-[0_6px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5 transition duration-200 group-hover:shadow-[0_10px_28px_rgba(0,0,0,0.12)]">
        <CoverCell url={cover.urls[0] ?? null} label={title} />
      </div>
    );
  }

  const cells = [...cover.urls.slice(0, 4)];
  while (cells.length < 4) cells.push(null);

  return (
    <div className="aspect-square w-full overflow-hidden rounded-2xl bg-cream shadow-[0_6px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5 transition duration-200 group-hover:shadow-[0_10px_28px_rgba(0,0,0,0.12)]">
      <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5 bg-white">
        {cells.map((url, i) => (
          <CoverCell key={i} url={url} label={title} />
        ))}
      </div>
    </div>
  );
}

export default function LibraryCollectionCard({
  href,
  title,
  subtitle,
  cover,
}: {
  href: string;
  title: string;
  subtitle: string;
  cover: LibraryCover;
}) {
  return (
    <Link href={href} className="group block w-full max-w-[280px]">
      <CollectionCover cover={cover} title={title} />
      <div className="mt-3 px-0.5">
        <p className="truncate text-base font-bold text-ink">{title}</p>
        <p className="mt-0.5 truncate text-sm text-ink/50">{subtitle}</p>
      </div>
    </Link>
  );
}
