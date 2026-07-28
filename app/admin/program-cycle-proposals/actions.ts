"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/require-admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import type { PostPhaseLDatabase } from "@/lib/post-phase-l/database.types";
import { analysisSha256 } from "@/lib/analysis/analysis-identifiers.mjs";

function jsonObject(formData: FormData, key: string): Json {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw) as Json;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(`${key} must be a JSON object`);
  }
  return parsed;
}

export async function reviewProgramCycleProposal(formData: FormData) {
  await requireAdmin();
  const proposalId = String(formData.get("proposal_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const client = await createClient() as unknown as SupabaseClient<PostPhaseLDatabase>;
  const { error } = await client.rpc("approve_scholarship_program_cycle_proposal", {
    p_proposal_id: proposalId,
    p_decision: decision,
    p_existing_program_id: String(formData.get("existing_program_id") ?? "") || null,
    p_existing_cycle_id: String(formData.get("existing_cycle_id") ?? "") || null,
    p_program_patch: jsonObject(formData, "program_patch"),
    p_cycle_patch: jsonObject(formData, "cycle_patch"),
    p_reason: String(formData.get("reason") ?? "").trim() || null,
    p_event_idempotency_key: `proposal-review:${proposalId}:${randomUUID()}`,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/program-cycle-proposals");
  revalidatePath(`/admin/program-cycle-proposals/${proposalId}`);
}

export async function projectApprovedCycle(formData: FormData) {
  await requireAdmin();
  const proposalId = String(formData.get("proposal_id") ?? "");
  const cycleId = String(formData.get("cycle_id") ?? "");
  const client = await createClient() as unknown as SupabaseClient<PostPhaseLDatabase>;
  const { error } = await client.rpc("project_scholarship_cycle", {
    p_cycle_id: cycleId,
    p_projection_fingerprint: analysisSha256(`scholarship-projection-v1|${cycleId}`),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/program-cycle-proposals/${proposalId}`);
}
