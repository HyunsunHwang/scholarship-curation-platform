"use client";

import Image from "next/image";
import Link from "next/link";
import { twMerge } from "tailwind-merge";

type Props = {
  /** 관리자 설정 시 Storage 공개 URL (+ 캐시 무효화 쿼리) */
  logoSrc?: string | null;
  /** 래퍼(Link)에 추가 클래스 — 인증·온보딩 등에서 크기·정렬 조정 */
  className?: string;
  /** 로고 이미지 정렬 등 */
  imageClassName?: string;
  /** LCP용 — 홈 헤더 등 첫 화면에서만 true */
  priority?: boolean;
};

/**
 * 레이아웃: fill 대신 h-full + intrinsic width 비율.
 * 인증처럼 중앙 flex 배치에서는 부모 너비가 비어 버리므로(fill 래퍼 높이만 있음) 브레이킹된다.
 */
export default function BrandLogo({
  logoSrc,
  className,
  imageClassName = "object-contain object-left",
  priority = false,
}: Props) {
  const src = logoSrc?.trim() || "/brand-logo.png";

  return (
    <Link
      href="/"
      className={twMerge(
        "inline-flex shrink-0 items-center justify-center overflow-visible h-5 max-h-5 max-w-[min(80px,calc(100vw-12rem))] sm:h-5 sm:max-h-5 sm:max-w-[min(96px,calc(100vw-13rem))] md:h-6 md:max-h-6 md:max-w-24",
        className
      )}
    >
      <Image
        src={src}
        alt="이루리"
        width={898}
        height={225}
        priority={priority}
        sizes="(max-width: 640px) 64px, (max-width: 768px) 96px, 96px"
        className={twMerge(
          "max-h-full w-auto max-w-full object-contain object-left",
          imageClassName
        )}
      />
    </Link>
  );
}
