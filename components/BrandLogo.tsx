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
      className="relative block h-12 w-auto max-w-[min(176px,calc(100vw-12rem))] overflow-visible sm:h-16 sm:max-w-[min(280px,calc(100vw-13rem))] md:h-24 md:max-w-[432px]"
    >
      <Image
        src={src}
        alt="장학쌤"
        fill
        priority
        sizes="(max-width: 640px) 176px, (max-width: 768px) 280px, 432px"
        className="object-contain object-left"
      />
    </Link>
  );
}
