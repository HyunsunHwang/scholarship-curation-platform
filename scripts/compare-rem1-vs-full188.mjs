/**
 * Compare rem-1 final 188 vs a candidate full crawl; write regression groups.
 * Usage: node scripts/compare-rem1-vs-full188.mjs <full-or-coherent.json> <out-prefix>
 */
import fs from "node:fs";

const rem = JSON.parse(
  fs.readFileSync("reports/university-beta/four-year-university-remediation.json", "utf8"),
);
const current = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const outPrefix = process.argv[3] || "reports/university-beta/regression-rem1-vs-full188";
const baseline = JSON.parse(
  fs.readFileSync("reports/university-beta/unresolved-51-baseline.json", "utf8"),
).sources.map((s) => s.source_id);
const best51Path = "exports/notices-unresolved-51-retry2/scholarship-notices-best.json";
const best51 = fs.existsSync(best51Path)
  ? JSON.parse(fs.readFileSync(best51Path, "utf8"))
  : { perSource: [] };

const remBy = Object.fromEntries(rem.sources.map((s) => [s.source_id, s]));
const curListAll = current.perSource || current.sources || [];
const curList = curListAll.filter((s) => s.enabled !== false && (s.finalStatus || s.final_status) !== "disabled");
const curBy = Object.fromEntries(
  curListAll.map((s) => [s.sourceId || s.source_id, s]),
);
const bestBy = Object.fromEntries(best51.perSource.map((s) => [s.sourceId, s]));

const remSuccess = (s) => s?.final_status === "success";
const remWithItems = (s) => remSuccess(s) && Number(s.final_observed_count || 0) > 0;
const curStatus = (s) => s?.finalStatus || s?.final_status || "";
const curObs = (s) => Number(s?.crawledCount ?? s?.final_observed_count ?? 0);
const curSuccess = (s) => ["success", "partial"].includes(curStatus(s));
const curWithItems = (s) => curSuccess(s) && curObs(s) > 0;

const successToNon = [];
const withToZeroOrNon = [];
const recoveredToNon = [];

for (const [id, r] of Object.entries(remBy)) {
  const c = curBy[id];
  if (remSuccess(r) && !curSuccess(c)) {
    successToNon.push({
      source_id: id,
      source_name: r.source_name,
      previous_status: r.final_status,
      previous_observed: r.final_observed_count,
      current_status: curStatus(c) || "missing",
      current_observed: curObs(c),
      current_reason: c?.reasonCode || c?.final_error_bucket || "",
      likely_cause: /timeout|network|fetch/i.test(String(c?.reasonCode || c?.finalStatus || ""))
        ? "transient_network_or_timeout"
        : "unknown_regression",
    });
  }
  if (remWithItems(r) && !curWithItems(c)) {
    withToZeroOrNon.push({
      source_id: id,
      source_name: r.source_name,
      previous_status: r.final_status,
      previous_observed: r.final_observed_count,
      current_status: curStatus(c) || "missing",
      current_observed: curObs(c),
      current_reason: c?.reasonCode || "",
      likely_cause: !curSuccess(c)
        ? "transient_or_hard_failure"
        : "success_but_zero_items_lookback_or_empty",
    });
  }
}

for (const id of baseline) {
  const b = bestBy[id];
  const c = curBy[id];
  if (c && (c.enabled === false || curStatus(c) === "disabled")) continue;
  const recovered =
    b && ["success", "partial"].includes(b.finalStatus) && Number(b.crawledCount || 0) > 0;
  if (recovered && !curWithItems(c)) {
    recoveredToNon.push({
      source_id: id,
      source_name: remBy[id]?.source_name,
      previous_status: `${b.finalStatus}(51-best)`,
      previous_observed: b.crawledCount,
      current_status: curStatus(c),
      current_observed: curObs(c),
      current_reason: c?.reasonCode || "",
      likely_cause: "full188_missed_51_recovery",
    });
  }
}

const report = {
  created_at: new Date().toISOString(),
  rem1: {
    success: rem.sources.filter(remSuccess).length,
    with_items: rem.sources.filter(remWithItems).length,
  },
  current: {
    success: curList.filter(curSuccess).length,
    with_items: curList.filter(curWithItems).length,
    source_count: curList.length,
  },
  expected_floor_if_no_regression: {
    success: rem.sources.filter(remSuccess).length,
    with_items: rem.sources.filter(remWithItems).length,
    note: "If no rem-1 regression and N recovered_with_items added, success>=137+N_unique and with_items>=110+N_unique (minus overlaps).",
  },
  groups: {
    success_to_non_success: { count: successToNon.length, rows: successToNon },
    with_items_to_zero_or_non_success: { count: withToZeroOrNon.length, rows: withToZeroOrNon },
    recovered_with_items_to_full_non_success: {
      count: recoveredToNon.length,
      rows: recoveredToNon,
    },
  },
};

fs.writeFileSync(`${outPrefix}.json`, JSON.stringify(report, null, 2), "utf8");

function toCsv(rows) {
  if (!rows.length) return "source_id\n";
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `${headers.join(",")}\n${rows.map((r) => headers.map((h) => esc(r[h])).join(",")).join("\n")}\n`;
}

fs.writeFileSync(`${outPrefix}-success-to-non.csv`, toCsv(successToNon), "utf8");
fs.writeFileSync(`${outPrefix}-with-items-to-zero.csv`, toCsv(withToZeroOrNon), "utf8");
fs.writeFileSync(`${outPrefix}-recovered-to-non.csv`, toCsv(recoveredToNon), "utf8");

console.log(
  JSON.stringify(
    {
      rem1: report.rem1,
      current: report.current,
      success_to_non: successToNon.length,
      with_to_zero_or_non: withToZeroOrNon.length,
      recovered_to_non: recoveredToNon.length,
      outPrefix,
    },
    null,
    2,
  ),
);
