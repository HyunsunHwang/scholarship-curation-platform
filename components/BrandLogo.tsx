import Image from "next/image";
import Link from "next/link";

const WORDMARK_W = 1024;
const WORDMARK_H = 576;

export default function BrandLogo() {
  return (
    <Link href="/" className="flex h-8 shrink-0 items-center">
      <Image
        src="/kunnect-wordmark.jpg"
        alt="쿠넥트"
        width={WORDMARK_W}
        height={WORDMARK_H}
        className="h-8 w-auto invert"
        priority
        unoptimized
      />
    </Link>
  );
}
