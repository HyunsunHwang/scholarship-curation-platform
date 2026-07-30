/**
 * Build unresolved-51 remediation deliverables from probe + crawl results.
 * Usage:
 *   node scripts/build-unresolved-51-deliverables.mjs \
 *     exports/notices-unresolved-51-retry2/scholarship-notices-latest.json \
 *     [exports/notices-four-year-univ-final/scholarship-notices-latest.json]
 */
import fs from "node:fs";
import path from "node:path";

const OUT = "reports/university-beta";
const crawlPath = process.argv[2];
const fullCrawlPath = process.argv[3] || "";
if (!crawlPath) {
  console.error("Usage: node scripts/build-unresolved-51-deliverables.mjs <51-crawl.json> [full-188.json]");
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(path.join(OUT, "unresolved-51-baseline.json"), "utf8"));
const diagnostics = JSON.parse(fs.readFileSync(path.join(OUT, "unresolved-51-diagnostics.json"), "utf8"));
const crawl = JSON.parse(fs.readFileSync(crawlPath, "utf8"));
const probeById = Object.fromEntries((diagnostics.probes || []).map((p) => [p.source_id, p]));
const crawlById = Object.fromEntries((crawl.perSource || []).map((s) => [s.sourceId, s]));

const OUTCOME = {
  RECOVERED_WITH_ITEMS: "recovered_with_items",
  RECOVERED_VALID_ZERO: "recovered_valid_zero",
  REPLACEMENT_SOURCE_FOUND: "replacement_source_found",
  VERIFIED_EXTERNAL_BLOCK: "verified_external_block",
  VERIFIED_NO_CENTRAL_BOARD: "verified_no_central_board",
  TEMPORARILY_UNAVAILABLE: "temporarily_unavailable",
  STILL_UNRESOLVED: "still_unresolved",
};

function classify(base, probe, crawlRow) {
  const fs_ = crawlRow?.finalStatus || "";
  const crawled = Number(crawlRow?.crawledCount || 0);
  const matched = Number(crawlRow?.matchedCount || 0);
  const reason = crawlRow?.reasonCode || "";
  const root = probe?.root_cause_category || base.prior_root_cause_category || "unknown";
  const cluster = probe?.cluster || "other";

  if (fs_ === "success" && crawled > 0) {
    return {
      outcome: OUTCOME.RECOVERED_WITH_ITEMS,
      confidence: "confirmed",
      detail: `crawled=${crawled}; matched=${matched}`,
    };
  }
  if (fs_ === "success" && crawled === 0) {
    return {
      outcome: OUTCOME.RECOVERED_VALID_ZERO,
      confidence: "high",
      detail: "success with 0 list items",
    };
  }
  if (fs_ === "partial" && crawled > 0) {
    return {
      outcome: OUTCOME.RECOVERED_WITH_ITEMS,
      confidence: "high",
      detail: `partial but crawled=${crawled}; matched=${matched}`,
    };
  }

  // Evidence-based terminal classifications (not bare network_error)
  if (probe?.http_status === 403 || root === "http_403") {
    return {
      outcome: OUTCOME.VERIFIED_EXTERNAL_BLOCK,
      confidence: "confirmed",
      detail: `HTTP ${probe.http_status}; ${probe.evidence_summary || ""}`,
    };
  }
  if (root === "login_required" || (probe?.has_login_signal && crawled === 0 && probe?.candidate_anchor_count === 0)) {
    return {
      outcome: OUTCOME.VERIFIED_EXTERNAL_BLOCK,
      confidence: probe?.root_cause_confidence || "high",
      detail: probe?.evidence_summary || "login wall / no public list",
    };
  }
  if (root === "not_a_notice_list" || root === "redirected_to_homepage" || probe?.http_status === 404) {
    // No verified replacement found in this pass
    return {
      outcome: OUTCOME.VERIFIED_NO_CENTRAL_BOARD,
      confidence: probe?.root_cause_confidence || "medium",
      detail: probe?.evidence_summary || `http=${probe?.http_status}; ${root}`,
    };
  }
  if (
    root === "network_dns_or_tls_failure"
    || reason === "network_error"
    || reason === "attempt_timeout"
    || reason === "transport_redirect_limit"
    || fs_ === "timeout"
    || fs_ === "network_error"
  ) {
    return {
      outcome: OUTCOME.TEMPORARILY_UNAVAILABLE,
      confidence: "high",
      detail: `fetch_error=${probe?.fetch_error || reason || fs_}; ${probe?.evidence_summary || ""}`,
    };
  }

  return {
    outcome: OUTCOME.STILL_UNRESOLVED,
    confidence: probe?.root_cause_confidence || "medium",
    detail: `finalStatus=${fs_}; reason=${reason}; root=${root}; cluster=${cluster}`,
  };
}

