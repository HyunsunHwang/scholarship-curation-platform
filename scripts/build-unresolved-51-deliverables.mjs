/**
 * Build unresolved-51 remediation deliverables with strict outcome taxonomy.
 *
 * Outcomes (must sum to 51):
 *   recovered_with_items
 *   recovered_valid_zero
 *   replacement_source_found
 *   replacement_source_not_found
 *   invalid_list_url
 *   verified_external_block
 *   verified_no_central_board   // only with explicit central-board absence evidence
 *   temporarily_unavailable
 *   still_unresolved
 *
 * Usage:
 *   node scripts/build-unresolved-51-deliverables.mjs <51-coherent-crawl.json> [coherent-188.json]
 */
import fs from "node:fs";
import path from "node:path";

const OUT = "reports/university-beta";
const crawlPath = process.argv[2];
const fullCrawlPath = process.argv[3] || "";
if (!crawlPath) {
  console.error("Usage: node scripts/build-unresolved-51-deliverables.mjs <51-crawl.json> [coherent-188.json]");
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
  REPLACEMENT_SOURCE_NOT_FOUND: "replacement_source_not_found",
  INVALID_LIST_URL: "invalid_list_url",
  VERIFIED_EXTERNAL_BLOCK: "verified_external_block",
  VERIFIED_NO_CENTRAL_BOARD: "verified_no_central_board",
  TEMPORARILY_UNAVAILABLE: "temporarily_unavailable",
  STILL_UNRESOLVED: "still_unresolved",
};

/**
 * Manual evidence overrides. `verified_no_central_board` requires explicit
 * investigation notes that a central scholarship board does not exist.
 * 404 / homepage redirect alone must NOT map to verified_no_central_board.
 */
const MANUAL = {
  // 2021 merger: GNTECH absorbed into GNU; canonical active source is ou_1864.
  ou_1821_univ_001: {
    outcome: OUTCOME.REPLACEMENT_SOURCE_FOUND,
    confidence: "confirmed",
    detail:
      "경남과학기술대는 2021년 경상국립대(GNU)로 통합. 동일 list_url 중복 수집 방지를 위해 ou_1821 비활성화, 공식 운영 주체 보드는 ou_1864_univ_001로 통합.",
  },
  // KMOU configured URL returns HTTP 404; replacement search did not yield a
  // verified public central scholarship board URL in this pass.
  ou_2097_univ_001: {
    outcome: OUTCOME.REPLACEMENT_SOURCE_NOT_FOUND,
    confidence: "high",
    detail:
      "Configured list_url HTTP 404 (invalid_list_url). Official kmou.ac.kr board IDs near mi=5689–5691 also 404; no verified central scholarship board replacement confirmed this pass.",
    prior_label: OUTCOME.INVALID_LIST_URL,
  },
  // Luther URL points at English notice / dead host; no verified Korean central
  // scholarship board replacement confirmed.
  ou_2355_univ_001: {
    outcome: OUTCOME.REPLACEMENT_SOURCE_NOT_FOUND,
    confidence: "high",
    detail:
      "Configured English notice URL is invalid/dead (invalid_list_url; hosts resolve to 404 parking). Official Korean central scholarship board URL not confirmed this pass — not enough evidence to claim verified absence.",
    prior_label: OUTCOME.INVALID_LIST_URL,
  },
};

