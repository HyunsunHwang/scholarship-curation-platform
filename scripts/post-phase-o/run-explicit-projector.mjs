import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { stableStringify } from "../../lib/post-phase-n-q/fingerprint.mjs";
import {
  assertNonproductionProjectorGate,
  APPROVED_NONPRODUCTION_PROJECT_REF,
} from "../../lib/post-phase-n-q/safety.mjs";
import {
  decideProjection,
  isExpiredDate,
} from "../../lib/post-phase-n-q/projection.mjs";

const ROOT = process.cwd();

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function loadEnvironment() {
  if (typeof process.loadEnvFile !== "function") return;
  const envPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

async function rows(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label} failed: ${error.message}`);
  return data ?? [];
}

function hash(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function writeJson(file, value) {
  const resolved = path.resolve(ROOT, file);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return path.relative(ROOT, resolved).replaceAll("\\", "/");
}

async function main() {
  loadEnvironment();
  const args = parseArgs(process.argv.slice(2));
  const reviewItemId = String(args["review-item-id"] ?? "").trim();
  if (!reviewItemId) throw new Error("--review-item-id <uuid> is required");
  const output =
    args.output ??
    `reports/post-phase-n-q/projector-${reviewItemId}.json`;
  const guard = assertNonproductionProjectorGate(process.env);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

  const client = createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const environmentRows = await rows(
    client
      .from("post_phase_l_environment_guard")
      .select("project_ref, environment_kind, automatic_public_publish_enabled")
      .limit(2),
    "environment guard",
  );
  const environment = environmentRows[0];
  if (
    environmentRows.length !== 1 ||
    environment.project_ref !== APPROVED_NONPRODUCTION_PROJECT_REF ||
    environment.environment_kind !== "non_production" ||
    environment.automatic_public_publish_enabled !== false
  ) {
    throw new Error("Runtime environment guard invariant failed");
  }

  const reviewItems = await rows(
    client
      .from("review_items")
      .select("id, notice_id, current_revision_id, review_scope, state")
      .eq("id", reviewItemId)
      .limit(1),
    "review item",
  );
  if (reviewItems.length !== 1) throw new Error("Review item not found");
  const reviewItem = reviewItems[0];
  const [effectiveRows, noticeRows, revisionRows, eventRowsBefore] =
    await Promise.all([
      rows(
        client
          .from("review_effective_decisions")
          .select("review_item_id, decision_event_id, decision, effective_at")
          .eq("review_item_id", reviewItemId)
          .limit(1),
        "effective decision",
      ),
      rows(
        client
          .from("ingestion_notices")
          .select("id, source_id, canonical_url, legacy_crawled_notice_id")
          .eq("id", reviewItem.notice_id)
          .limit(1),
        "notice",
      ),
      rows(
        client
          .from("ingestion_notice_revisions")
          .select("id, notice_id, title, body, normalized_payload, content_hash")
          .eq("id", reviewItem.current_revision_id)
          .limit(1),
        "revision",
      ),
      rows(
        client
          .from("review_decision_events")
          .select("id, review_item_id, revision_id, decision, intended_projection_action, supersedes_event_id, created_at")
          .eq("review_item_id", reviewItemId)
          .order("created_at"),
        "review event history before projection",
      ),
    ]);
  if (effectiveRows.length !== 1) throw new Error("Effective decision is missing");
  if (noticeRows.length !== 1 || revisionRows.length !== 1) {
    throw new Error("Notice or current revision is missing");
  }
  const notice = noticeRows[0];
  const revision = revisionRows[0];
  const effectiveDecision = effectiveRows[0];
  const legacyRows = await rows(
    client
      .from("crawled_notices")
      .select("id, scholarship_id, status")
      .eq("id", notice.legacy_crawled_notice_id)
      .limit(1),
    "legacy compatibility row",
  );
  if (legacyRows.length !== 1) {
    throw new Error("A reviewed legacy compatibility row is required");
  }
  const explicitScholarshipId = Number(args["scholarship-id"] ?? 0) || null;
  const scholarshipId = legacyRows[0].scholarship_id ?? explicitScholarshipId;
  if (scholarshipId == null) {
    throw new Error(
      "A linked candidate scholarship or explicit --scholarship-id is required",
    );
  }
  if (
    legacyRows[0].scholarship_id == null &&
    !eventRowsBefore.some((event) => event.decision === "approve")
  ) {
    throw new Error(
      "An explicit scholarship id requires a preserved prior approve event",
    );
  }
  const scholarshipSnapshotBefore = await rows(
    client
      .from("scholarships")
      .select("id, name, organization, apply_start_date, apply_end_date, apply_url, homepage_url, original_notice_text, is_verified, list_on_home, updated_at")
      .order("id"),
    "scholarship snapshot before projection",
  );
  const existingProjection = scholarshipSnapshotBefore.find(
    (row) => row.id === scholarshipId,
  );
  if (!existingProjection) throw new Error("Linked candidate scholarship is missing");

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const projectionDecision = decideProjection({
    existingProjection: {
      ...existingProjection,
      notice_id: notice.id,
    },
    notice,
    revision,
    effectiveDecision,
    today,
    projectedAt: now,
  });
  const desiredVisible =
    projectionDecision.public_state === "approve" &&
    !isExpiredDate(existingProjection.apply_end_date, today);
  const update = desiredVisible
    ? {
        name: revision.title,
        apply_url: notice.canonical_url,
        homepage_url: notice.canonical_url,
        original_notice_text: revision.body ?? "",
        is_verified: true,
        list_on_home: true,
      }
    : {
        is_verified: false,
        list_on_home: false,
      };
  const changedFields = Object.entries(update).filter(
    ([key, value]) => existingProjection[key] !== value,
  );
  if (changedFields.length > 0) {
    const { error } = await client
      .from("scholarships")
      .update(update)
      .eq("id", scholarshipId);
    if (error) throw new Error(`Projection update failed: ${error.message}`);
  }

  const [scholarshipSnapshotAfter, eventRowsAfter] = await Promise.all([
    rows(
      client
        .from("scholarships")
        .select("id, name, organization, apply_start_date, apply_end_date, apply_url, homepage_url, original_notice_text, is_verified, list_on_home, updated_at")
        .order("id"),
      "scholarship snapshot after projection",
    ),
    rows(
      client
        .from("review_decision_events")
        .select("id, review_item_id, revision_id, decision, intended_projection_action, supersedes_event_id, created_at")
        .eq("review_item_id", reviewItemId)
        .order("created_at"),
      "review event history after projection",
    ),
  ]);
  const beforeById = new Map(scholarshipSnapshotBefore.map((row) => [row.id, row]));
  const changedIds = scholarshipSnapshotAfter
    .filter((row) => stableStringify(row) !== stableStringify(beforeById.get(row.id)))
    .map((row) => row.id);
  const unrelatedChangedIds = changedIds.filter((id) => id !== scholarshipId);
  if (unrelatedChangedIds.length > 0) {
    throw new Error(`Unrelated scholarships changed: ${unrelatedChangedIds.join(", ")}`);
  }
  if (hash(eventRowsBefore) !== hash(eventRowsAfter)) {
    throw new Error("Review event history changed during projection");
  }
  const projected = scholarshipSnapshotAfter.find((row) => row.id === scholarshipId);
  const report = {
    generated_at: now,
    contract_version: "post-phase-o-explicit-projector/v1",
    evidence_kind: "database_nonproduction",
    target_project_ref: APPROVED_NONPRODUCTION_PROJECT_REF,
    correlation_id: crypto.randomUUID(),
    review_item_id: reviewItemId,
    notice_id: notice.id,
    revision_id: revision.id,
    effective_review_event_id: effectiveDecision.decision_event_id,
    effective_decision: effectiveDecision.decision,
    public_state: projectionDecision.public_state,
    action: changedFields.length === 0 ? "idempotent_noop" : projectionDecision.action,
    scholarship_id: scholarshipId,
    projected_visible:
      projected?.is_verified === true && projected?.list_on_home === true,
    duplicate_projection_count: 0,
    unrelated_row_change_count: unrelatedChangedIds.length,
    review_event_mutation_count: 0,
    automatic_public_publish_count: 0,
    explicit_operator_action: true,
    production_access_performed: false,
    production_write_performed: false,
    guard,
    passed:
      unrelatedChangedIds.length === 0 &&
      hash(eventRowsBefore) === hash(eventRowsAfter),
  };
  const reportPath = writeJson(output, report);
  console.log(JSON.stringify({
    passed: report.passed,
    action: report.action,
    projected_visible: report.projected_visible,
    report_path: reportPath,
    production_access_performed: false,
  }, null, 2));
}

await main();
