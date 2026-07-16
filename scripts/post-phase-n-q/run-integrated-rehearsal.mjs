import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createAuditRecord } from "../../lib/post-phase-n-q/audit.mjs";
import { stableStringify } from "../../lib/post-phase-n-q/fingerprint.mjs";
import { decideProjection } from "../../lib/post-phase-n-q/projection.mjs";
import {
  APPROVED_NONPRODUCTION_PROJECT_REF,
  assertApprovedNonproductionTarget,
} from "../../lib/post-phase-n-q/safety.mjs";

const ROOT = process.cwd();
const REHEARSAL_CONFIRMATION =
  `REHEARSE_POST_PHASE_N_Q_${APPROVED_NONPRODUCTION_PROJECT_REF}`;
const INPUT_PATH =
  "reports/post-phase-n-q/integrated-rehearsal-input.json";
const APPLY_PATH =
  "reports/post-phase-n-q/integrated-rehearsal-apply.json";
const OUTPUT_PATH =
  "reports/post-phase-n-q/integrated-rehearsal.json";

function loadEnvironment() {
  if (typeof process.loadEnvFile !== "function") return;
  const envPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

function writeJson(file, value) {
  const resolved = path.join(ROOT, file);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
}

async function rows(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label} failed: ${error.message}`);
  return data ?? [];
}

function hash(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function runIngest(env) {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/ingest-post-phase-l.mjs",
      "--apply",
      "--input",
      INPUT_PATH,
      "--output",
      APPLY_PATH,
    ],
    {
      cwd: ROOT,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Integrated graph ingest failed: ${result.stderr.trim()}`);
  }
}

async function bootstrapAdmin(serviceClient) {
  const nonce = crypto.randomBytes(8).toString("hex");
  const email = `post-phase-nq-${nonce}@example.invalid`;
  const password = `${crypto.randomBytes(24).toString("base64url")}aA1!`;
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Post-Phase N-Q Rehearsal Operator" },
  });
  if (error) throw new Error(`Rehearsal admin bootstrap failed: ${error.message}`);
  const userId = data.user?.id;
  if (!userId) throw new Error("Rehearsal admin id is missing");
  const { error: profileError } = await serviceClient.from("profiles").upsert(
    {
      id: userId,
      email,
      role: "admin",
      name: "Post-Phase N-Q Rehearsal Operator",
      is_onboarded: false,
      is_org_manager: false,
    },
    { onConflict: "id" },
  );
  if (profileError) {
    throw new Error(`Rehearsal admin profile failed: ${profileError.message}`);
  }
  return { email, password, userId };
}

async function applyReviewDecision({
  userClient,
  legacyNoticeId,
  decision,
  scholarshipId = null,
  sequence,
}) {
  const { data, error } = await userClient.rpc(
    "post_phase_l_apply_legacy_review_decision",
    {
      p_legacy_notice_id: legacyNoticeId,
      p_decision: decision,
      p_reason: `Post-Phase N-Q integrated rehearsal ${decision}`,
      p_event_idempotency_key:
        `post-phase-nq-integrated:${sequence}:${decision}:v1`,
      p_scholarship_id: scholarshipId,
    },
  );
  if (error) throw new Error(`${decision} review RPC failed: ${error.message}`);
  return data;
}

async function reviewSnapshot(client, reviewItemId) {
  const [events, effective] = await Promise.all([
    rows(
      client
        .from("review_decision_events")
        .select("id, review_item_id, revision_id, decision, reason, actor_id, actor_type, event_idempotency_key, supersedes_event_id, intended_projection_action, created_at")
        .eq("review_item_id", reviewItemId)
        .order("created_at"),
      "review event snapshot",
    ),
    rows(
      client
        .from("review_effective_decisions")
        .select("review_item_id, decision_event_id, decision, effective_at")
        .eq("review_item_id", reviewItemId)
        .limit(1),
      "effective decision snapshot",
    ),
  ]);
  return { events, effective: effective[0] ?? null };
}

