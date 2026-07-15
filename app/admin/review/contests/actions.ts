"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buildContestPayload,
  buildContestSelectionStagesPayload,
  parseContestContentKind,
} from "@/lib/contest-payload";
import { contestBenefitStorageLabels } from "@/lib/benefit-categories";
import {
  formatAndExtractContestNotice,
  type NoticeDraftStage,
} from "@/lib/notice-extraction";
import type { ContestContentKind } from "@/lib/admin-kinds";

function asDraftRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asDraftStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim() !== ""
  );
}

function asDraftString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stagesToDraftJson(stages: NoticeDraftStage[]): NoticeDraftStage[] {
  return stages.map((s) => ({
    title: s.title,
    phase: s.phase,
    schedule_text: s.schedule_text,
    note: s.note,
  }));
}

function normalizeRejectTag(reviewNote?: string) {
  const note = (reviewNote ?? "").trim();
  if (!note) return { taggedNote: null };
  const hasTag = /^\[[a-z0-9_]+\]/i.test(note);
  if (hasTag) return { taggedNote: note };

  let tag = "other";
  if (/중복|duplicate/i.test(note)) tag = "duplicate";
  else if (/아님|not_/i.test(note)) tag = "not_relevant";
  else if (/기간\s*종료|마감|expired|closed/i.test(note)) tag = "expired";
  else if (/조건\s*불명확|정보\s*부족|insufficient/i.test(note)) tag = "insufficient_info";

  return { taggedNote: `[${tag}] ${note}` };
}

async function ensureAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, error: "로그인이 필요합니다." };

  const isAdmin = await supabase.rpc("is_admin");
  if (!isAdmin.data)
    return { supabase, user, error: "관리자 권한이 필요합니다." };

  return { supabase, user, error: null };
}

export async function promoteCrawledContest(
  crawledId: number,
  lockedKind: ContestContentKind,
  formData: FormData
) {
  const { supabase, user, error: authError } = await ensureAdmin();
  if (authError) return { error: authError };

  const { data: reviewRow, error: reviewRowError } = await supabase
    .from("crawled_contests")
    .select("status, contest_id")
    .eq("id", crawledId)
    .single();
  if (reviewRowError) return { error: reviewRowError.message };
  if (reviewRow.status !== "new" || reviewRow.contest_id) {
    return { error: "이미 처리된 공고는 다시 콘텐츠로 등록할 수 없습니다." };
  }

  const payload = buildContestPayload(formData, lockedKind);
  let stagesFromForm = buildContestSelectionStagesPayload(formData, 0).map((stage) => {
    const { contest_id, ...rest } = stage;
    void contest_id;
    return rest;
  });

  // 폼에 선발 단계가 비어 있으면 정리된 원문에서 LLM 추출을 1회 시도
  if (stagesFromForm.length === 0 && payload.original_notice_text?.trim()) {
    const extracted = await formatAndExtractContestNotice({
      title: payload.name || "공고",
      body: payload.original_notice_text,
      contentKind: lockedKind,
      organization: payload.organization,
      skipFormatIfAlreadyFormatted: true,
    });
    payload.original_notice_text = extracted.noticeText || payload.original_notice_text;
    if (extracted.draft.announcement_date && !payload.announcement_date) {
      payload.announcement_date = extracted.draft.announcement_date;
    }
    // support_amount_text(총상금): 링커리어 크롤값 유지 — LLM으로 채우지 않음
    if ((extracted.draft.stages?.length ?? 0) > 0) {
      stagesFromForm = (extracted.draft.stages ?? []).map((s, index) => ({
        stage_order: index + 1,
        title: s.title.trim(),
        phase:
          s.phase === "post_acceptance"
            ? ("post_acceptance" as const)
            : ("selection" as const),
        schedule_date: null as string | null,
        schedule_text: s.schedule_text?.trim() || null,
        note: s.note?.trim() || null,
      }));
    }
  }

  // 공모전: 상금 규모가 있으면 혜택에 "총상금 N"으로 저장 (단순 "상금" 대체)
  if (lockedKind === "contest") {
    const benefitLabels = contestBenefitStorageLabels({
      noticeText: payload.original_notice_text,
      benefits: payload.benefits,
      supportAmountText: payload.support_amount_text,
      additionalNote: payload.note,
      contentKind: lockedKind,
      name: payload.name,
    });
    if (benefitLabels.length > 0) {
      payload.benefits = benefitLabels;
    }
  }

  const { data: inserted, error } = await supabase
    .from("contests")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { error: error.message };

  if (inserted?.id) {
    const stages =
      stagesFromForm.length > 0
        ? stagesFromForm.map((s) => ({ ...s, contest_id: inserted.id }))
        : buildContestSelectionStagesPayload(formData, inserted.id);
    if (stages.length > 0) {
      const { error: stagesError } = await supabase
        .from("contest_selection_stages")
        .insert(stages);
      if (stagesError) return { error: `선발 단계 저장 실패: ${stagesError.message}` };
    }
  }

  const { error: markError } = await supabase
    .from("crawled_contests")
    .update({
      status: "promoted",
      contest_id: inserted?.id ?? null,
      content_kind: lockedKind,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
    })
    .eq("id", crawledId);
  if (markError) return { error: markError.message };

  revalidatePath("/admin/review");
  revalidatePath("/admin/content");
  revalidatePath("/");
  redirect(`/admin/review?kind=${lockedKind}`);
}

