"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/require-admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import type { PostPhaseLDatabase } from "@/lib/post-phase-l/database.types";
import { validateSemanticReviewDecision } from "@/lib/analysis/semantic-review.mjs";

export async function recordAnalysisReview(formData: FormData) {
  await requireAdmin();
  const resultId = String(formData.get("result_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const correctedRaw = String(formData.get("corrected_output") ?? "").trim();
  const client = await createClient() as unknown as SupabaseClient<PostPhaseLDatabase>;
  let correctedOutput: Json | null = null;
  if (correctedRaw) {
    try {
      correctedOutput = JSON.parse(correctedRaw) as Json;
    } catch {
      throw new Error("수정 결과는 유효한 JSON이어야 합니다.");
    }
  }
  if (decision === "approve") {
    let effectiveOutput: Json | null = correctedOutput;
    if (!effectiveOutput) {
      const { data: result, error } = await client
        .from("notice_analysis_results")
        .select("structured_result")
        .eq("id", resultId)
        .single();
      if (error || !result) throw new Error("승인할 분석 결과를 찾을 수 없습니다.");
      effectiveOutput = result.structured_result;
    }
    const validation = validateSemanticReviewDecision({
      decision,
      correctedOutput: effectiveOutput,
    });
    if (!validation.valid) {
      throw new Error(`분석 schema 검증 실패: ${validation.errors[0] ?? "unknown"}`);
    }
  }
  const { error } = await client.rpc("record_notice_analysis_review", {
    p_result_id: resultId,
    p_decision: decision,
    p_corrected_output: correctedOutput,
    p_reason: reason,
    p_event_idempotency_key: `admin-analysis-review:${resultId}:${randomUUID()}`,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/analysis-review");
  revalidatePath(`/admin/analysis-review/${resultId}`);
}
