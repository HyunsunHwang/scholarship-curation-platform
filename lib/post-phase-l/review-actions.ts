import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import type { PostPhaseLDatabase } from "./database.types";
import { isPostPhaseLEnvironment } from "./runtime";

type ExistingClient = Awaited<ReturnType<typeof createClient>>;

export async function applyPostPhaseLReviewDecision(params: {
  supabase: ExistingClient;
  noticeId: number;
  decision: "approve" | "reject" | "needs_review" | "reopen";
  reason?: string | null;
  scholarshipId?: number | null;
}) {
  if (!isPostPhaseLEnvironment()) return { handled: false as const, error: null };
  const client = params.supabase as unknown as SupabaseClient<PostPhaseLDatabase>;
  const { error } = await client.rpc("post_phase_l_apply_legacy_review_decision", {
    p_legacy_notice_id: params.noticeId,
    p_decision: params.decision,
    p_reason: params.reason?.trim() || null,
    p_event_idempotency_key: `admin:${params.noticeId}:${params.decision}:${randomUUID()}`,
    p_scholarship_id: params.scholarshipId ?? null,
  });
  return { handled: true as const, error: error?.message ?? null };
}
