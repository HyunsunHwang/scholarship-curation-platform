import Link from "next/link";

export default function BrandLogo() {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2.5">
      <span
        className="text-ink flex h-8 w-8 shrink-0 items-center justify-center"
        aria-hidden
      >
        <KoonectGlyph className="h-7 w-7" />
      </span>
      <span className="text-lg font-bold tracking-tight text-ink">쿠넥트</span>
    </Link>
  );
}

function KoonectGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 40"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="24" cy="14" rx="16" ry="9" />
      <rect x="4" y="17" width="40" height="4.5" rx="1" />
      <circle
        cx="16"
        cy="30"
        r="4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <line
        x1="20.2"
        y1="30"
        x2="27.8"
        y2="30"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle
        cx="32"
        cy="30"
        r="4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      />
    </svg>
  );
}
