"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSpecItemType, isExperienceType } from "@/lib/profile-spec";
import { normalizeInterestCategories } from "@/lib/interestCategories";
import {
  PROFILE_ARTIFACTS_BUCKET,
  PROFILE_FILE_MAX,
  PROFILE_FILE_MAX_BYTES,
  countFileArtifacts,
  cryptoRandomId,
  isAllowedArtifactMime,
  normalizeArtifacts,
  sanitizeArtifactFileName,
  type SpecArtifact,
  type SpecFileArtifact,
  type SpecLinkArtifact,
} from "@/lib/profile-artifacts";
import type { SpecItemType } from "@/lib/database.types";

const TITLE_MAX = 120;
const ORG_MAX = 120;
const DESC_MAX = 1000;
const STAR_ROLE_MAX = 200;
const STAR_ACTION_MAX = 1000;
const STAR_RESULT_MAX = 300;
const HEADLINE_MAX = 100;
const BIO_MAX = 1000;

/**
 * "YYYY-MM-DD" → 그대로 (일 보존, 유효한 날짜인지 검사),
 * "YYYY-MM" → "YYYY-MM-01" (월 단위 기록), 그 외는 null.
 */
function normalizeDateInput(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(raw.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const month = Number(m);
  if (month < 1 || month > 12) return null;
  const day = d ? Number(d) : 1;
  const daysInMonth = new Date(Number(y), month, 0).getDate();
  if (day < 1 || day > daysInMonth) return null;
  return `${y}-${m}-${d ?? "01"}`;
}

async function loadUserArtifactsMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<Map<string, SpecArtifact[]>> {
  const { data, error } = await supabase
    .from("profile_spec_items")
    .select("id, artifacts")
    .eq("user_id", userId);
  if (error) {
    console.error("[loadUserArtifactsMap]", error.message);
    return new Map();
  }
  const map = new Map<string, SpecArtifact[]>();
  for (const row of data ?? []) {
    map.set(row.id, normalizeArtifacts(row.artifacts));
  }
  return map;
}

async function deleteStoragePaths(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paths: string[]
) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return;
  const { error } = await supabase.storage
    .from(PROFILE_ARTIFACTS_BUCKET)
    .remove(unique);
  if (error) {
    console.error("[deleteStoragePaths]", error.message);
  }
}

export type SpecItemInput = {
  id?: string;
  item_type: string;
  title: string;
  organization?: string;
  /** 자격증·어학 등 자유 서술 (경험 폼에서는 보내지 않음 → 기존 값 유지) */
  description?: string;
  start_date?: string;
  end_date?: string;
  is_current?: boolean;
  /** STAR: 내가 맡은 역할 — 경험 4종(경력·대외활동·프로젝트·수상)에서 필수 */
  star_role?: string;
  /** STAR: 구체적으로 어떻게 했는지 */
  star_action?: string;
  /** STAR: 결과 (숫자·순위 포함 권장) */
  star_result?: string;
};

export async function saveSpecItem(
  input: SpecItemInput
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  if (!isSpecItemType(input.item_type)) {
    return { error: "알 수 없는 항목 유형입니다." };
  }
  const title = input.title?.trim();
  if (!title) return { error: "제목을 입력해 주세요." };
  if (title.length > TITLE_MAX) return { error: "제목이 너무 깁니다." };

  const organization = input.organization?.trim() || null;
  if (organization && organization.length > ORG_MAX) {
    return { error: "기관명이 너무 깁니다." };
  }
  const description = input.description?.trim() || null;
  if (description && description.length > DESC_MAX) {
    return { error: "설명은 1000자 이내로 입력해 주세요." };
  }

  const starRole = input.star_role?.trim() || null;
  const starAction = input.star_action?.trim() || null;
  const starResult = input.star_result?.trim() || null;
  if (
    isExperienceType(input.item_type as SpecItemType) &&
    input.star_role !== undefined &&
    !starRole
  ) {
    return { error: "내가 맡은 역할을 입력해 주세요." };
  }
  if (starRole && starRole.length > STAR_ROLE_MAX) {
    return { error: `역할은 ${STAR_ROLE_MAX}자 이내로 입력해 주세요.` };
  }
  if (starAction && starAction.length > STAR_ACTION_MAX) {
    return { error: `행동은 ${STAR_ACTION_MAX}자 이내로 입력해 주세요.` };
  }
  if (starResult && starResult.length > STAR_RESULT_MAX) {
    return { error: `결과는 ${STAR_RESULT_MAX}자 이내로 입력해 주세요.` };
  }

  const startDate = normalizeDateInput(input.start_date);
  const isCurrent = Boolean(input.is_current);
  const endDate = isCurrent ? null : normalizeDateInput(input.end_date);
  if (startDate && endDate && endDate < startDate) {
    return { error: "종료일이 시작일보다 빠를 수 없습니다." };
  }

  const row = {
    user_id: user.id,
    item_type: input.item_type,
    title,
    organization,
    ...(input.description !== undefined ? { description } : {}),
    ...(input.star_role !== undefined ? { star_role: starRole } : {}),
    ...(input.star_action !== undefined ? { star_action: starAction } : {}),
    ...(input.star_result !== undefined ? { star_result: starResult } : {}),
    start_date: startDate,
    end_date: endDate,
    is_current: isCurrent,
  };

  if (input.id) {
    const { error } = await supabase
      .from("profile_spec_items")
      .update(row)
      .eq("id", input.id)
      .eq("user_id", user.id);
    if (error) {
      console.error("[saveSpecItem] update error:", error.message);
      return { error: "저장에 실패했습니다." };
    }
  } else {
    const { error } = await supabase.from("profile_spec_items").insert(row);
    if (error) {
      console.error("[saveSpecItem] insert error:", error.message);
      return { error: "저장에 실패했습니다." };
    }
  }

  revalidatePath("/mypage");
  return { ok: true };
}

