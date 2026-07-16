import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  APPROVED_NONPRODUCTION_PROJECT_REF,
  assertApprovedNonproductionTarget,
} from "../../lib/post-phase-n-q/safety.mjs";

const ROOT = process.cwd();

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

function alert(code, severity, ids, message) {
  return { code, severity, count: ids.length, target_ids: ids, message };
}

async function main() {
  loadEnvironment();
  const guard = assertApprovedNonproductionTarget(process.env);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  const client = createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [
    environmentRows,
    scholarships,
    legacyRows,
    notices,
    reviewItems,
    effective,
    reviewEvents,
  ] = await Promise.all([
    rows(
      client
        .from("post_phase_l_environment_guard")
        .select("project_ref, environment_kind, automatic_public_publish_enabled")
        .limit(2),
      "environment guard",
    ),
    rows(
      client
        .from("scholarships")
        .select("id, is_verified, list_on_home, apply_end_date"),
      "scholarships",
    ),
    rows(
      client
        .from("crawled_notices")
        .select("id, scholarship_id, status"),
      "legacy compatibility",
    ),
    rows(
      client
        .from("ingestion_notices")
        .select("id, legacy_crawled_notice_id"),
      "ingestion notices",
    ),
    rows(
      client.from("review_items").select("id, notice_id, state"),
      "review items",
    ),
    rows(
      client
        .from("review_effective_decisions")
        .select("review_item_id, decision_event_id, decision"),
      "effective decisions",
    ),
    rows(
      client
        .from("review_decision_events")
        .select("id, review_item_id, decision, supersedes_event_id, created_at"),
      "review decision events",
    ),
  ]);
  const environment = environmentRows[0];
  if (
    environmentRows.length !== 1 ||
    environment.project_ref !== APPROVED_NONPRODUCTION_PROJECT_REF ||
    environment.environment_kind !== "non_production" ||
    environment.automatic_public_publish_enabled !== false
  ) {
    throw new Error("Non-production environment invariant failed");
  }

  const noticeByLegacy = new Map(
    notices.map((notice) => [notice.legacy_crawled_notice_id, notice]),
  );
  const itemByNotice = new Map(
    reviewItems.map((item) => [item.notice_id, item]),
  );
  const effectiveByItem = new Map(
    effective.map((item) => [item.review_item_id, item]),
  );
  const visible = scholarships.filter(
    (scholarship) =>
      scholarship.is_verified === true && scholarship.list_on_home === true,
  );
  const publicWithoutApprove = [];
  const rejectedOrWithdrawnVisible = [];
  for (const scholarship of visible) {
    const linkedLegacy = legacyRows.filter(
      (legacy) => legacy.scholarship_id === scholarship.id,
    );
    const decisions = linkedLegacy
      .map((legacy) => noticeByLegacy.get(legacy.id))
      .map((notice) => itemByNotice.get(notice?.id))
      .map((item) => effectiveByItem.get(item?.id))
      .filter(Boolean);
    if (!decisions.some((decision) => decision.decision === "approve")) {
      publicWithoutApprove.push(scholarship.id);
    }
    if (
      decisions.some((decision) =>
        ["reject", "revoke", "withdraw", "supersede", "merge_duplicate"].includes(
          decision.decision,
        ),
      )
    ) {
      rejectedOrWithdrawnVisible.push(scholarship.id);
    }
  }
  const reviewBacklog = reviewItems.filter(
    (item) => item.state !== "decided",
  ).length;
  const duplicateProjectionIds = legacyRows
    .filter((legacy) => legacy.scholarship_id != null)
    .reduce((map, legacy) => {
      const notice = noticeByLegacy.get(legacy.id);
      if (!notice) return map;
      const key = notice.id;
      const values = map.get(key) ?? new Set();
      values.add(legacy.scholarship_id);
      map.set(key, values);
      return map;
    }, new Map());
  const duplicateProjectionCount = [...duplicateProjectionIds.values()].filter(
    (ids) => ids.size > 1,
  ).length;
  const alerts = [
    alert(
      "PUBLIC_WITHOUT_EFFECTIVE_APPROVE",
      "critical",
      publicWithoutApprove,
      "Public rows must have an effective approve decision.",
    ),
    alert(
      "REJECTED_OR_WITHDRAWN_PUBLIC",
      "critical",
      rejectedOrWithdrawnVisible,
      "Rejected or withdrawn review state must not remain public.",
    ),
    alert(
      "REVIEW_BACKLOG_THRESHOLD",
      reviewBacklog > 50 ? "warning" : "info",
      reviewBacklog > 50 ? reviewItems.map((item) => item.id) : [],
      "Review backlog threshold is 50 items.",
    ),
  ];
  const report = {
    generated_at: new Date().toISOString(),
    contract_version: "post-phase-q-nonproduction-invariants/v1",
    evidence_kind: "database_nonproduction",
    target_project_ref: APPROVED_NONPRODUCTION_PROJECT_REF,
    active_public_scholarship_count: visible.length,
    public_row_without_effective_approve_count: publicWithoutApprove.length,
    rejected_or_withdrawn_public_leakage_count:
      rejectedOrWithdrawnVisible.length,
    duplicate_projection_count: duplicateProjectionCount,
    review_backlog_count: reviewBacklog,
    review_event_count: reviewEvents.length,
    review_event_mutation_count: 0,
    automatic_public_publish_count: 0,
    alerts,
    production_access_performed: false,
    production_write_performed: false,
    database_write_performed: false,
    guard,
    passed:
      publicWithoutApprove.length === 0 &&
      rejectedOrWithdrawnVisible.length === 0 &&
      duplicateProjectionCount === 0,
  };
  fs.writeFileSync(
    path.join(ROOT, "reports/post-phase-n-q/nonproduction-invariants.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify({
    passed: report.passed,
    active_public_scholarship_count: report.active_public_scholarship_count,
    public_row_without_effective_approve_count:
      report.public_row_without_effective_approve_count,
    rejected_or_withdrawn_public_leakage_count:
      report.rejected_or_withdrawn_public_leakage_count,
    duplicate_projection_count: report.duplicate_projection_count,
    output_path: "reports/post-phase-n-q/nonproduction-invariants.json",
  }, null, 2));
  if (!report.passed) process.exitCode = 1;
}

await main();
