import Image from "next/image";
import Link from "next/link";

type Props = {
  /** 관리자 설정 시 Storage 공개 URL (+ 캐시 무효화 쿼리) */
  logoSrc?: string | null;
};

export default function BrandLogo({ logoSrc }: Props) {
  const src = logoSrc?.trim() || "/brand-logo.png";

  return (
    <Link
      href="/"
      className="relative block h-8 w-36 shrink-0 overflow-hidden sm:w-40"
    >
      <Image
        src={src}
        alt="장학쌤"
        fill
        priority
        sizes="(max-width: 640px) 144px, 160px"
        className="object-contain object-left"
      />
    </Link>
  );
}
