import Image from "next/image";
import Link from "next/link";

export type LibraryCover =
  | { type: "collage"; urls: (string | null)[] }
  | { type: "single"; url: string | null }
  | { type: "icon"; tone: "brand" | "campus" };

const coverShellClass =
  "relative aspect-square w-full overflow-hidden rounded-2xl shadow-[0_6px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5 transition duration-200 group-hover:shadow-[0_10px_28px_rgba(0,0,0,0.12)]";

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

function IconCover({ tone }: { tone: "brand" | "campus" }) {
  const isBrand = tone === "brand";
  return (
    <div
      className={`${coverShellClass} flex items-center justify-center ${
        isBrand ? "bg-brand/10 text-brand" : "bg-skyblue/55 text-ink/75"
      }`}
    >
      {isBrand ? (
        <svg
          className="h-14 w-14 sm:h-16 sm:w-16"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.26 10.147a60.44 60.44 0 00-.491 6.347A48.63 48.63 0 0112 15.75c2.73 0 5.405.273 8.004.791a60.48 60.48 0 00-.491-6.347m-15.052 0a60.66 60.66 0 01-.514-3.63 48.73 48.73 0 0116.112 0c-.18 1.223-.34 2.434-.514 3.63m-15.052 0A50.02 50.02 0 0112 9.75c2.292 0 4.534.198 6.74.574"
          />
        </svg>
      ) : (
        <svg
          className="h-14 w-14 sm:h-16 sm:w-16"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
          />
        </svg>
      )}
    </div>
  );
}

function CollectionCover({ cover, title }: { cover: LibraryCover; title: string }) {
  if (cover.type === "icon") {
    return <IconCover tone={cover.tone} />;
  }

  if (cover.type === "single") {
    return (
      <div className={`${coverShellClass} bg-cream`}>
        <CoverCell url={cover.url} label={title} />
      </div>
    );
  }

  if (cover.urls.length <= 1) {
    return (
      <div className={`${coverShellClass} bg-cream`}>
        <CoverCell url={cover.urls[0] ?? null} label={title} />
      </div>
    );
  }

  const cells = [...cover.urls.slice(0, 4)];
  while (cells.length < 4) cells.push(null);

  return (
    <div className={`${coverShellClass} bg-cream`}>
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