function classify(base, probe, crawlRow) {
  if (MANUAL[base.source_id]) {
    const m = MANUAL[base.source_id];
    return {
      outcome: m.outcome,
      confidence: m.confidence,
      detail: m.detail,
      invalid_list_url_first: m.prior_label === OUTCOME.INVALID_LIST_URL,
    };
  }

  const fs_ = crawlRow?.finalStatus || "";
  const crawled = Number(crawlRow?.crawledCount || 0);
  const matched = Number(crawlRow?.matchedCount || 0);
  const reason = crawlRow?.reasonCode || "";
  const root = probe?.root_cause_category || base.prior_root_cause_category || "unknown";
  const cluster = probe?.cluster || "other";
  const enabled = crawlRow?.enabled !== false;

  if (!enabled && crawled === 0) {
    return {
      outcome: OUTCOME.STILL_UNRESOLVED,
      confidence: "medium",
      detail: "source disabled without replacement classification",
    };
  }

  if ((fs_ === "success" || fs_ === "partial") && crawled > 0) {
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

  if (probe?.http_status === 403 || root === "http_403") {
    return {
      outcome: OUTCOME.VERIFIED_EXTERNAL_BLOCK,
      confidence: "confirmed",
      detail: `HTTP ${probe.http_status}; ${probe.evidence_summary || ""}`,
    };
  }
  if (
    root === "login_required"
    || (probe?.has_login_signal && crawled === 0 && Number(probe?.candidate_anchor_count || 0) === 0)
  ) {
    return {
      outcome: OUTCOME.VERIFIED_EXTERNAL_BLOCK,
      confidence: probe?.root_cause_confidence || "high",
      detail: probe?.evidence_summary || "login wall / no public list",
    };
  }

  // Bad URL signals: keep as invalid_list_url unless MANUAL override already
  // promoted to replacement_* / verified_no_central_board.
  if (root === "not_a_notice_list" || root === "redirected_to_homepage" || probe?.http_status === 404) {
    return {
      outcome: OUTCOME.INVALID_LIST_URL,
      confidence: probe?.root_cause_confidence || "high",
      detail:
        `Invalid or non-list URL evidence only (http=${probe?.http_status}; root=${root}). `
        + "Not classified as verified_no_central_board without official-site absence proof.",
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
    enabled: crawlRow.enabled !== false,
    outcome: cls.outcome,
    outcome_confidence: cls.confidence,
    outcome_detail: cls.detail,
  };
});

const counts = Object.fromEntries(Object.values(OUTCOME).map((k) => [k, 0]));
for (const r of rows) counts[r.outcome] += 1;
const sum = Object.values(counts).reduce((a, b) => a + b, 0);
if (rows.length !== 51 || sum !== 51) {
  throw new Error(`Outcome sum mismatch: rows=${rows.length} sum=${sum} counts=${JSON.stringify(counts)}`);
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

const clusterDoc = `# Unresolved-51 root cause clusters (revised classification)

Generated: ${new Date().toISOString()}

## Probe clusters (pre-fix evidence)

| Cluster | Count |
|---------|------:|
${Object.entries(diagnostics.clusters || {})
  .map(([k, v]) => `| ${k} | ${v.count} |`)
  .join("\n")}

## Outcome taxonomy (strict)

- \`invalid_list_url\`: configured URL is not a usable notice list (404 / homepage redirect / non-list page).
- \`replacement_source_found\`: official replacement (or canonical merged) source identified.
- \`replacement_source_not_found\`: invalid URL + replacement search attempted without a verified board.
- \`verified_no_central_board\`: **only** when official university site investigation shows no central scholarship board exists.
- HTTP 404 / redirect alone never upgrades to \`verified_no_central_board\`.

## Outcome counts (sum=51)

| Outcome | Count |
|---------|------:|
${Object.entries(counts)
  .map(([k, v]) => `| ${k} | ${v} |`)
  .join("\n")}
`;
fs.writeFileSync(path.join(OUT, "unresolved-51-root-cause-clusters.md"), clusterDoc, "utf8");

let fullSummary = null;
if (fullCrawlPath && fs.existsSync(fullCrawlPath)) {
  const full = JSON.parse(fs.readFileSync(fullCrawlPath, "utf8"));
  fullSummary = full.totals || null;
  // Keep coherent JSON as the final artifact (already written by build-coherent-final-188).
  const annotated = {
    ...(typeof full === "object" ? full : {}),
    unresolved_51_outcome_counts: counts,
    unresolved_51_rows: rows,
    duplicate_source_resolution: {
      disabled_source_id: "ou_1821_univ_001",
      canonical_source_id: "ou_1864_univ_001",
      reason: "2021 GNTECH→GNU merger; identical list_url",
    },
  };
  fs.writeFileSync(path.join(OUT, "four-year-university-final.json"), JSON.stringify(annotated, null, 2), "utf8");
}

console.log(JSON.stringify({ baseline: 51, outcome_counts: counts, sum, fullSummary }, null, 2));
