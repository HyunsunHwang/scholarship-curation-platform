"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** 장학금 포스터와 동일 버킷 — 프로덕션에 이미 있어 별도 버킷 생성 SQL이 필요 없습니다. */
const SITE_LOGO_BUCKET = "scholarship-posters";
const SITE_LOGO_PREFIX = "site-brand/header-logo";

function uploadErrorMessage(raw: string): string {
  if (/site_settings|schema cache/i.test(raw)) {
    return [
      "데이터베이스에 site_settings 테이블이 없습니다.",
      "Supabase → SQL Editor에서 프로젝트 저장소의 sql/create-site-settings-table.sql 파일 내용을 붙여 넣어 실행한 뒤 다시 시도하세요.",
    ].join(" ");
  }
  if (/bucket not found/i.test(raw)) {
    return [
      "Storage 버킷을 찾을 수 없습니다.",
      "배포 환경의 NEXT_PUBLIC_SUPABASE_URL 이 장학금 포스터 업로드에 쓰는 프로젝트와 같은지 확인하세요.",
      'Storage에 "scholarship-posters" 버킷이 있어야 합니다.',
    ].join(" ");
  }
  return raw;
}

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/svg+xml") return "svg";
  return "png";
}

type Props = {
  initialUrl: string | null;
  updatedAt: string | null;
};

export default function SiteLogoForm({ initialUrl, updatedAt }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const upload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("파일 크기는 5MB 이하여야 합니다.");
      return;
    }

    setError("");
    setUploading(true);
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    try {
      const supabase = createClient();
      const ext = extFromMime(file.type);
      const path = `${SITE_LOGO_PREFIX}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(SITE_LOGO_BUCKET)
        .upload(path, file, { cacheControl: "31536000", upsert: false });

      if (uploadError) {
        throw new Error(uploadErrorMessage(uploadError.message));
      }

      const { data } = supabase.storage.from(SITE_LOGO_BUCKET).getPublicUrl(path);
      const publicUrl = data.publicUrl;
      const now = new Date().toISOString();

      const { error: upsertError } = await supabase.from("site_settings").upsert(
        {
          id: 1,
          header_logo_url: publicUrl,
          updated_at: now,
        },
        { onConflict: "id" }
      );

      if (upsertError) {
        throw new Error(uploadErrorMessage(upsertError.message));
      }

      URL.revokeObjectURL(localUrl);
      setPreview(publicUrl);
      router.refresh();
    } catch (e: unknown) {
      const raw =
        e instanceof Error ? e.message : "저장에 실패했습니다.";
      setError(uploadErrorMessage(raw));
      setPreview(initialUrl);
      URL.revokeObjectURL(localUrl);
    } finally {
      setUploading(false);
    }
  }, [initialUrl, router]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) upload(file);
          break;
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [upload]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">헤더 로고</h2>
        <p className="text-sm text-gray-600 mt-1">
          메인 페이지 상단 좌측 로고입니다. 아래 영역을 클릭해 파일을 선택하거나,
          이미지를 끌어 넣거나, <strong>Ctrl+V</strong>로 붙여넣을 수 있습니다.
        </p>
        {updatedAt && (
          <p className="text-xs text-gray-400 mt-2">
            마지막 저장: {new Date(updatedAt).toLocaleString("ko-KR")}
          </p>
        )}
      </div>

      <div
        tabIndex={0}
        role="button"
        aria-label="로고 이미지 업로드 영역"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={[
          "rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
          dragOver
            ? "border-brand bg-brand/5"
            : "border-gray-300 bg-white hover:border-gray-400",
        ].join(" ")}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
        {preview ? (
          <div className="relative mx-auto h-16 w-full max-w-xs">
            <Image
              src={preview}
              alt="로고 미리보기"
              fill
              sizes="320px"
              className="object-contain"
              unoptimized={
                preview.startsWith("blob:") || preview.endsWith(".svg")
              }
            />
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            PNG, JPG, WebP, GIF, SVG · 최대 5MB
          </p>
        )}
        {uploading && (
          <p className="text-sm text-brand mt-3 font-medium">업로드 중…</p>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <p className="text-xs text-gray-500">
        변경 후 메인 사이트 헤더에 반영되기까지 브라우저 캐시 때문에 잠시 걸릴 수
        있습니다. 새로고침해 보세요.
      </p>
    </div>
  );
}
