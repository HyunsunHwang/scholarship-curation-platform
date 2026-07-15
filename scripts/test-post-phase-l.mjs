import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  applyPlanToMemory,
  buildNormalizedGraphPlan,
  canonicalizeNoticeUrl,
  POST_PHASE_L_PILOT_SOURCE_KEYS,
} from "../lib/post-phase-l/normalized-graph.mjs";
import { resolveExactSourceKey } from "../lib/post-phase-l/source-resolver.mjs";
import {
  inspectPostPhaseLTarget,
  POST_PHASE_L_APPLY_TOKEN,
  POST_PHASE_L_FORBIDDEN_PROJECT_REF,
  POST_PHASE_L_TARGET_PROJECT_REF,
  POST_PHASE_L_TARGET_PROJECT_URL,
} from "../lib/post-phase-l/target-guard.mjs";
import {
  buildBoundedPaginationUrls,
  canonicalizeNoticeUrl as canonicalizeAdapterNoticeUrl,
  extractNoticeUrlFromLinkNode,
  getSourceAdapterStrategy,
} from "../lib/crawler-adapters/index.mjs";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(path.resolve(filePath), "utf8");
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("authoritative pilot cohort exact resolution", () => {
  const inventory = readJson("docs/post-phase-l-schema-inventory.json");
  const rows = inventory.pilot_sources.map((row) => ({
    source_id: row.canonical_source_id,
  }));
  for (const sourceKey of POST_PHASE_L_PILOT_SOURCE_KEYS) {
    assert.equal(resolveExactSourceKey(sourceKey, rows).resolution_status, "resolved");
  }
});

test("exact resolver blocks missing, ambiguous, wrong-case, and production-only keys", () => {
  const rows = [{ source_id: "cau_001" }];
  assert.equal(resolveExactSourceKey("missing_999", rows).resolution_status, "blocked_missing_source");
  assert.equal(
    resolveExactSourceKey("cau_001", [...rows, ...rows]).resolution_status,
    "blocked_ambiguous_inventory",
  );
  assert.equal(resolveExactSourceKey("CAU_001", rows).resolution_status, "blocked_missing_source");
  assert.equal(
    resolveExactSourceKey(POST_PHASE_L_FORBIDDEN_PROJECT_REF, rows).resolution_status,
    "blocked_missing_source",
  );
});

test("target guard requires exact target and explicit apply confirmation", () => {
  const base = {
    POST_PHASE_L_TARGET_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL: POST_PHASE_L_TARGET_PROJECT_URL,
  };
  assert.equal(inspectPostPhaseLTarget(base).safe, true);
  assert.equal(inspectPostPhaseLTarget({}, { requireApply: true }).safe, false);
  assert.equal(
    inspectPostPhaseLTarget(
      {
        ...base,
        POST_PHASE_L_APPLY: "true",
        POST_PHASE_L_APPLY_CONFIRMATION: POST_PHASE_L_APPLY_TOKEN,
      },
      { requireApply: true },
    ).safe,
    true,
  );
  assert.equal(
    inspectPostPhaseLTarget(
      {
        ...base,
        NEXT_PUBLIC_SUPABASE_URL: `https://${POST_PHASE_L_FORBIDDEN_PROJECT_REF}.supabase.co`,
      },
      { requireApply: false },
    ).production_ref_detected,
    true,
  );
});

test("graph replay is deterministic and creates no second-run duplicates", () => {
  const fixture = readJson("fixtures/post-phase-l/pilot-fixture.json");
  const first = buildNormalizedGraphPlan(fixture, {
    generatedAt: fixture.generated_at,
    targetProjectRef: POST_PHASE_L_TARGET_PROJECT_REF,
  });
  const second = buildNormalizedGraphPlan(fixture, {
    generatedAt: fixture.generated_at,
    targetProjectRef: POST_PHASE_L_TARGET_PROJECT_REF,
  });
  assert.deepEqual(second, first);
  const firstApply = applyPlanToMemory({}, first);
  const secondApply = applyPlanToMemory(firstApply.state, second);
  assert.deepEqual(
    secondApply.inserted,
    Object.fromEntries(Object.keys(first.tables).map((table) => [table, 0])),
  );
});

test("content change creates a revision without changing notice identity", () => {
  const fixture = readJson("fixtures/post-phase-l/pilot-fixture.json");
  const original = buildNormalizedGraphPlan(fixture, { generatedAt: fixture.generated_at });
  const changed = structuredClone(fixture);
  changed.source_results[0].notices[0].body += " 변경된 근거 문장입니다.";
  const changedPlan = buildNormalizedGraphPlan(changed, { generatedAt: fixture.generated_at });
  assert.equal(
    original.tables.ingestion_notices[0].id,
    changedPlan.tables.ingestion_notices[0].id,
  );
  assert.notEqual(
    original.tables.ingestion_notice_revisions[0].id,
    changedPlan.tables.ingestion_notice_revisions[0].id,
  );
});

