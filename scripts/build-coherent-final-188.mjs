/**
 * Build coherent final-188 by best-of across crawl artifacts.
 *
 * Usage:
 *   node scripts/build-coherent-final-188.mjs \
 *     exports/notices-four-year-univ-final/scholarship-notices-latest.json \
 *     exports/notices-regression-retry/scholarship-notices-latest.json \
 *     exports/notices-regression-retry2/scholarship-notices-latest.json \
 *     exports/notices-unresolved-51-retry2/scholarship-notices-best.json
 */
import fs from "node:fs";
import { readSourceConfigFromCsv } from "../lib/notice-sources-loader.mjs";

const inputPaths = process.argv.slice(2).filter(Boolean);
if (inputPaths.length < 1) {
  console.error("Usage: node scripts/build-coherent-final-188.mjs <crawl.json> [moreCrawl.json...]");
  process.exit(1);
}

const rem = JSON.parse(
  fs.readFileSync("reports/university-beta/four-year-university-remediation.json", "utf8"),
);
const csvSources = readSourceConfigFromCsv("data/notice-sources-four-year-univ.csv", {
  includeDisabled: true,
});
const csvById = Object.fromEntries(csvSources.map((s) => [s.sourceId, s]));

function score(row) {
  if (!row) return -1;
  const status = row.finalStatus || "";
  const obs = Number(row.crawledCount || 0);
  if ((status === "success" || status === "partial") && obs > 0) return 2000 + obs;
  if (status === "success") return 1000;
  if (status === "partial") return 500 + obs;
  return 0;
}

function tagFor(p) {
  if (p.includes("regression-retry2")) return "regression_retry2";
  if (p.includes("regression-retry")) return "regression_retry";
  if (p.includes("unresolved-51")) return "unresolved51_best";
  if (p.includes("four-year-univ-final")) return "full188";
  return p.split(/[/\\]/).slice(-2).join("/");
}

function normalize(row, sourceMeta = {}) {
  return {
    sourceId: row.sourceId,
    universitySlug: row.universitySlug,
    universityId: row.universityId,
    collegeId: row.collegeId,
    departmentId: row.departmentId,
    sourceLevel: row.sourceLevel,
    collegeName: row.collegeName,
    sourceName: row.sourceName,
    adapterStrategy: row.adapterStrategy,
    crawledCount: row.crawledCount ?? 0,
    matchedCount: row.matchedCount ?? 0,
    newCount: row.newCount ?? 0,
    finalStatus: row.finalStatus,
    attemptCount: row.attemptCount ?? 1,
    durationMs: row.durationMs ?? 0,
    reasonCode: row.reasonCode || "",
    enabled: sourceMeta.enabled !== false,
    listUrl: sourceMeta.listUrl || "",
    resultSource: row.__resultSource || "unknown",
  };
}

const pools = [];
for (const p of inputPaths) {
  if (!fs.existsSync(p)) {
    console.error("missing input", p);
    process.exit(1);
  }
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  const tag = tagFor(p);
  for (const s of doc.perSource || []) {
    pools.push({ ...s, __resultSource: tag });
  }
}

const bestById = new Map();
for (const row of pools) {
  const prev = bestById.get(row.sourceId);
  if (!prev || score(row) > score(prev)) bestById.set(row.sourceId, row);
}

for (const s of rem.sources) {
  if (!bestById.has(s.source_id)) {
    bestById.set(s.source_id, {
      sourceId: s.source_id,
      sourceName: s.source_name,
      crawledCount: 0,
      matchedCount: 0,
      newCount: 0,
      finalStatus: "missing",
      reasonCode: "missing_from_coherent_merge",
      __resultSource: "missing",
    });
  }
}

// Disabled sources are retained for inventory but forced out of success floors.
for (const [id, row] of bestById.entries()) {
  const meta = csvById[id];
  if (meta && meta.enabled === false) {
    bestById.set(id, {
      ...row,
      finalStatus: "disabled",
      reasonCode: "disabled_duplicate_or_inactive",
      crawledCount: 0,
      matchedCount: 0,
      newCount: 0,
      __resultSource: `${row.__resultSource}|disabled`,
    });
  }
}

const coherent = [...bestById.values()]
  .map((row) => normalize(row, csvById[row.sourceId] || {}))
  .sort((a, b) => String(a.sourceId).localeCompare(String(b.sourceId)));

const active = coherent.filter((s) => s.enabled);
const success = active.filter((s) => s.finalStatus === "success" || s.finalStatus === "partial");
const withItems = success.filter((s) => s.crawledCount > 0);

const out = {
  created_at: new Date().toISOString(),
  kind: "coherent_final_188",
  inputs: inputPaths,
  totals: {
    sourceCountIncludingDisabled: coherent.length,
    activeSourceCount: active.length,
    disabledSourceCount: coherent.length - active.length,
    success: success.length,
    withItems: withItems.length,
    successZero: success.length - withItems.length,
    nonSuccessActive: active.length - success.length,
  },
  rem1_floors: { success: 137, with_items: 110 },
  duplicate_source_resolution: {
    disabled_source_id: "ou_1821_univ_001",
    canonical_source_id: "ou_1864_univ_001",
    reason: "2021 GNTECH→GNU merger; identical list_url",
  },
  perSource: coherent,
};

fs.mkdirSync("exports/notices-four-year-univ-coherent", { recursive: true });
fs.writeFileSync(
  "exports/notices-four-year-univ-coherent/scholarship-notices-coherent.json",
  JSON.stringify(out, null, 2),
  "utf8",
);

function toCsv(rows) {
  const headers = [
    "source_id",
    "source_name",
    "enabled",
    "final_status",
    "reason_code",
    "crawled_count",
    "matched_count",
    "result_source",
    "list_url",
  ];
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [
      r.sourceId,
      r.sourceName,
      r.enabled,
      r.finalStatus,
      r.reasonCode,
      r.crawledCount,
      r.matchedCount,
      r.resultSource,
      r.listUrl,
    ]
      .map(esc)
      .join(","),
  );
  return `${headers.join(",")}\n${lines.join("\n")}\n`;
}

fs.writeFileSync("reports/university-beta/four-year-university-final.csv", toCsv(coherent), "utf8");
fs.writeFileSync("reports/university-beta/four-year-university-final.json", JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify({ totals: out.totals, inputs: inputPaths }, null, 2));