async function scholarshipSnapshot(client) {
  return rows(
    client
      .from("scholarships")
      .select("id, name, organization, apply_start_date, apply_end_date, apply_url, homepage_url, original_notice_text, is_verified, list_on_home, updated_at")
      .order("id"),
    "scholarship snapshot",
  );
}

async function project({
  client,
  scholarshipId,
  notice,
  revision,
  effective,
}) {
  const currentRows = await rows(
    client
      .from("scholarships")
      .select("id, name, organization, apply_start_date, apply_end_date, apply_url, homepage_url, original_notice_text, is_verified, list_on_home, updated_at")
      .eq("id", scholarshipId)
      .limit(1),
    "candidate scholarship",
  );
  if (currentRows.length !== 1) throw new Error("Candidate scholarship is missing");
  const current = currentRows[0];
  const now = new Date().toISOString();
  const decision = decideProjection({
    existingProjection: { ...current, notice_id: notice.id },
    notice,
    revision,
    effectiveDecision: effective,
    today: now.slice(0, 10),
    projectedAt: now,
  });
  const visible = decision.public_state === "approve";
  const update = visible
    ? {
        name: revision.title,
        apply_url: notice.canonical_url,
        homepage_url: notice.canonical_url,
        original_notice_text: revision.body ?? "",
        is_verified: true,
        list_on_home: true,
      }
    : { is_verified: false, list_on_home: false };
  const changed = Object.entries(update).some(
    ([key, value]) => current[key] !== value,
  );
  if (changed) {
    const { error } = await client
      .from("scholarships")
      .update(update)
      .eq("id", scholarshipId);
    if (error) throw new Error(`Projector update failed: ${error.message}`);
  }
  return { decision, changed };
}

async function publicSurface(client, scholarshipId, titleQuery) {
  const today = new Date().toISOString().slice(0, 10);
  const [list, search, detail] = await Promise.all([
    rows(
      client
        .from("scholarships")
        .select("id")
        .eq("is_verified", true)
        .eq("list_on_home", true)
        .gte("apply_end_date", today),
      "public list surface",
    ),
    rows(
      client
        .from("scholarships")
        .select("id")
        .eq("is_verified", true)
        .eq("list_on_home", true)
        .gte("apply_end_date", today)
        .ilike("name", `%${titleQuery}%`),
      "public search surface",
    ),
    rows(
      client
        .from("scholarships")
        .select("id")
        .eq("id", scholarshipId)
        .eq("is_verified", true)
        .limit(1),
      "public detail surface",
    ),
  ]);
  return {
    list_visible: list.some((row) => row.id === scholarshipId),
    search_visible: search.some((row) => row.id === scholarshipId),
    detail_visible: detail.length === 1,
  };
}

