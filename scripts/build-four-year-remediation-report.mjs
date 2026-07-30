/**
 * Build full 188-source remediation CSV/JSON + closeout inputs.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') inQuotes = false;
      else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim()));
}

function toCsvCell(v) {
  const text = String(v ?? "");
  const escaped = text.replace(/"/g, '""');
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

function mapRootCause({
  initialBucket,
  finalBucket,
  diagBucket,
  primaryCode,
  accessProfiles,
  finalObserved,
  finalStatus,
}) {
  // Prefer structural evidence over broad crawl buckets.
  if (primaryCode === "URL_RESOLUTION_FAILED" && /STATIC_HTML_EVENT_URL/i.test(accessProfiles || "")) {
    if (finalStatus === "success" && finalObserved > 0) {
      return {
        root_cause_category: "onclick_event_url_required",
        root_cause_confidence: "confirmed",
        root_cause_detail:
          "List rows resolved after expanding notice_url_pattern to include artclView.do / event URL IDs",
      };
    }
    return {
      root_cause_category: "onclick_event_url_required",
      root_cause_confidence: "high",
      root_cause_detail:
        "List selector matched rows but notice URLs failed pattern/event resolution",
    };
  }
  if (primaryCode === "LIST_SELECTOR_ZERO_MATCHES" || diagBucket === "selector_miss") {
    return {
      root_cause_category: "list_selector_mismatch",
      root_cause_confidence: diagBucket === "selector_miss" ? "confirmed" : "high",
      root_cause_detail: "Configured list_item_selector matched 0 rows on fetched HTML",
    };
  }
  if (diagBucket === "link_extract_fail" || primaryCode === "URL_RESOLUTION_FAILED") {
    return {
      root_cause_category: "detail_url_resolution_failed",
      root_cause_confidence: "high",
      root_cause_detail: "List rows found but detail URL could not be extracted",
    };
  }
  if (diagBucket === "fetch_error" || /network_error|http_error|timeout|transport_/i.test(initialBucket)) {
    if (/http_error|http_forbidden/i.test(initialBucket) || /AUTH|CAPTCHA|403/i.test(primaryCode + accessProfiles)) {
      return {
        root_cause_category: "http_forbidden",
        root_cause_confidence: "high",
        root_cause_detail: `Fetch/access failure: ${initialBucket}/${primaryCode}`,
      };
    }
    if (/timeout|attempt_timeout/i.test(initialBucket + finalBucket)) {
      return {
        root_cause_category: "timeout",
        root_cause_confidence: "confirmed",
        root_cause_detail: "Source attempt timed out",
      };
    }
    if (/redirect/i.test(initialBucket + finalBucket + primaryCode)) {
      return {
        root_cause_category: "redirect_loop",
        root_cause_confidence: "high",
        root_cause_detail: "Transport redirect limit or loop",
      };
    }
    if (/TLS|CERTIFICATE/i.test(accessProfiles || "")) {
      return {
        root_cause_category: "network_dns_or_tls_failure",
        root_cause_confidence: "high",
        root_cause_detail: "TLS/certificate exception indicated by access profile",
      };
    }
    return {
      root_cause_category: "network_dns_or_tls_failure",
      root_cause_confidence: "medium",
      root_cause_detail: `Network/fetch failure bucket=${initialBucket} primary=${primaryCode}`,
    };
  }
  if (finalStatus === "success" && finalObserved === 0) {
    if (/FILTERED_OUT_BY_DATE/i.test(primaryCode + (accessProfiles || ""))) {
      return {
        root_cause_category: "valid_zero_recent_posts",
        root_cause_confidence: "medium",
        root_cause_detail: "List parsed but no dated posts inside lookback (or undated filtered)",
      };
    }
    return {
      root_cause_category: "valid_empty_board",
      root_cause_confidence: "low",
      root_cause_detail: "Success with 0 observed items — needs empty-board vs filter confirmation",
    };
  }
  if (finalStatus === "success" && finalObserved > 0) {
    return {
      root_cause_category: "valid_zero_recent_posts",
      root_cause_confidence: "confirmed",
      root_cause_detail: "Recovered or originally successful with list items",
    };
  }
  if (diagBucket === "js_suspect" || /javascript|ADAPTER_REQUIRED|INLINE/i.test(primaryCode + accessProfiles)) {
    return {
      root_cause_category: "javascript_rendered_list",
      root_cause_confidence: "medium",
      root_cause_detail: "Diagnostics indicate JS/inline/adapter requirement",
    };
  }
  return {
    root_cause_category: "unknown_requires_manual_review",
    root_cause_confidence: "low",
    root_cause_detail: `Unresolved: initial=${initialBucket} final=${finalBucket} diag=${diagBucket} primary=${primaryCode}`,
  };
}

const initial = JSON.parse(
  fs.readFileSync("exports/notices-four-year-univ/scholarship-notices-latest.json", "utf8")
);
const retry = JSON.parse(
  fs.readFileSync("exports/notices-four-year-retry/scholarship-notices-latest.json", "utf8")
);
const sourceCsv = parseCsv(
  fs.readFileSync("data/notice-sources-four-year-univ.csv", "utf8").replace(/^\uFEFF/, "")
);
const [sh, ...srows] = sourceCsv;
const si = Object.fromEntries(sh.map((h, i) => [h, i]));
const bySource = new Map(srows.map((r) => [r[si.source_id], r]));

const diag = parseCsv(
  fs
    .readFileSync(
      "exports/notices/diagnostics-four-year-errors/source-diagnostics-20260730.csv",
      "utf8"
    )
    .replace(/^\uFEFF/, "")
);
const [dh, ...drows] = diag;
const di = Object.fromEntries(dh.map((h, i) => [h, i]));
const byDiag = new Map(drows.map((r) => [r[di.source_id], r]));

const ops = parseCsv(
  fs
    .readFileSync(
      "exports/notices-four-year-univ/crawler-operational-diagnostics-latest.csv",
      "utf8"
    )
    .replace(/^\uFEFF/, "")
);
const [oh, ...orows] = ops;
const oi = Object.fromEntries(oh.map((h, i) => [h, i]));
const byOps = new Map(orows.map((r) => [r[oi.source_id], r]));

const byInitial = new Map(initial.perSource.map((s) => [s.sourceId, s]));
const byRetry = new Map(retry.perSource.map((s) => [s.sourceId, s]));

let gitCommit = "unknown";
try {
  gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
} catch {}

const outRows = [];
for (const s of initial.perSource) {
  const csv = bySource.get(s.sourceId);
  const r = byRetry.get(s.sourceId);
  const d = byDiag.get(s.sourceId);
  const o = byOps.get(s.sourceId);

  const initialStatus = s.finalStatus;
  const initialBucket = s.reasonCode;
  const initialObserved = Number(s.crawledCount || 0);
  const initialMatched = Number(s.matchedCount || 0);
  const wasError = initialStatus !== "success";
  const wasZero = initialStatus === "success" && initialObserved === 0;

  const finalStatus = r ? r.finalStatus : s.finalStatus;
  const finalBucket = r ? r.reasonCode : s.reasonCode;
  const finalObserved = r ? Number(r.crawledCount || 0) : initialObserved;
  const finalMatched = r ? Number(r.matchedCount || 0) : initialMatched;
  const finalNew = r ? Number(r.newCount || 0) : Number(s.newCount || 0);

  const recovered =
    wasError && finalStatus === "success" && finalObserved > 0
      ? true
      : wasError && finalStatus === "success"
        ? "success_zero"
        : false;

  const root = mapRootCause({
    initialBucket,
    finalBucket,
    diagBucket: d?.[di.bucket] || "",
    primaryCode: o?.[oi.primary_failure_code] || "",
    accessProfiles: o?.[oi.access_profiles] || "",
    finalObserved,
    finalStatus,
  });

  let actionTaken = "none";
  if (wasError || wasZero) {
    actionTaken =
      "expanded_notice_url_pattern; cleared selector_miss list_item_selector; preferred university_slug; jf_viewArtcl script URL helper; retry crawl";
  }

  const launchEligible =
    finalStatus === "success" &&
    finalObserved > 0 &&
    finalMatched > 0 &&
    Boolean(csv?.[si.list_url]?.startsWith("http"));

  const handoffReady = launchEligible; // list+match present; detail verification uneven
  const remainingBlocker = launchEligible
    ? ""
    : finalStatus !== "success"
      ? root.root_cause_category
      : finalObserved === 0
        ? "zero_observed_needs_empty_board_confirmation"
        : finalMatched === 0
          ? "no_keyword_match_in_lookback"
          : "unknown";

  const exactNext =
    launchEligible
      ? "ingest_candidates_dry_run_then_admin_review"
      : remainingBlocker === "onclick_event_url_required" ||
          remainingBlocker === "detail_url_resolution_failed"
        ? "capture_onclick_payload_and_extend_generic_url_builder"
        : remainingBlocker === "list_selector_mismatch"
          ? "retune_list_item_selector_against_live_html"
          : remainingBlocker === "network_dns_or_tls_failure" ||
              remainingBlocker === "http_forbidden" ||
              remainingBlocker === "timeout"
            ? "manual_browser_access_check_then_transport_policy_if_allowed"
            : remainingBlocker === "zero_observed_needs_empty_board_confirmation"
              ? "confirm_empty_board_vs_date_filter_with_CRAWL_ALLOW_UNDATED"
              : "manual_review_with_saved_html_evidence";

  outRows.push({
    source_id: s.sourceId,
    source_name: s.sourceName,
    list_url: csv?.[si.list_url] || "",
    initial_status: initialStatus,
    initial_error_bucket: initialBucket,
    initial_observed_count: initialObserved,
    initial_matched_count: initialMatched,
    root_cause_category: root.root_cause_category,
    root_cause_confidence: root.root_cause_confidence,
    root_cause_detail: root.root_cause_detail,
    site_structure: o?.[oi.access_profiles] || d?.[di.bucket] || "",
    action_taken: actionTaken,
    changed_config: wasError || wasZero ? "notice_url_pattern;list_item_selector(optional)" : "",
    changed_code:
      wasError || wasZero
        ? "deriveUniversitySlug;tune DO_DETAIL_URL_PATTERN;jf_viewArtcl;DEFAULT_NOTICE_URL_PATTERN"
        : "",
    diagnose_bucket: d?.[di.bucket] || "",
    primary_failure_code: o?.[oi.primary_failure_code] || "",
    recovered: recovered === true ? "true" : recovered === "success_zero" ? "success_zero" : "false",
    final_status: finalStatus,
    final_error_bucket: finalBucket,
    final_observed_count: finalObserved,
    final_matched_count: finalMatched,
    recent_notice_count: finalNew,
    detail_access_status: o?.[oi.detail_fetch_status] || "",
    canonical_url_status: o?.[oi.notice_url_resolution_status] || "",
    body_status: o?.[oi.detail_content_status] || "",
    attachment_status: "not_evaluated",
    candidate_handoff_status: handoffReady ? "ready" : "blocked",
    launch_eligible: launchEligible ? "true" : "false",
    remaining_blocker: remainingBlocker,
    exact_next_action: exactNext,
  });
}

const outDir = "reports/university-beta";
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync("docs", { recursive: true });

const cols = Object.keys(outRows[0]);
const csvOut = [
  cols.join(","),
  ...outRows.map((r) => cols.map((c) => toCsvCell(r[c])).join(",")),
].join("\n");
fs.writeFileSync(
  path.join(outDir, "four-year-university-source-remediation.csv"),
  `\uFEFF${csvOut}\n`,
  "utf8"
);

const initialErrors = outRows.filter((r) => r.initial_status !== "success");
const recoveredCount = initialErrors.filter((r) => r.recovered === "true").length;
const recoveredZero = initialErrors.filter((r) => r.recovered === "success_zero").length;
const unresolved = initialErrors.filter((r) => r.recovered === "false").length;
const launchEligible = outRows.filter((r) => r.launch_eligible === "true").length;
const handoffReady = outRows.filter((r) => r.candidate_handoff_status === "ready").length;

const causeDist = {};
for (const r of initialErrors) {
  causeDist[r.root_cause_category] = (causeDist[r.root_cause_category] || 0) + 1;
}

const finalErrorDist = {};
for (const r of outRows.filter((x) => x.final_status !== "success")) {
  finalErrorDist[r.final_error_bucket] = (finalErrorDist[r.final_error_bucket] || 0) + 1;
}

const arithmetic = {
  total_sources: outRows.length,
  equals_188: outRows.length === 188,
  initial_errors: initialErrors.length,
  equals_90: initialErrors.length === 90,
  recovered_plus_unresolved: recoveredCount + recoveredZero + unresolved,
  recovered_plus_unresolved_ok:
    recoveredCount + recoveredZero + unresolved === initialErrors.length,
  launch_eligible: launchEligible,
  launch_ineligible: outRows.length - launchEligible,
  unique_source_ids: new Set(outRows.map((r) => r.source_id)).size,
};

const meta = {
  run_at: new Date().toISOString(),
  git_commit: gitCommit,
  input_csv: "data/notice-sources-four-year-univ.csv",
  input_csv_sha256: crypto
    .createHash("sha256")
    .update(fs.readFileSync("data/notice-sources-four-year-univ.csv"))
    .digest("hex"),
  initial_report: "exports/notices-four-year-univ/scholarship-notices-latest.json",
  retry_report: "exports/notices-four-year-retry/scholarship-notices-latest.json",
  initial_summary: {
    sources: 188,
    success: 98,
    success_with_items: 78,
    success_zero: 20,
    errors: 90,
    observed: 702,
    matched: 293,
    new: 283,
  },
  retry_subset_summary: {
    sources: retry.totals.sourceCount,
    crawled: retry.totals.crawledCount,
    matched: retry.totals.matchedCount,
    new: retry.totals.newCount,
  },
  recovered_from_error_90_with_items: recoveredCount,
  recovered_from_error_90_to_success_zero: recoveredZero,
  unresolved_from_error_90: unresolved,
  launch_eligible_sources: launchEligible,
  candidate_handoff_ready: handoffReady,
  root_cause_distribution_error_90: causeDist,
  final_error_bucket_distribution: finalErrorDist,
  arithmetic,
  db_write: {
    performed: false,
    mode: "not_run",
    note: "INGEST_DRY_RUN recommended; production write not performed in this remediation pass",
  },
  sources: outRows,
};

fs.writeFileSync(
  path.join(outDir, "four-year-university-remediation.json"),
  JSON.stringify(meta, null, 2),
  "utf8"
);

// Final comparison summary markdown snippet
const finalSuccess = outRows.filter((r) => r.final_status === "success").length;
const finalWithItems = outRows.filter(
  (r) => r.final_status === "success" && Number(r.final_observed_count) > 0
).length;
const finalZero = finalSuccess - finalWithItems;
const finalErrors = outRows.length - finalSuccess;
const finalObserved = outRows.reduce((a, r) => a + Number(r.final_observed_count || 0), 0);
const finalMatched = outRows.reduce((a, r) => a + Number(r.final_matched_count || 0), 0);
const finalRecent = outRows.reduce((a, r) => a + Number(r.recent_notice_count || 0), 0);
const sourcesWithNew = outRows.filter((r) => Number(r.recent_notice_count || 0) > 0).length;

const summaryMd = `# Four-year university crawl remediation — rerun summary

| Metric | Initial | Final (merged) |
|--------|--------:|---------------:|
| Sources | 188 | ${outRows.length} |
| Success | 98 | ${finalSuccess} |
| Success with list items | 78 | ${finalWithItems} |
| Verified/assumed zero | 20 | ${finalZero} |
| Errors | 90 | ${finalErrors} |
| Observed items | 702 | ${finalObserved} |
| Keyword matched | 293 | ${finalMatched} |
| Recent/new notices | 283 | ${finalRecent} |
| Sources with new notices | 32 | ${sourcesWithNew} |
| Launch eligible | n/a | ${launchEligible} |
| Candidate handoff ready | n/a | ${handoffReady} |
| Recovered from error-90 (with items) | n/a | ${recoveredCount} |
| Unresolved from error-90 | n/a | ${unresolved} |

Arithmetic checks: ${JSON.stringify(arithmetic)}
`;

fs.writeFileSync(path.join(outDir, "four-year-remediation-rerun-summary.md"), summaryMd, "utf8");
console.log(summaryMd);
console.log(JSON.stringify({ recoveredCount, recoveredZero, unresolved, launchEligible, arithmetic }, null, 2));
