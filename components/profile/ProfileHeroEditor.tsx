"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import ProfileAvatar from "@/components/ProfileAvatar";
import {
  removeProfileMedia,
  uploadProfileMedia,
} from "@/app/mypage/media-actions";
import type { ProfileMediaKind } from "@/lib/profile-media";

type Props = {
  displayName: string;
  headline: string | null;
  schoolLine: string;
  statusLine: string;
  email: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
};

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
      />
    </svg>
  );
}

export default function ProfileHeroEditor({
  displayName,
  headline,
  schoolLine,
  statusLine,
  email,
  avatarUrl,
  bannerUrl,
}: Props) {
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [busyKind, setBusyKind] = useState<ProfileMediaKind | null>(null);
  const [error, setError] = useState("");
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(avatarUrl);
  const [previewBanner, setPreviewBanner] = useState<string | null>(bannerUrl);

  useEffect(() => {
    if (busyKind) return;
    setPreviewAvatar(avatarUrl);
    setPreviewBanner(bannerUrl);
  }, [avatarUrl, bannerUrl, busyKind]);

  const upload = (kind: ProfileMediaKind, file: File) => {
    setError("");
    setBusyKind(kind);
    const localUrl = URL.createObjectURL(file);
    if (kind === "avatar") setPreviewAvatar(localUrl);
    else setPreviewBanner(localUrl);

    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("file", file);

    startTransition(async () => {
      const result = await uploadProfileMedia(formData);
      URL.revokeObjectURL(localUrl);
      setBusyKind(null);
      if ("error" in result) {
        setError(result.error);
        setPreviewAvatar(avatarUrl);
        setPreviewBanner(bannerUrl);
        return;
      }
      if (kind === "avatar") setPreviewAvatar(result.url);
      else setPreviewBanner(result.url);
      router.refresh();
    });
  };

  const remove = (kind: ProfileMediaKind) => {
    setError("");
    setBusyKind(kind);
    startTransition(async () => {
      const result = await removeProfileMedia(kind);
      setBusyKind(null);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (kind === "avatar") setPreviewAvatar(null);
      else setPreviewBanner(null);
      router.refresh();
    });
  };

  const uploading = pending || busyKind !== null;

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white">
      <div className="group relative h-28 overflow-hidden sm:h-36">
        {previewBanner ? (
          <Image
            src={previewBanner}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="object-cover"
            unoptimized={previewBanner.startsWith("blob:")}
            priority
          />
        ) : (
          <div className="absolute inset-0 bg-linear-to-r from-brand via-brand to-peach" />
        )}
        <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/25" />
        <div className="absolute right-3 top-3 flex gap-2 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
          <button
            type="button"
            disabled={uploading}
            onClick={() => bannerInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-ink shadow-sm backdrop-blur hover:bg-white disabled:opacity-60"
          >
            <CameraIcon className="h-3.5 w-3.5" />
            {busyKind === "banner" ? "업로드 중…" : "배너 변경"}
          </button>
          {previewBanner ? (
            <button
              type="button"
              disabled={uploading}
              onClick={() => remove("banner")}
              className="inline-flex items-center rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-ink/70 shadow-sm backdrop-blur hover:bg-white disabled:opacity-60"
            >
              제거
            </button>
          ) : null}
        </div>
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload("banner", file);
            e.target.value = "";
          }}
        />
      </div>

      <div className="px-5 pb-5 sm:px-8 sm:pb-6">
        <div className="-mt-10 flex items-end justify-between sm:-mt-12">
          <div className="group/avatar relative">
            <ProfileAvatar
              src={previewAvatar}
              alt={displayName || "프로필"}
              className="h-20 w-20 border-4 border-white sm:h-24 sm:w-24"
              sizes="96px"
              priority
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => avatarInputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover/avatar:opacity-100 disabled:opacity-60"
              aria-label="프로필 사진 변경"
            >
              <CameraIcon className="h-5 w-5" />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload("avatar", file);
                e.target.value = "";
              }}
            />
          </div>

          <div className="mb-1 flex flex-wrap items-center justify-end gap-2">
            {previewAvatar ? (
              <button
                type="button"
                disabled={uploading}
                onClick={() => remove("avatar")}
                className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink/65 transition-colors hover:bg-cream disabled:opacity-60"
              >
                사진 제거
              </button>
            ) : null}
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-cream"
            >
              기본 정보 수정
            </Link>
          </div>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">
            {displayName}
          </h1>
          {headline ? (
            <p className="mt-1 text-sm font-medium text-ink/75">{headline}</p>
          ) : null}
          <div className="mt-1.5 space-y-0.5 text-sm text-ink/55">
            {schoolLine ? <p>{schoolLine}</p> : null}
            {statusLine ? <p>{statusLine}</p> : null}
            <p>{email}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