const rows = baseline.sources.map((base) => {
  const probe = probeById[base.source_id] || {};
  const crawlRow = crawlById[base.source_id] || {};
  const cls = classify(base, probe, crawlRow);
  return {
    source_id: base.source_id,
    university_name: base.university_name || base.source_name,
    list_url: base.list_url,
    prior_error_bucket: base.latest_error_bucket,
    probe_cluster: probe.cluster || "",
    probe_root_cause: probe.root_cause_category || "",
    probe_confidence: probe.root_cause_confidence || "",
    probe_evidence: probe.evidence_summary || "",
    crawl_final_status: crawlRow.finalStatus || "",
    crawl_reason_code: crawlRow.reasonCode || "",
    crawled_count: crawlRow.crawledCount ?? 0,
    matched_count: crawlRow.matchedCount ?? 0,
    outcome: cls.outcome,
    outcome_confidence: cls.confidence,
    outcome_detail: cls.detail,
  };
});

const counts = Object.fromEntries(Object.values(OUTCOME).map((k) => [k, 0]));
for (const r of rows) counts[r.outcome] += 1;
const sum = Object.values(counts).reduce((a, b) => a + b, 0);
if (rows.length !== 51 || sum !== 51) {
  throw new Error(`Outcome sum mismatch: rows=${rows.length} sum=${sum}`);
}

function toCsv(objects) {
  const headers = Object.keys(objects[0]);
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `${headers.join(",")}\n${objects.map((o) => headers.map((h) => esc(o[h])).join(",")).join("\n")}\n`;
}

fs.writeFileSync(path.join(OUT, "unresolved-51-remediation.csv"), toCsv(rows), "utf8");

const clusterDoc = `# Unresolved-51 root cause clusters

Generated: ${new Date().toISOString()}

## Probe clusters (pre-fix evidence)

| Cluster | Count | Source IDs |
|---------|------:|------------|
${Object.entries(diagnostics.clusters || {})
  .map(([k, v]) => `| ${k} | ${v.count} | ${v.source_ids.join(", ")} |`)
  .join("\n")}

## Probe root_cause_category counts

| Category | Count |
|----------|------:|
${Object.entries(diagnostics.root_cause_counts || {})
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `| ${k} | ${v} |`)
  .join("\n")}

## Notes

- Probe intentionally avoided treating bare \`network_error\` / \`empty_observed\` / \`partial\` as final root causes.
- Common remediations applied: expanded detail URL pattern (\`view.do\`, \`nttSn\`, \`brdIdx\`, \`DOC_NO\`, \`BoardView\`, \`portalBbs\`, …), \`data-id\`→\`selectNttInfo\`, \`jf_view\`, \`goView\` (boardCnts), \`goDetail\`, \`fn_search_detail\`, \`fnView\` (UOS), \`goBdView\`, \`pf_DetailMove\`, \`doDetail\`, \`fn_View\` (CUP), \`cau_portal\` defaults, \`duksung_bbs_ajax\` adapter.
`;

fs.writeFileSync(path.join(OUT, "unresolved-51-root-cause-clusters.md"), clusterDoc, "utf8");

let fullSummary = null;
if (fullCrawlPath && fs.existsSync(fullCrawlPath)) {
  const full = JSON.parse(fs.readFileSync(fullCrawlPath, "utf8"));
  const per = full.perSource || [];
  const success = per.filter((s) => s.finalStatus === "success").length;
  const withItems = per.filter((s) => s.finalStatus === "success" && s.crawledCount > 0).length;
  const errors = per.filter((s) => s.finalStatus !== "success").length;
  fullSummary = {
    sourceCount: per.length,
    success,
    withItems,
    successZero: success - withItems,
    errors,
    crawledCount: full.totals?.crawledCount,
    matchedCount: full.totals?.matchedCount,
  };

  // final.csv/json: merge rem1-style inventory for all 188
  const finalRows = per.map((s) => ({
    source_id: s.sourceId,
    source_name: s.sourceName,
    university_slug: s.universitySlug,
    final_status: s.finalStatus,
    reason_code: s.reasonCode || "",
    crawled_count: s.crawledCount ?? 0,
    matched_count: s.matchedCount ?? 0,
    new_count: s.newCount ?? 0,
    in_unresolved_51_baseline: baseline.sources.some((b) => b.source_id === s.sourceId),
    unresolved_51_outcome: rows.find((r) => r.source_id === s.sourceId)?.outcome || "",
  }));
  fs.writeFileSync(path.join(OUT, "four-year-university-final.csv"), toCsv(finalRows), "utf8");
  fs.writeFileSync(
    path.join(OUT, "four-year-university-final.json"),
    JSON.stringify(
      {
        created_at: new Date().toISOString(),
        baseline_unresolved: 51,
        outcome_counts: counts,
        full_crawl: fullSummary,
        regression_baselines: {
          prior_success: 137,
          prior_with_items: 110,
          prior_launch_eligible: 60,
        },
        sources: finalRows,
      },
      null,
      2,
    ),
    "utf8",
  );
}

console.log(
  JSON.stringify(
    {
      baseline: 51,
      outcome_counts: counts,
      sum,
      fullSummary,
      remediation_csv: path.join(OUT, "unresolved-51-remediation.csv"),
    },
    null,
    2,
  ),
);
