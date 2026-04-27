import Image from "next/image";
import Link from "next/link";

const WORDMARK_W = 1024;
const WORDMARK_H = 576;

export default function BrandLogo() {
  return (
    <Link
      href="/"
      className="relative block h-8 w-36 shrink-0 overflow-hidden sm:w-40"
    >
      <Image
        src="/brand-wordmark.jpg"
        alt="장학쌤"
        width={WORDMARK_W}
        height={WORDMARK_H}
        className="absolute left-1/2 top-1/2 h-32 w-auto max-w-none -translate-x-1/2 -translate-y-1/2"
        priority
        sizes="(max-width: 640px) 144px, 160px"
      />
    </Link>
  );
}