export async function formatCrawledContestBody(
  crawledId: number
): Promise<{ error?: string; success?: true; warning?: string; stageCount?: number }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError) return { error: authError };

  const { data: row, error } = await supabase
    .from("crawled_contests")
    .select("id, title, body, content_kind, extracted_draft, source_name")
    .eq("id", crawledId)
    .single();
  if (error) return { error: error.message };
  if (!row) return { error: "수집 데이터를 찾을 수 없습니다." };

  const body = row.body?.trim() ?? "";
  if (!body) return { error: "정리할 본문이 없습니다." };

  const draft = asDraftRecord(row.extracted_draft);
  const contentKind = parseContestContentKind(row.content_kind);
  const title = asDraftString(draft.name) ?? row.title ?? "공고";

  const extracted = await formatAndExtractContestNotice({
    title,
    body,
    contentKind,
    organization: asDraftString(draft.organization) ?? row.source_name,
  });

  if (extracted.formatError && !extracted.noticeText.trim()) {
    return { error: extracted.formatError };
  }

  const noticeText = extracted.noticeText.trim() || body;
  const extractedDraft = extracted.draft;
  const stages = extractedDraft.stages ?? [];

  // 총상금: 링커리어 크롤값(draft.support_amount_text) 우선 — LLM 합산으로 덮어쓰지 않음
  const crawledPrize = asDraftString(draft.support_amount_text);
  const supportAmountText = crawledPrize;

  // 혜택: 크롤 총상금 + 원문/기타 혜택 보강 (상금 규모는 크롤 값 고정)
  const benefitLabels = contestBenefitStorageLabels({
    noticeText,
    benefits: asDraftStringArray(draft.benefits),
    supportAmountText,
    additionalNote: extractedDraft.note ?? asDraftString(draft.note),
    contentKind,
    name: title,
  });

  const nextDraft: Record<string, unknown> = {
    ...draft,
    original_notice_text: noticeText,
    stages: stagesToDraftJson(stages),
    ...(crawledPrize ? { support_amount_text: crawledPrize } : {}),
    ...(extractedDraft.announcement_date
      ? { announcement_date: extractedDraft.announcement_date }
      : {}),
    ...(extractedDraft.selection_count != null
      ? { selection_count: extractedDraft.selection_count }
      : {}),
    ...(extractedDraft.apply_method
      ? { apply_method: extractedDraft.apply_method }
      : {}),
    ...(extractedDraft.contact ? { contact: extractedDraft.contact } : {}),
    ...(extractedDraft.note ? { note: extractedDraft.note } : {}),
    ...(extractedDraft.required_documents?.length
      ? { required_documents: extractedDraft.required_documents }
      : {}),
    ...(benefitLabels.length > 0 ? { benefits: benefitLabels } : {}),
  };

  const { error: updateError } = await supabase
    .from("crawled_contests")
    .update({
      body: noticeText,
      extracted_draft: nextDraft,
    })
    .eq("id", crawledId);
  if (updateError) return { error: updateError.message };

  revalidatePath(`/admin/review/contests/${crawledId}`);

  if (extracted.extractError) {
    return {
      success: true,
      stageCount: stages.length,
      warning: `원문은 정리됐지만 일정 추출에 실패했습니다: ${extracted.extractError}`,
    };
  }
  if (stages.length === 0) {
    return {
      success: true,
      stageCount: 0,
      warning: "원문은 정리됐지만 본문에서 추출된 일정이 없습니다.",
    };
  }
  return { success: true, stageCount: stages.length };
}

export async function rejectCrawledContest(
  crawledId: number,
  reviewNote?: string
): Promise<{ error?: string; success?: true }> {
  const { supabase, user, error: authError } = await ensureAdmin();
  if (authError) return { error: authError };

  const { data: row, error: rowError } = await supabase
    .from("crawled_contests")
    .select("content_kind, status, contest_id")
    .eq("id", crawledId)
    .single();
  if (rowError) return { error: rowError.message };
  if (row.status !== "new" || row.contest_id) {
    return { error: "검수 대기 중인 공고만 거절할 수 있습니다." };
  }

  const { error } = await supabase
    .from("crawled_contests")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
      review_note: normalizeRejectTag(reviewNote).taggedNote,
    })
    .eq("id", crawledId);
  if (error) return { error: error.message };

  const kind = parseContestContentKind(row?.content_kind ?? null);
  revalidatePath("/admin/review");
  revalidatePath(`/admin/review?kind=${kind}`);
  return { success: true };
}

export async function restoreCrawledContest(
  crawledId: number
): Promise<{ error?: string; success?: true }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError) return { error: authError };

  const { data: row, error: rowError } = await supabase
    .from("crawled_contests")
    .select("content_kind, status, contest_id")
    .eq("id", crawledId)
    .single();
  if (rowError) return { error: rowError.message };
  if (row.status !== "rejected" || row.contest_id) {
    return { error: "거절된 공고만 검수 대기로 복원할 수 있습니다." };
  }

  const { error } = await supabase
    .from("crawled_contests")
    .update({
      status: "new",
      reviewed_at: null,
      reviewed_by: null,
      review_note: null,
    })
    .eq("id", crawledId);
  if (error) return { error: error.message };

  const kind = parseContestContentKind(row?.content_kind ?? null);
  revalidatePath("/admin/review");
  revalidatePath(`/admin/review?kind=${kind}`);
  return { success: true };
}