test("database assigns revision ordinals under a per-notice lock", () => {
  const sql = readText("supabase/post-phase-l/002_post_phase_l_normalized_graph.sql");
  assert.match(sql, /function public\.post_phase_l_assign_revision_ordinal\(\)/);
  assert.match(sql, /where id = new\.notice_id\s+for update;/);
  assert.match(sql, /coalesce\(max\(r\.revision_ordinal\), 0\) \+ 1/);
  assert.match(sql, /trigger ingestion_notice_revisions_assign_ordinal/);
});

test("database replay preserves canonical metadata and review state", () => {
  const sql = readText("supabase/post-phase-l/002_post_phase_l_normalized_graph.sql");
  assert.match(sql, /function public\.post_phase_l_preserve_notice_replay_metadata\(\)/);
  assert.match(sql, /new\.legacy_crawled_notice_id := coalesce/);
  assert.match(sql, /function public\.post_phase_l_preserve_review_state_on_ingest\(\)/);
  assert.match(sql, /new\.state := old\.state/);
});

test("projection preview rejects an approval for a stale revision", () => {
  const source = readText("lib/post-phase-l/admin-review.ts");
  assert.match(source, /effectiveEvent\?\.revision_id !== revision\?\.id/);
  assert.match(source, /approved_revision_not_current/);
});

test("schema rollback drops trigger tables before trigger functions", () => {
  const sql = readText("supabase/post-phase-l/999_post_phase_l_schema_rollback.sql");
  const tableDrop = sql.indexOf("drop table if exists public.review_decision_events");
  const triggerFunctionDrop = sql.indexOf(
    "drop function if exists public.post_phase_l_sync_effective_decision()",
  );
  assert.ok(tableDrop >= 0 && triggerFunctionDrop > tableDrop);
  for (const functionName of [
    "post_phase_l_assign_revision_ordinal",
    "post_phase_l_preserve_notice_replay_metadata",
    "post_phase_l_preserve_alias_replay_metadata",
    "post_phase_l_preserve_review_state_on_ingest",
  ]) {
    assert.match(sql, new RegExp(`drop function if exists public\\.${functionName}\\(\\)`));
  }
});

test("001 fresh-project assertion rejects a non-empty application schema before persistent mutation", () => {
  const sql = readText("supabase/post-phase-l/001_post_phase_l_compatibility_baseline.sql");
  const assertionBegin = sql.indexOf("POST_PHASE_L_FRESH_PROJECT_ASSERTION_BEGIN");
  const assertionEnd = sql.indexOf("POST_PHASE_L_FRESH_PROJECT_ASSERTION_END");
  assert.ok(assertionBegin >= 0 && assertionEnd > assertionBegin);

  const assertionSql = sql.slice(assertionBegin, assertionEnd);
  for (const tableName of [
    "profiles",
    "scholarships",
    "scholarship_selection_stages",
    "notice_sources",
    "crawled_notices",
    "site_settings",
  ]) {
    assert.match(assertionSql, new RegExp(`'${tableName}'`));
  }
  assert.match(assertionSql, /POST_PHASE_L_FRESH_PROJECT_REQUIRED/);

  const persistentMutationPattern =
    /\b(?:create|alter|drop|insert|update|delete|grant|revoke)\b/i;
  const beforeAssertionCompletes = stripSqlComments(sql.slice(0, assertionEnd));
  const afterAssertionCompletes = stripSqlComments(
    sql.slice(assertionEnd + "POST_PHASE_L_FRESH_PROJECT_ASSERTION_END".length),
  );
  assert.doesNotMatch(beforeAssertionCompletes, persistentMutationPattern);
  assert.match(
    afterAssertionCompletes,
    /^\s*create\s+table\s+public\.post_phase_l_environment_guard/i,
  );

  const simulatedApply = (existingRelations) => {
    let persistentMutationCount = 0;
    if (existingRelations.some((name) => assertionSql.includes(`'${name}'`))) {
      throw Object.assign(new Error("POST_PHASE_L_FRESH_PROJECT_REQUIRED"), {
        persistentMutationCount,
      });
    }
    persistentMutationCount += 1;
    return persistentMutationCount;
  };
  assert.throws(
    () => simulatedApply(["profiles"]),
    (error) =>
      error.message === "POST_PHASE_L_FRESH_PROJECT_REQUIRED" &&
      error.persistentMutationCount === 0,
  );
});

