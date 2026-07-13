"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSpecItemType } from "@/lib/profile-spec";

const TITLE_MAX = 120;
const ORG_MAX = 120;
const DESC_MAX = 1000;
const HEADLINE_MAX = 100;
const BIO_MAX = 1000;
const SKILLS_MAX = 30;
const SKILL_LEN_MAX = 30;

/** "YYYY-MM" 또는 "YYYY-MM-DD" → "YYYY-MM-01" (그 외는 null) */
function normalizeMonthDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(raw.trim());
  if (!match) return null;
  const [, y, m] = match;
  const month = Number(m);
  if (month < 1 || month > 12) return null;
  return `${y}-${m}-01`;
}

export type SpecItemInput = {
  id?: string;
  item_type: string;
  title: string;
  organization?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  is_current?: boolean;
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

  const startDate = normalizeMonthDate(input.start_date);
  const isCurrent = Boolean(input.is_current);
  const endDate = isCurrent ? null : normalizeMonthDate(input.end_date);
  if (startDate && endDate && endDate < startDate) {
    return { error: "종료일이 시작일보다 빠를 수 없습니다." };
  }

  const row = {
    user_id: user.id,
    item_type: input.item_type,
    title,
    organization,
    description,
    start_date: startDate,
    end_date: endDate,
    is_current: isCurrent,
  };

  if (input.id) {
    // RLS(user_id = auth.uid())가 있지만 명시적으로도 본인 행만 갱신
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

export async function deleteSpecItem(
  id: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("profile_spec_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[deleteSpecItem] delete error:", error.message);
    return { error: "삭제에 실패했습니다." };
  }

  revalidatePath("/mypage");
  return { ok: true };
}

export async function updateProfileIntro(input: {
  headline: string;
  bio: string;
  skills: string[];
}): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const headline = input.headline.trim().slice(0, HEADLINE_MAX) || null;
  const bio = input.bio.trim().slice(0, BIO_MAX) || null;
  const skills = Array.from(
    new Set(
      input.skills
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= SKILL_LEN_MAX)
    )
  ).slice(0, SKILLS_MAX);

  const { error } = await supabase
    .from("profiles")
    .update({ headline, bio, skills: skills.length > 0 ? skills : null })
    .eq("id", user.id);
  if (error) {
    console.error("[updateProfileIntro] update error:", error.message);
    return { error: "저장에 실패했습니다." };
  }

  revalidatePath("/mypage");
  return { ok: true };
}
