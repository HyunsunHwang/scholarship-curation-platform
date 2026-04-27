import Link from "next/link";

export default function BrandLogo() {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2.5">
      <img
        src="/koonect-mark.svg"
        alt=""
        width={28}
        height={23}
        className="h-7 w-auto shrink-0"
        decoding="async"
      />
      <span className="text-lg font-bold tracking-tight text-ink">쿠넥트</span>
    </Link>
  );
}
