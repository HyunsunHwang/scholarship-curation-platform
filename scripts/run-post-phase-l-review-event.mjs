import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPostPhaseLTarget } from "../lib/post-phase-l/target-guard.mjs";

const __filename = fileURLToPath(import.meta.url);
const DEFAULT_OUTPUT = "reports/post-phase-l-live/review-event-report.json";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function loadLocalEnvironment() {
  if (typeof process.loadEnvFile !== "function") return;
  const envPath = path.resolve(".env.local");
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return resolved;
}

function resolveRunId(args) {
  if (typeof args["run-id"] === "string") return args["run-id"];
  if (typeof args["run-report"] === "string") {
    const report = readJson(args["run-report"]);
    if (typeof report.run_id === "string") return report.run_id;
  }
  throw new Error("Provide --run-id <uuid> or --run-report <apply-report.json>");
}

async function queryRows(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label} failed: ${error.message}`);
  return data ?? [];
}

async function bootstrapEphemeralAdmin({ serviceClient, targetRef }) {
  const nonce = crypto.randomBytes(8).toString("hex");
  const email = `post-phase-l-${targetRef}-${nonce}@example.invalid`;
  const password = `${crypto.randomBytes(24).toString("base64url")}aA1!`;
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Post-Phase L Ephemeral Admin" },
  });
  if (error) throw new Error(`ephemeral admin auth bootstrap failed: ${error.message}`);
  const userId = data.user?.id;
  if (!userId) throw new Error("ephemeral admin user id missing");

  const { error: profileError } = await serviceClient.from("profiles").upsert(
    {
      id: userId,
      email,
      role: "admin",
      name: "Post-Phase L Ephemeral Admin",
      is_onboarded: false,
      is_org_manager: false,
    },
    { onConflict: "id" },
  );
  if (profileError) throw new Error(`ephemeral admin profile bootstrap failed: ${profileError.message}`);
  return { email, password, userId };
}

async function resolveLegacyNotice(serviceClient, runId, sourceKey = "") {
  const occurrences = await queryRows(
    serviceClient
      .from("ingestion_notice_occurrences")
      .select("notice_id")
      .eq("crawl_run_id", runId),
    "occurrence readback",
  );
  const noticeIds = [...new Set(occurrences.map((row) => row.notice_id).filter(Boolean))];
  if (noticeIds.length === 0) throw new Error(`run ${runId} has no graph notices`);
  const notices = await queryRows(
    serviceClient
      .from("ingestion_notices")
      .select("id, source_id, canonical_url, legacy_crawled_notice_id")
      .in("id", noticeIds),
    "notice readback",
  );
  const linked = notices.find(
    (row) => row.legacy_crawled_notice_id != null && (!sourceKey || row.source_id === sourceKey),
  );
  if (!linked) throw new Error(`run ${runId} has no linked compatibility notice`);
  const legacyRows = await queryRows(
    serviceClient
      .from("crawled_notices")
      .select("id, status, scholarship_id, title, source_id, notice_url")
      .eq("id", linked.legacy_crawled_notice_id)
      .limit(1),
    "legacy notice readback",
  );
  if (legacyRows.length !== 1) throw new Error("linked compatibility notice was not found");
  if (legacyRows[0].status !== "new" || legacyRows[0].scholarship_id !== null) {
    throw new Error("review event test requires a new, unlinked compatibility notice");
  }
  return { notice: linked, legacy: legacyRows[0] };
}

async function createHiddenScholarship(serviceClient, legacy) {
  const { data, error } = await serviceClient
    .from("scholarships")
    .insert({
      name: legacy.title,
      organization: `Post-Phase L ${legacy.source_id}`,
      scholarship_type: "on_campus",
      support_types: ["tuition"],
      apply_start_date: "2026-01-01",
      apply_end_date: "2026-12-31",
      required_documents: [],
      apply_method: "Post-Phase L controlled preview only",
      apply_url: legacy.notice_url,
      homepage_url: legacy.notice_url,
      original_notice_text: "Post-Phase L controlled projection preview fixture.",
      is_verified: false,
      list_on_home: false,
      is_advertisement: false,
      is_recommended: false,
    })
    .select("id, is_verified, list_on_home")
    .single();
  if (error) throw new Error(`hidden scholarship preview row insert failed: ${error.message}`);
  if (!data || data.is_verified !== false || data.list_on_home !== false) {
    throw new Error("hidden scholarship preview row must remain unpublished");
  }
  return data.id;
}

async function readReviewEvidence(serviceClient, legacyId) {
  const notices = await queryRows(
    serviceClient
      .from("ingestion_notices")
      .select("id, source_id, canonical_url, legacy_crawled_notice_id")
      .eq("legacy_crawled_notice_id", legacyId)
      .limit(1),
    "graph notice evidence",
  );
  if (notices.length !== 1) throw new Error("graph notice evidence missing");
  const reviewItems = await queryRows(
    serviceClient
      .from("review_items")
      .select("id, notice_id, current_revision_id, review_scope, state")
      .eq("notice_id", notices[0].id)
      .eq("review_scope", "scholarship_notice")
      .limit(1),
    "review item evidence",
  );
  if (reviewItems.length !== 1) throw new Error("review item evidence missing");
  const events = await queryRows(
    serviceClient
      .from("review_decision_events")
      .select("id, review_item_id, revision_id, decision, intended_projection_action, supersedes_event_id")
      .eq("review_item_id", reviewItems[0].id)
      .order("created_at", { ascending: true }),
    "review event evidence",
  );
  const effective = await queryRows(
    serviceClient
      .from("review_effective_decisions")
      .select("review_item_id, decision_event_id, decision")
      .eq("review_item_id", reviewItems[0].id),
    "effective decision evidence",
  );
  const evidenceRefs = events.length === 0
    ? []
    : await queryRows(
        serviceClient
          .from("review_evidence_references")
          .select("decision_event_id, evidence_type, evidence_id")
          .in("decision_event_id", events.map((event) => event.id)),
        "evidence reference readback",
      );
  const legacyRows = await queryRows(
    serviceClient
      .from("crawled_notices")
      .select("id, status, scholarship_id, review_note")
      .eq("id", legacyId)
      .limit(1),
    "legacy post-review evidence",
  );
  return {
    graph_notice: notices[0],
    review_item: reviewItems[0],
    events,
    effective,
    evidence_references: evidenceRefs,
    legacy_notice: legacyRows[0] ?? null,
  };
}

async function main() {
  const workflowStartedAt = Date.now();
  const args = parseArgs(process.argv.slice(2));
  if (args.apply !== true) {
    throw new Error("Post-Phase L review event execution requires the explicit --apply flag");
  }
  loadLocalEnvironment();
  const guard = assertPostPhaseLTarget(process.env, {
    requireApply: true,
    additionalInputs: process.argv.slice(2),
  });
  const runId = resolveRunId(args);
  const decision = typeof args.decision === "string" ? args.decision : "needs_review";
  if (!["approve", "reject", "needs_review", "reopen"].includes(decision)) {
    throw new Error(`Unsupported review decision: ${decision}`);
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!serviceRoleKey || !anonKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
  }

  const { createClient } = await import("@supabase/supabase-js");
  const serviceClient = createClient(guard.target_project_url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: environmentError } = await serviceClient.rpc("post_phase_l_assert_environment");
  if (environmentError) {
    throw new Error(`Post-Phase L environment assertion failed: ${environmentError.message}`);
  }

  const sourceKey = typeof args.source === "string" ? args.source : "";
  const { legacy } = await resolveLegacyNotice(serviceClient, runId, sourceKey);
  const previewStartedAt = Date.now();
  const scholarshipId = decision === "approve"
    ? await createHiddenScholarship(serviceClient, legacy)
    : null;
  const previewGenerationDurationMs = decision === "approve"
    ? Date.now() - previewStartedAt
    : 0;
  const admin = await bootstrapEphemeralAdmin({
    serviceClient,
    targetRef: guard.target_project_ref,
  });
  const userClient = createClient(guard.target_project_url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await userClient.auth.signInWithPassword({
    email: admin.email,
    password: admin.password,
  });
  if (signInError) throw new Error(`ephemeral admin sign-in failed: ${signInError.message}`);

  const eventKey = `runtime:${runId}:${legacy.source_id}:${decision}:v1`;
  const rpcStartedAt = Date.now();
  const { data: rpcResult, error: rpcError } = await userClient.rpc(
    "post_phase_l_apply_legacy_review_decision",
    {
      p_legacy_notice_id: legacy.id,
      p_decision: decision,
      p_reason: `Runtime vertical slice ${decision} review event; preview only.`,
      p_event_idempotency_key: eventKey,
      p_scholarship_id: scholarshipId,
    },
  );
  const reviewRpcDurationMs = Date.now() - rpcStartedAt;
  if (rpcError) {
    const { error: cleanupError } = await serviceClient.auth.admin.deleteUser(admin.userId);
    if (cleanupError) {
      throw new Error(`review event RPC failed: ${rpcError.message}; ephemeral admin cleanup failed`);
    }
    throw new Error(`review event RPC failed: ${rpcError.message}`);
  }

  const evidence = await readReviewEvidence(serviceClient, legacy.id);
  const effectiveMatchesLatest =
    evidence.effective.length === 1 &&
    evidence.events.some(
      (event) =>
        event.id === evidence.effective[0].decision_event_id &&
        event.decision === evidence.effective[0].decision,
    );
  const previewOnly = evidence.events.every(
    (event) => event.intended_projection_action === "preview_only",
  );
  const publicLeakageRows = await queryRows(
    serviceClient
      .from("scholarships")
      .select("id")
      .or("is_verified.eq.true,list_on_home.eq.true"),
    "public leakage readback",
  );

  const report = {
    generated_at: new Date().toISOString(),
    stage: "approved_l_project_append_only_review_event",
    target_project_ref: guard.target_project_ref,
    target_project_ref_match: guard.target_project_ref_match,
    production_ref_detected: false,
    production_read_performed: false,
    production_write_performed: false,
    l_project_remote_read_performed: true,
    l_project_remote_write_performed: true,
    environment_values_printed: false,
    credential_values_printed: false,
    run_id: runId,
    source_key: legacy.source_id,
    legacy_notice_id: legacy.id,
    decision,
    hidden_scholarship_preview_row_created: scholarshipId !== null,
    hidden_scholarship_id_present: scholarshipId !== null,
    rpc_duplicate: rpcResult?.duplicate === true,
    append_only_review_event_count: evidence.events.length,
    effective_decision_count: evidence.effective.length,
    effective_decision_match: effectiveMatchesLatest,
    evidence_reference_count: evidence.evidence_references.length,
    intended_projection_action: "preview_only",
    controlled_projection_preview_enabled: previewOnly,
    automatic_public_publish_count: 0,
    public_leakage_count: publicLeakageRows.length,
    external_llm_call_count: 0,
    external_llm_persistence_added: false,
    ephemeral_admin_created: true,
    ephemeral_admin_user_id_present: Boolean(admin.userId),
    ephemeral_admin_cleanup_status: "retained_as_immutable_review_event_actor",
    latency_kind: "system_workflow_latency",
    review_rpc_duration_ms: reviewRpcDurationMs,
    preview_generation_duration_ms: previewGenerationDurationMs,
    total_review_workflow_duration_ms: Date.now() - workflowStartedAt,
    passed:
      evidence.events.length >= 1 &&
      effectiveMatchesLatest &&
      evidence.evidence_references.length >= 1 &&
      previewOnly &&
      publicLeakageRows.length === 0,
  };
  const outputPath = writeJson(args.output ?? DEFAULT_OUTPUT, report);
  console.log(`post_phase_l_review_event_passed=${report.passed}`);
  console.log("credential_values_printed=false");
  console.log("production_read_performed=false");
  console.log("production_write_performed=false");
  console.log(`report=${outputPath}`);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  });
}
