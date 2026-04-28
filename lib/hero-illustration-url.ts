import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const LOCAL_HERO_FILE = "reading-glasses-hero.png";
const LOCAL_HERO_SRC = `/${LOCAL_HERO_FILE}`;

/**
 * 히어로 우측 일러스트 URL.
 * 1) NEXT_PUBLIC_HERO_READING_GLASSES_PUBLIC_URL — 대시보드에서 복사한 전체 공개 URL
 * 2) public/reading-glasses-hero.png 가 있으면 그 경로 (빌드·오프라인에 안정적)
 * 3) Storage 공개 URL (기본: scholarship-posters / `reading glasses_red.png` — 파일명에 공백 있음)
 */
export function getHeroIllustrationPublicUrl(
  supabase: SupabaseClient<Database>
): string {
  const explicit = process.env.NEXT_PUBLIC_HERO_READING_GLASSES_PUBLIC_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const localFile = path.join(process.cwd(), "public", LOCAL_HERO_FILE);
  if (fs.existsSync(localFile)) {
    return LOCAL_HERO_SRC;
  }

  const bucket =
    process.env.NEXT_PUBLIC_HERO_READING_GLASSES_BUCKET ?? "scholarship-posters";
  const objectPath =
    process.env.NEXT_PUBLIC_HERO_READING_GLASSES_PATH ?? "reading glasses_red.png";

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}
