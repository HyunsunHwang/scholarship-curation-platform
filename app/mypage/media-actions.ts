"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  PROFILE_MEDIA_BUCKET,
  PROFILE_MEDIA_MAX_BYTES,
  isAllowedProfileMediaMime,
  profileMediaExtFromMime,
  storagePathFromProfileMediaUrl,
  type ProfileMediaKind,
} from "@/lib/profile-media";
import { cryptoRandomId } from "@/lib/profile-artifacts";

function isMediaKind(value: string): value is ProfileMediaKind {
  return value === "avatar" || value === "banner";
}

async function removeOwnedPath(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  path: string | null
) {
  if (!path) return;
  if (!path.startsWith(`${userId}/`)) return;
  const { error } = await supabase.storage
    .from(PROFILE_MEDIA_BUCKET)
    .remove([path]);
  if (error) {
    console.error("[removeOwnedPath]", error.message);
  }
}

export async function uploadProfileMedia(
  formData: FormData
): Promise<{ ok: true; url: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const kindRaw = String(formData.get("kind") ?? "");
  if (!isMediaKind(kindRaw)) return { error: "잘못된 요청입니다." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "이미지 파일을 선택해 주세요." };
  }
  if (!isAllowedProfileMediaMime(file.type)) {
    return { error: "PNG, JPG, WebP, GIF만 업로드할 수 있습니다." };
  }
  if (file.size > PROFILE_MEDIA_MAX_BYTES) {
    return { error: "파일 크기는 5MB 이하여야 합니다." };
  }

  const { data: current } = await supabase
    .from("profiles")
    .select("avatar_url, banner_url")
    .eq("id", user.id)
    .single();

  const ext = profileMediaExtFromMime(file.type);
  const path = `${user.id}/${kindRaw}/${cryptoRandomId()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_MEDIA_BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error("[uploadProfileMedia]", uploadError.message);
    return { error: "업로드에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  const { data: publicData } = supabase.storage
    .from(PROFILE_MEDIA_BUCKET)
    .getPublicUrl(path);
  const publicUrl = publicData.publicUrl;

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("profiles")
    .update(
      kindRaw === "avatar"
        ? { avatar_url: publicUrl, updated_at: now }
        : { banner_url: publicUrl, updated_at: now }
    )
    .eq("id", user.id);

  if (updateError) {
    console.error("[uploadProfileMedia] update", updateError.message);
    await removeOwnedPath(supabase, user.id, path);
    return { error: "프로필 저장에 실패했습니다." };
  }

  const oldUrl =
    kindRaw === "avatar" ? current?.avatar_url : current?.banner_url;
  const oldPath = storagePathFromProfileMediaUrl(oldUrl);
  if (oldPath && oldPath !== path) {
    await removeOwnedPath(supabase, user.id, oldPath);
  }

  revalidatePath("/mypage");
  revalidatePath("/mypage/preview");
  revalidatePath("/");
  return { ok: true, url: publicUrl };
}

export async function removeProfileMedia(
  kind: ProfileMediaKind
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };
  if (!isMediaKind(kind)) return { error: "잘못된 요청입니다." };

  const { data: current } = await supabase
    .from("profiles")
    .select("avatar_url, banner_url")
    .eq("id", user.id)
    .single();

  const oldUrl =
    kind === "avatar" ? current?.avatar_url : current?.banner_url;

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("profiles")
    .update(
      kind === "avatar"
        ? { avatar_url: null, updated_at: now }
        : { banner_url: null, updated_at: now }
    )
    .eq("id", user.id);

  if (updateError) {
    console.error("[removeProfileMedia]", updateError.message);
    return { error: "삭제에 실패했습니다." };
  }

  await removeOwnedPath(
    supabase,
    user.id,
    storagePathFromProfileMediaUrl(oldUrl)
  );

  revalidatePath("/mypage");
  revalidatePath("/mypage/preview");
  revalidatePath("/");
  return { ok: true };
}