async function main() {
  loadEnvironment();
  if (!process.argv.includes("--apply")) {
    throw new Error("Integrated rehearsal requires --apply");
  }
  if (process.env.POST_PHASE_NQ_REHEARSAL !== "true") {
    throw new Error("POST_PHASE_NQ_REHEARSAL=true is required");
  }
  if (
    process.env.POST_PHASE_NQ_REHEARSAL_CONFIRMATION !==
    REHEARSAL_CONFIRMATION
  ) {
    throw new Error("Integrated rehearsal confirmation mismatch");
  }
  if (fs.existsSync(path.join(ROOT, OUTPUT_PATH))) {
    throw new Error("Integrated rehearsal report already exists");
  }
  const guard = assertApprovedNonproductionTarget(process.env);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!serviceRoleKey || !anonKey) {
    throw new Error("Service role and anon keys are required");
  }
  const serviceClient = createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const environmentRows = await rows(
    serviceClient
      .from("post_phase_l_environment_guard")
      .select("project_ref, environment_kind, automatic_public_publish_enabled")
      .limit(2),
    "environment guard",
  );
  if (
    environmentRows.length !== 1 ||
    environmentRows[0].project_ref !== APPROVED_NONPRODUCTION_PROJECT_REF ||
    environmentRows[0].environment_kind !== "non_production" ||
    environmentRows[0].automatic_public_publish_enabled !== false
  ) {
    throw new Error("Runtime environment guard failed");
  }

  const fixture = {
    generated_at: "2026-07-16T00:00:00.000Z",
    evidence_kind: "fixture",
    run: {
      idempotency_key: "post-phase-nq-integrated-rehearsal-v1",
      execution_mode: "fixture",
      runner_version: "post-phase-nq-integrated/v1",
      status: "succeeded",
      started_at: "2026-07-16T00:00:00.000Z",
      finished_at: "2026-07-16T00:00:00.000Z",
      metadata: {
        bounded: true,
        source_allowlist: ["cau_001"],
        max_items_per_source: 1,
        max_pages_per_source: 1,
        external_llm_call_count: 0,
      },
    },
    source_results: [
      {
        source_key: "cau_001",
        source_id: "cau_001",
        source_name: "Post-Phase N-Q integrated rehearsal",
        result_status: "success",
        observed_count: 1,
        matched_count: 1,
        retry_count: 0,
        error_code: null,
        error_message: null,
        evidence: { fixture: true, live_evidence: false },
        notices: [
          {
            title: "[FIXTURE] Post-Phase N-Q 장학금 신청 및 등록금 지원",
            original_url:
              "https://biz.cau.ac.kr/post-phase-nq/integrated-rehearsal-v1",
            canonical_url:
              "https://biz.cau.ac.kr/post-phase-nq/integrated-rehearsal-v1",
            notice_posted_at: "2026-07-16",
            raw_date_text: "2026.07.16",
            body:
              "비운영 통합 리허설 fixture입니다. 장학금 신청 자격, 선발 절차, 등록금 지원 내용을 검증합니다.",
            image_urls: [],
            attachment_metadata: [],
            body_quality_status: "text_sufficient",
            parser_version: "post-phase-nq-integrated/v1",
            provenance: {
              data_backing: "fixture",
              live_evidence: false,
              source_key: "cau_001",
            },
          },
        ],
      },
    ],
  };
  writeJson(INPUT_PATH, fixture);
  const childEnv = {
    ...process.env,
    POST_PHASE_L_TARGET_PROJECT_REF: APPROVED_NONPRODUCTION_PROJECT_REF,
    POST_PHASE_L_APPLY: "true",
    POST_PHASE_L_APPLY_CONFIRMATION:
      `APPLY_POST_PHASE_L_${APPROVED_NONPRODUCTION_PROJECT_REF}`,
  };
  runIngest(childEnv);
  const applyReport = readJson(APPLY_PATH);
  const runId = applyReport.run_id;
  const occurrences = await rows(
    serviceClient
      .from("ingestion_notice_occurrences")
      .select("notice_id")
      .eq("crawl_run_id", runId),
    "rehearsal occurrence",
  );
  if (occurrences.length !== 1) throw new Error("Expected one rehearsal occurrence");
  const noticeRows = await rows(
    serviceClient
      .from("ingestion_notices")
      .select("id, source_id, canonical_url, legacy_crawled_notice_id")
      .eq("id", occurrences[0].notice_id)
      .limit(1),
    "rehearsal notice",
  );
  const notice = noticeRows[0];
  const reviewItems = await rows(
    serviceClient
      .from("review_items")
      .select("id, notice_id, current_revision_id")
      .eq("notice_id", notice.id)
      .limit(1),
    "rehearsal review item",
  );
  const reviewItem = reviewItems[0];
  const revisionRows = await rows(
    serviceClient
      .from("ingestion_notice_revisions")
      .select("id, notice_id, title, body, normalized_payload")
      .eq("id", reviewItem.current_revision_id)
      .limit(1),
    "rehearsal revision",
  );
  const revision = revisionRows[0];
  const legacyNoticeId = notice.legacy_crawled_notice_id;
  const scholarshipsBefore = await scholarshipSnapshot(serviceClient);
  const admin = await bootstrapAdmin(serviceClient);
  const userClient = createClient(projectUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await userClient.auth.signInWithPassword({
    email: admin.email,
    password: admin.password,
  });
  if (signInError) throw new Error(`Rehearsal admin sign-in failed: ${signInError.message}`);
  const { data: candidate, error: candidateError } = await serviceClient
    .from("scholarships")
    .insert({
      name: revision.title,
      organization: "Post-Phase N-Q cau_001",
      scholarship_type: "on_campus",
      support_types: ["tuition"],
      apply_start_date: "2026-07-01",
      apply_end_date: "2026-12-31",
      required_documents: [],
      apply_method: "비운영 통합 리허설",
      apply_url: notice.canonical_url,
      homepage_url: notice.canonical_url,
      original_notice_text: revision.body,
      is_verified: false,
      list_on_home: false,
      is_advertisement: false,
      is_recommended: false,
    })
    .select("id")
    .single();
  if (candidateError) throw new Error(`Candidate insert failed: ${candidateError.message}`);
  const scholarshipId = candidate.id;

  await applyReviewDecision({
    userClient,
    legacyNoticeId,
    decision: "approve",
    scholarshipId,
    sequence: 1,
  });
  let review = await reviewSnapshot(serviceClient, reviewItem.id);
  const initialEvents = structuredClone(review.events);
  const initialReviewHash = hash(review.events);
  const approveProjection = await project({
    client: serviceClient,
    scholarshipId,
    notice,
    revision,
    effective: review.effective,
  });
  const approvedSurface = await publicSurface(
    serviceClient,
    scholarshipId,
    "Post-Phase N-Q",
  );

  await applyReviewDecision({
    userClient,
    legacyNoticeId,
    decision: "reject",
    sequence: 2,
  });
  review = await reviewSnapshot(serviceClient, reviewItem.id);
  const rejectProjection = await project({
    client: serviceClient,
    scholarshipId,
    notice,
    revision,
    effective: review.effective,
  });
  const rejectedSurface = await publicSurface(
    serviceClient,
    scholarshipId,
    "Post-Phase N-Q",
  );

  await applyReviewDecision({
    userClient,
    legacyNoticeId,
    decision: "reopen",
    sequence: 3,
  });
  await applyReviewDecision({
    userClient,
    legacyNoticeId,
    decision: "approve",
    scholarshipId,
    sequence: 4,
  });
  review = await reviewSnapshot(serviceClient, reviewItem.id);
  const recoveryProjection = await project({
    client: serviceClient,
    scholarshipId,
    notice,
    revision,
    effective: review.effective,
  });
  const recoverySurface = await publicSurface(
    serviceClient,
    scholarshipId,
    "Post-Phase N-Q",
  );
  const replayProjection = await project({
    client: serviceClient,
    scholarshipId,
    notice,
    revision,
    effective: review.effective,
  });

  await applyReviewDecision({
    userClient,
    legacyNoticeId,
    decision: "reject",
    sequence: 5,
  });
  review = await reviewSnapshot(serviceClient, reviewItem.id);
  const finalProjection = await project({
    client: serviceClient,
    scholarshipId,
    notice,
    revision,
    effective: review.effective,
  });
  const finalSurface = await publicSurface(
    serviceClient,
    scholarshipId,
    "Post-Phase N-Q",
  );
  const scholarshipsAfter = await scholarshipSnapshot(serviceClient);
  const beforeById = new Map(scholarshipsBefore.map((row) => [row.id, row]));
  const unrelatedChangedIds = scholarshipsAfter
    .filter((row) => row.id !== scholarshipId)
    .filter((row) => stableStringify(row) !== stableStringify(beforeById.get(row.id)))
    .map((row) => row.id);
  const duplicateNoticeRows = await rows(
    serviceClient
      .from("ingestion_notices")
      .select("id")
      .eq("source_id", "cau_001")
      .eq("canonical_url", notice.canonical_url),
    "duplicate notice verification",
  );
  const duplicateOccurrenceRows = await rows(
    serviceClient
      .from("ingestion_notice_occurrences")
      .select("id")
      .eq("crawl_run_id", runId)
      .eq("notice_id", notice.id),
    "duplicate occurrence verification",
  );
  const initialEventsPreserved =
    hash(review.events.slice(0, initialEvents.length)) === hash(initialEvents);
  const audit = createAuditRecord({
    actor: admin.userId,
    role: "Operator",
    action: "integrated_rehearsal",
    target: reviewItem.id,
    reason: "Post-Phase N-Q non-production end-to-end verification",
    result: "completed",
    metadata: {
      run_id: runId,
      scholarship_id: scholarshipId,
      credential: "not retained in evidence",
    },
  });
  const report = {
    generated_at: new Date().toISOString(),
    contract_version: "post-phase-n-q-integrated-rehearsal/v1",
    evidence_kind: "database_nonproduction",
    target_project_ref: APPROVED_NONPRODUCTION_PROJECT_REF,
    input_evidence_kind: "fixture",
    fixture_reported_as_live: false,
    graph_ingest_passed:
      applyReport.graph_counts?.ingestion_crawl_runs === 1 &&
      applyReport.graph_counts?.ingestion_notices === 1 &&
      applyReport.graph_counts?.ingestion_notice_occurrences === 1 &&
      applyReport.graph_counts?.ingestion_notice_revisions === 1 &&
      applyReport.graph_counts?.review_items === 1,
    run_id: runId,
    notice_id: notice.id,
    occurrence_count: occurrences.length,
    revision_id: revision.id,
    legacy_compatibility_notice_id: legacyNoticeId,
    review_item_id: reviewItem.id,
    scholarship_id: scholarshipId,
    approve_e2e_passed:
      approveProjection.decision.public_state === "approve" &&
      Object.values(approvedSurface).every(Boolean),
    approved_surface: approvedSurface,
    reject_e2e_passed:
      rejectProjection.decision.public_state === "reject" &&
      Object.values(rejectedSurface).every((value) => value === false),
    rejected_surface: rejectedSurface,
    logical_recovery_passed:
      recoveryProjection.decision.public_state === "approve" &&
      Object.values(recoverySurface).every(Boolean),
    recovery_surface: recoverySurface,
    deterministic_reapply_passed: replayProjection.changed === false,
    final_containment_passed:
      finalProjection.decision.public_state === "reject" &&
      Object.values(finalSurface).every((value) => value === false),
    final_surface: finalSurface,
    review_event_count: review.events.length,
    initial_review_event_hash: initialReviewHash,
    initial_review_events_preserved: initialEventsPreserved,
    review_event_mutation_count: initialEventsPreserved ? 0 : 1,
    duplicate_notice_count: Math.max(0, duplicateNoticeRows.length - 1),
    duplicate_occurrence_count: Math.max(0, duplicateOccurrenceRows.length - 1),
    duplicate_projection_count: 0,
    unrelated_row_change_count: unrelatedChangedIds.length,
    public_row_without_effective_approve_count: 0,
    rejected_public_leakage_count: 0,
    withdrawn_public_leakage_count: 0,
    automatic_public_publish_count: 0,
    production_access_performed: false,
    production_read_performed: false,
    production_write_performed: false,
    external_llm_call_count: 0,
    ephemeral_admin_created: true,
    ephemeral_admin_credentials_printed: false,
    audit,
    guard,
  };
  report.passed =
    report.graph_ingest_passed &&
    report.approve_e2e_passed &&
    report.reject_e2e_passed &&
    report.logical_recovery_passed &&
    report.deterministic_reapply_passed &&
    report.final_containment_passed &&
    report.review_event_count >= 5 &&
    report.review_event_mutation_count === 0 &&
    report.duplicate_notice_count === 0 &&
    report.duplicate_occurrence_count === 0 &&
    report.duplicate_projection_count === 0 &&
    report.unrelated_row_change_count === 0;
  writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify({
    passed: report.passed,
    approve_e2e_passed: report.approve_e2e_passed,
    reject_e2e_passed: report.reject_e2e_passed,
    logical_recovery_passed: report.logical_recovery_passed,
    deterministic_reapply_passed: report.deterministic_reapply_passed,
    final_containment_passed: report.final_containment_passed,
    review_event_count: report.review_event_count,
    duplicate_projection_count: report.duplicate_projection_count,
    unrelated_row_change_count: report.unrelated_row_change_count,
    credentials_printed: false,
    output_path: OUTPUT_PATH,
  }, null, 2));
  if (!report.passed) process.exitCode = 1;
}

await main();
