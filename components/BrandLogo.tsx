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
      className="relative block h-40 w-[min(100vw-4rem,720px)] shrink-0 overflow-visible sm:w-[720px]"
    >
      <Image
        src={src}
        alt="장학쌤"
        fill
        priority
        sizes="(max-width: 640px) min(90vw, 720px), 720px"
        className="object-contain object-left"
      />
    </Link>
  );
}
