import Image from "next/image";
import { twMerge } from "tailwind-merge";

export const DEFAULT_AVATAR_SRC = "/default-avatar.png";

type ProfileAvatarProps = {
  /** 접근성용 이름/이니셜 — 이미지 alt에 사용 */
  alt?: string;
  className?: string;
  /** next/image sizes 힌트 */
  sizes?: string;
  priority?: boolean;
};

/** 기본 프로필 아바타 (이루리 꽃 마크). */
export default function ProfileAvatar({
  alt = "프로필",
  className,
  sizes = "96px",
  priority = false,
}: ProfileAvatarProps) {
  return (
    <span
      className={twMerge(
        "relative inline-block shrink-0 overflow-hidden rounded-full bg-beige",
        className
      )}
    >
      <Image
        src={DEFAULT_AVATAR_SRC}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
    </span>
  );
}