/**
 * 경험(STAR) 항목 저장 + 결과물 링크/파일 첨부.
 * FormData 필드:
 * - id?, item_type, title, organization, start_date, end_date, is_current
 * - star_role, star_action, star_result
 * - links_json: [{id?, url, title?}]
 * - keep_file_ids_json: string[]  (기존 파일 중 유지할 id)
 * - files: File[] (신규 업로드)
 */
export async function saveExperienceItem(
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const itemType = String(formData.get("item_type") ?? "");
  if (!isSpecItemType(itemType) || !isExperienceType(itemType)) {
    return { error: "알 수 없는 경험 종류입니다." };
  }

  const idRaw = String(formData.get("id") ?? "").trim();
  const itemId = idRaw || undefined;

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "제목을 입력해 주세요." };
  if (title.length > TITLE_MAX) return { error: "제목이 너무 깁니다." };

  const organization = String(formData.get("organization") ?? "").trim() || null;
  if (organization && organization.length > ORG_MAX) {
    return { error: "기관명이 너무 깁니다." };
  }

  const starRole = String(formData.get("star_role") ?? "").trim();
  if (!starRole) return { error: "내가 맡은 역할을 입력해 주세요." };
  if (starRole.length > STAR_ROLE_MAX) {
    return { error: `역할은 ${STAR_ROLE_MAX}자 이내로 입력해 주세요.` };
  }
  const starAction = String(formData.get("star_action") ?? "").trim() || null;
  if (starAction && starAction.length > STAR_ACTION_MAX) {
    return { error: `행동은 ${STAR_ACTION_MAX}자 이내로 입력해 주세요.` };
  }
  const starResult = String(formData.get("star_result") ?? "").trim() || null;
  if (starResult && starResult.length > STAR_RESULT_MAX) {
    return { error: `결과는 ${STAR_RESULT_MAX}자 이내로 입력해 주세요.` };
  }

  const startDate = normalizeDateInput(String(formData.get("start_date") ?? ""));
  const isCurrent = String(formData.get("is_current") ?? "") === "1";
  const endDate = isCurrent
    ? null
    : normalizeDateInput(String(formData.get("end_date") ?? ""));
  if (startDate && endDate && endDate < startDate) {
    return { error: "종료일이 시작일보다 빠를 수 없습니다." };
  }

  let linksInput: unknown = [];
  try {
    linksInput = JSON.parse(String(formData.get("links_json") ?? "[]"));
  } catch {
    return { error: "링크 형식이 올바르지 않습니다." };
  }
  const links = normalizeArtifacts(
    (Array.isArray(linksInput) ? linksInput : []).map((l) =>
      l && typeof l === "object" ? { ...(l as object), kind: "link" } : l
    )
  ).filter((a): a is SpecLinkArtifact => a.kind === "link");

  let keepFileIds: string[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("keep_file_ids_json") ?? "[]"));
    keepFileIds = Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return { error: "파일 목록 형식이 올바르지 않습니다." };
  }

  const newFiles = formData
    .getAll("files")
    .filter((f): f is File => typeof File !== "undefined" && f instanceof File && f.size > 0);

  for (const file of newFiles) {
    if (file.size > PROFILE_FILE_MAX_BYTES) {
      return { error: `"${file.name}" 파일이 10MB를 초과합니다.` };
    }
    if (!isAllowedArtifactMime(file.type)) {
      return {
        error: `"${file.name}" 형식을 지원하지 않습니다. PDF·이미지·문서(PPT/Word)만 올려 주세요.`,
      };
    }
  }

  const artifactsByItem = await loadUserArtifactsMap(supabase, user.id);
  const currentArtifacts = itemId ? artifactsByItem.get(itemId) ?? [] : [];
  const currentFiles = currentArtifacts.filter(
    (a): a is SpecFileArtifact => a.kind === "file"
  );
  const keptFiles = currentFiles.filter((f) => keepFileIds.includes(f.id));
  const removedFiles = currentFiles.filter((f) => !keepFileIds.includes(f.id));

  let otherFileCount = 0;
  for (const [id, arts] of artifactsByItem) {
    if (itemId && id === itemId) continue;
    otherFileCount += countFileArtifacts(arts);
  }
  const nextFileCount = otherFileCount + keptFiles.length + newFiles.length;
  if (nextFileCount > PROFILE_FILE_MAX) {
    return {
      error: `프로필에 첨부할 수 있는 파일은 최대 ${PROFILE_FILE_MAX}개입니다. (현재 사용 ${otherFileCount + keptFiles.length}개)`,
    };
  }

  const baseRow = {
    user_id: user.id,
    item_type: itemType,
    title,
    organization,
    star_role: starRole,
    star_action: starAction,
    star_result: starResult,
    start_date: startDate,
    end_date: endDate,
    is_current: isCurrent,
    artifacts: [...links, ...keptFiles] as SpecArtifact[],
  };

  let savedId = itemId;
  if (itemId) {
    const { error } = await supabase
      .from("profile_spec_items")
      .update(baseRow)
      .eq("id", itemId)
      .eq("user_id", user.id);
    if (error) {
      console.error("[saveExperienceItem] update error:", error.message);
      return { error: "저장에 실패했습니다." };
    }
  } else {
    const { data, error } = await supabase
      .from("profile_spec_items")
      .insert(baseRow)
      .select("id")
      .single();
    if (error || !data) {
      console.error("[saveExperienceItem] insert error:", error?.message);
      return { error: "저장에 실패했습니다." };
    }
    savedId = data.id;
  }

  const uploaded: SpecFileArtifact[] = [];
  for (const file of newFiles) {
    const safeName = sanitizeArtifactFileName(file.name);
    const path = `${user.id}/${cryptoRandomId()}_${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(PROFILE_ARTIFACTS_BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) {
      console.error("[saveExperienceItem] upload error:", uploadError.message);
      // 이미 올린 파일은 artifacts에 반영되지 않으므로 정리
      await deleteStoragePaths(
        supabase,
        uploaded.map((u) => u.path)
      );
      return { error: "파일 업로드에 실패했습니다." };
    }
    const { data: publicData } = supabase.storage
      .from(PROFILE_ARTIFACTS_BUCKET)
      .getPublicUrl(path);
    uploaded.push({
      id: cryptoRandomId(),
      kind: "file",
      path,
      url: publicData.publicUrl,
      name: safeName,
      mime_type: file.type || null,
      size: file.size,
    });
  }

  if (uploaded.length > 0) {
    const finalArtifacts: SpecArtifact[] = [...links, ...keptFiles, ...uploaded];
    const { error } = await supabase
      .from("profile_spec_items")
      .update({ artifacts: finalArtifacts })
      .eq("id", savedId!)
      .eq("user_id", user.id);
    if (error) {
      console.error("[saveExperienceItem] artifacts update error:", error.message);
      await deleteStoragePaths(
        supabase,
        uploaded.map((u) => u.path)
      );
      return { error: "파일 정보 저장에 실패했습니다." };
    }
  }

  await deleteStoragePaths(
    supabase,
    removedFiles.map((f) => f.path)
  );

  revalidatePath("/mypage");
  return { ok: true };
}

export async function deleteSpecItem(
  id: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data: existing } = await supabase
    .from("profile_spec_items")
    .select("artifacts")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("profile_spec_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[deleteSpecItem] delete error:", error.message);
    return { error: "삭제에 실패했습니다." };
  }

  const artifacts = normalizeArtifacts(existing?.artifacts);
  await deleteStoragePaths(
    supabase,
    artifacts
      .filter((a): a is SpecFileArtifact => a.kind === "file")
      .map((a) => a.path)
  );

  revalidatePath("/mypage");
  return { ok: true };
}

export async function updateProfileIntro(input: {
  headline: string;
  bio: string;
  interest_categories: string[];
}): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const headline = input.headline.trim().slice(0, HEADLINE_MAX) || null;
  const bio = input.bio.trim().slice(0, BIO_MAX) || null;
  const interestCategories = normalizeInterestCategories(input.interest_categories);

  const { error } = await supabase
    .from("profiles")
    .update({
      headline,
      bio,
      interest_categories: interestCategories.length > 0 ? interestCategories : null,
    })
    .eq("id", user.id);
  if (error) {
    console.error("[updateProfileIntro] update error:", error.message);
    return { error: "저장에 실패했습니다." };
  }

  revalidatePath("/mypage");
  return { ok: true };
}
