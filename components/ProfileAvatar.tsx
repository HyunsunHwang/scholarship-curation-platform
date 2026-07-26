import Image from "next/image";
import { twMerge } from "tailwind-merge";

export const DEFAULT_AVATAR_SRC = "/default-avatar.png";

type ProfileAvatarProps = {
  /** 사용자 업로드 아바타 URL. 없으면 기본 이미지 */
  src?: string | null;
  /** 접근성용 이름/이니셜 — 이미지 alt에 사용 */
  alt?: string;
  className?: string;
  /** next/image sizes 힌트 */
  sizes?: string;
  priority?: boolean;
};

/** 프로필 아바타. src가 없으면 이루리 꽃 마크 기본 이미지. */
export default function ProfileAvatar({
  src,
  alt = "프로필",
  className,
  sizes = "96px",
  priority = false,
}: ProfileAvatarProps) {
  const imageSrc = src?.trim() || DEFAULT_AVATAR_SRC;
  const unoptimized = imageSrc.startsWith("blob:");

  return (
    <span
      className={twMerge(
        "relative inline-block shrink-0 overflow-hidden rounded-full bg-beige",
        className
      )}
    >
      <Image
        src={imageSrc}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
        unoptimized={unoptimized}
      />
    </span>
  );
}