test("environment guard is created once in 001 and remains immutable", () => {
  const baselineRawSql = readText(
    "supabase/post-phase-l/001_post_phase_l_compatibility_baseline.sql",
  );
  const baselineSql = stripSqlComments(baselineRawSql);
  const graphSql = stripSqlComments(
    readText("supabase/post-phase-l/002_post_phase_l_normalized_graph.sql"),
  );
  const rollbackSql = stripSqlComments(
    readText("supabase/post-phase-l/999_post_phase_l_schema_rollback.sql"),
  );
  const assertionEnd = baselineRawSql.indexOf("POST_PHASE_L_FRESH_PROJECT_ASSERTION_END");
  const guardCreate = baselineRawSql.search(
    /create\s+table\s+public\.post_phase_l_environment_guard/i,
  );

  assert.ok(assertionEnd >= 0 && guardCreate > assertionEnd);
  assert.match(baselineSql, /function public\.post_phase_l_block_environment_guard_mutation\(\)/i);
  assert.match(
    baselineSql,
    /create\s+trigger\s+post_phase_l_environment_guard_immutable\s+before\s+update\s+or\s+delete/i,
  );
  assert.doesNotMatch(
    graphSql,
    /create\s+table(?:\s+if\s+not\s+exists)?\s+public\.post_phase_l_environment_guard/i,
  );
  assert.doesNotMatch(graphSql, /insert\s+into\s+public\.post_phase_l_environment_guard/i);
  assert.doesNotMatch(graphSql, /update\s+public\.post_phase_l_environment_guard/i);
  assert.doesNotMatch(graphSql, /delete\s+from\s+public\.post_phase_l_environment_guard/i);
  assert.match(graphSql, /perform\s+public\.post_phase_l_assert_environment\(\)/i);
  assert.doesNotMatch(rollbackSql, /drop\s+table.*post_phase_l_environment_guard/i);
  assert.doesNotMatch(rollbackSql, /drop\s+function.*post_phase_l_assert_environment/i);
});

test("review RPC resolves an idempotent retry before lifecycle rejection", () => {
  const sql = readText("supabase/post-phase-l/002_post_phase_l_normalized_graph.sql");
  const duplicateReturn = sql.indexOf("'duplicate', true");
  const lifecycleRejection = sql.indexOf("Only a new, unlinked legacy notice can receive");
  assert.ok(duplicateReturn >= 0 && lifecycleRejection > duplicateReturn);
  assert.match(sql, /event idempotency key collision/);
});

test("zero match remains source-result evidence and never deletes notices", () => {
  const fixture = readJson("fixtures/post-phase-l/pilot-fixture.json");
  const zero = structuredClone(fixture);
  zero.run.idempotency_key = "post-phase-l-zero-match-fixture-v1";
  zero.source_results[0].result_status = "zero_match_observed";
  zero.source_results[0].notices = [];
  const plan = buildNormalizedGraphPlan(zero, { generatedAt: fixture.generated_at });
  assert.equal(plan.tables.ingestion_notices.length, 0);
  assert.equal(plan.tables.ingestion_source_run_results[0].result_status, "zero_match_observed");
});

test("URL canonicalization preserves identity and records alias-worthy differences", () => {
  const original = "https://example.edu/notice?id=7&utm_source=test#section";
  assert.equal(canonicalizeNoticeUrl(original), "https://example.edu/notice?id=7");
});

test("Yonsei UIC strategy canonicalizes uid detail links and bounds pagination", () => {
  const source = {
    sourceId: "yonsei_060",
    listUrl: "https://uic.yonsei.ac.kr/main/news.php?mid=m06_01_01",
    baseUrl: "https://uic.yonsei.ac.kr",
  };
  assert.equal(getSourceAdapterStrategy(source), "yonsei_uic");
  assert.equal(buildBoundedPaginationUrls(source, 3).length, 3);
  assert.equal(
    canonicalizeAdapterNoticeUrl(
      "https://uic.yonsei.ac.kr/main/news.php?mid=m06_01_01&act=view&uid=14407",
      source,
    ),
    "https://uic.yonsei.ac.kr/main/news.php?mid=m06_01_02&act=view&uid=14407",
  );
  const linkNode = {
    attr(name) {
      if (name === "href") return "#";
      if (name === "onclick") return "goView('14407')";
      return "";
    },
  };
  assert.equal(
    extractNoticeUrlFromLinkNode(source, linkNode),
    "https://uic.yonsei.ac.kr/main/news.php?mid=m06_01_02&act=view&uid=14407",
  );
});

const results = [];
for (const entry of tests) {
  try {
    await entry.fn();
    results.push({ name: entry.name, passed: true });
  } catch (error) {
    results.push({ name: entry.name, passed: false, error: error?.message ?? String(error) });
  }
}

const report = {
  generated_at: new Date().toISOString(),
  test_count: results.length,
  passed_count: results.filter((result) => result.passed).length,
  failed_count: results.filter((result) => !result.passed).length,
  remote_read_performed: false,
  remote_write_performed: false,
  external_llm_call_count: 0,
  results,
};

const outputPath = path.resolve(
  process.env.POST_PHASE_L_TEST_REPORT ?? "reports/post-phase-l-local-test-report.json",
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`post_phase_l_tests=${report.passed_count}/${report.test_count}`);
console.log(`report=${outputPath}`);
if (report.failed_count > 0) process.exitCode = 1;
