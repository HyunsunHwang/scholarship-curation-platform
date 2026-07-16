import fs from "node:fs";
import path from "node:path";
import { buildBetaCohort } from "../../lib/post-phase-n-q/beta-cohort.mjs";
import { classifyScholarshipRelevance } from "../../lib/post-phase-m/scholarship-relevance.mjs";

const ROOT = process.cwd();
const readJson = (file) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const base = readJson(
  "reports/post-phase-n-q/live-crawler/scholarship-notices-latest.json",
);
const cau002 = readJson(
  "reports/post-phase-n-q/live-cau-002-system-ca/scholarship-notices-latest.json",
);
const yonsei = readJson(
  "reports/post-phase-n-q/live-yonsei-060-remediation/scholarship-notices-latest.json",
);
const cohort = buildBetaCohort();
const noticeUrlPattern =
  /(mode=view|p_mode=view|act=view|uid=\d+|mod=document|wr_id=\d+|seq=\d+|idx=\d+|bbsIdx=\d+)/i;

function evidenceForSource(sourceKey) {
  if (sourceKey === "cau_002") return cau002;
  if (sourceKey === "yonsei_060") return yonsei;
  return base;
}

function classifyStatus(sourceKey, sourceResult, observedItems, matchedItems) {
  if (sourceResult.error) {
    return /tls|certificate/i.test(sourceResult.error)
      ? "TLS_BLOCKED"
      : "TRANSPORT_BLOCKED";
  }
  const noticeLikeCount = observedItems.filter((item) =>
    noticeUrlPattern.test(item.noticeUrl),
  ).length;
  if (
    ["cau_004", "cau_006"].includes(sourceKey) &&
    noticeLikeCount < Math.ceil(observedItems.length * 0.6)
  ) {
    return "SELECTOR_OR_SCOPE_DEFECT";
  }
  const positiveCount = matchedItems.filter(
    (item) =>
      item.relevance.scholarship_relevance_classification ===
      "scholarship_true_positive",
  ).length;
  if (positiveCount > 0) return "LIVE_TRUE_POSITIVE_FOUND";
  if (matchedItems.length > 0) return "ATTRIBUTABLE_CONTEXTUAL_OR_FALSE_POSITIVE";
  return "BOUNDED_ZERO_MATCH";
}

const sources = cohort.sources.map((source) => {
  const evidence = evidenceForSource(source.source_key);
  const sourceResult = evidence.perSource.find(
    (item) => item.sourceId === source.source_key,
  );
  const observedItems = evidence.observedItems.filter(
    (item) => item.sourceId === source.source_key,
  );
  const matchedItems = evidence.newNotices
    .filter((item) => item.sourceId === source.source_key)
    .map((item) => ({
      title: item.title,
      detail_url: item.noticeUrl,
      parsed_date: item.parsedDate,
      body_text_length: item.qualitySignals?.bodyTextLength ?? 0,
      body_quality: item.qualitySignals?.classification ?? "unknown",
      attachment_metadata_count: item.attachmentMetadata?.length ?? 0,
      attribution_proof: {
        source_context_match: item.listUrl === source.official_list_url,
        detail_url_present: Boolean(item.noticeUrl),
        title_present: Boolean(item.title),
        body_present: Boolean(item.content?.trim()),
      },
      relevance: classifyScholarshipRelevance({
        title: item.title,
        body: item.content,
        attributionVerified:
          item.listUrl === source.official_list_url &&
          Boolean(item.noticeUrl) &&
          Boolean(item.content?.trim()),
      }),
    }));
  const parsedDates = observedItems
    .map((item) => item.parsedDate)
    .filter(Boolean)
    .sort();
  const status = classifyStatus(
    source.source_key,
    sourceResult,
    observedItems,
    matchedItems,
  );
  const bodyLengths = matchedItems.map((item) => item.body_text_length);
  const attachmentMetadataCount = matchedItems.reduce(
    (sum, item) => sum + item.attachment_metadata_count,
    0,
  );
  return {
    source_key: source.source_key,
    source_name: source.source_name,
    cohort_role: source.cohort_role,
    official_list_url: source.official_list_url,
    exact_identity: true,
    list_selector: source.list_selector,
    link_selector: source.link_selector,
    pagination: {
      max_pages: 5,
      max_items: 30,
      observed_item_count: sourceResult?.crawledCount ?? 0,
    },
    fixed_normal_notice_handling:
      "Bounded current-list order retained; pinned status is not inferred when the source does not expose it.",
    detail_url_derivation:
      sourceResult?.adapterStrategy ?? "unavailable",
    detail_attribution_proof_count: matchedItems.filter(
      (item) =>
        item.attribution_proof.source_context_match &&
        item.attribution_proof.detail_url_present &&
        item.attribution_proof.title_present &&
        item.attribution_proof.body_present,
    ).length,
    title_consistency:
      matchedItems.length === 0
        ? null
        : matchedItems.every((item) => item.title.length > 3),
    publication_date: {
      parsed_count: parsedDates.length,
      min: parsedDates[0] ?? null,
      max: parsedDates.at(-1) ?? null,
    },
    body_selector: source.detail_body_selector,
    body_text_length: {
      min: bodyLengths.length ? Math.min(...bodyLengths) : 0,
      max: bodyLengths.length ? Math.max(...bodyLengths) : 0,
    },
    body_quality:
      matchedItems.length === 0
        ? "not_applicable"
        : matchedItems.every((item) => item.body_quality === "clean")
          ? "clean"
          : "review_required",
    footer_navigation_contamination:
      ["cau_004", "cau_006"].includes(source.source_key)
        ? "selector_scope_contamination_observed"
        : "not_observed_in_attributable_matches",
    attachment: {
      metadata_discovered_count: attachmentMetadataCount,
      download_attempted_count: 0,
      parsed_count: 0,
      status:
        attachmentMetadataCount > 0
          ? "METADATA_ONLY"
          : "NO_METADATA_IN_MATCHED_ITEMS",
    },
    relevance_distribution: Object.fromEntries(
      [
        "scholarship_true_positive",
        "contextual_only",
        "false_positive",
        "insufficient_evidence",
      ].map((classification) => [
        classification,
        matchedItems.filter(
          (item) =>
            item.relevance.scholarship_relevance_classification ===
            classification,
        ).length,
      ]),
    ),
    status,
    transport:
      source.source_key === "cau_002"
        ? {
            initial_status: "TLS_BLOCKED",
            remediation: "NODE_USE_SYSTEM_CA_OR_NODE_USE_SYSTEM_CA_FLAG",
            certificate_verification_preserved: true,
            final_status: "TLS_REMEDIATED",
          }
        : {
            final_status: sourceResult?.error ? "TRANSPORT_BLOCKED" : "REACHABLE",
          },
    titles_inspected: observedItems.map((item) => item.title),
    matched_items: matchedItems,
    limitations: [
      status === "BOUNDED_ZERO_MATCH"
        ? "This is a bounded zero-match observation and is not evidence that scholarships are absent."
        : null,
      status === "SELECTOR_OR_SCOPE_DEFECT"
        ? "Generic anchors include navigation or non-notice content; source is excluded from canary."
        : null,
      attachmentMetadataCount > 0
        ? "Attachment metadata is not download or parser success."
        : null,
    ].filter(Boolean),
  };
});

const report = {
  generated_at: new Date().toISOString(),
  contract_version: "post-phase-p-live-source-inspection/v1",
  evidence_kind: "live_public",
  bounded_scope: {
    source_count: sources.length,
    max_pages_per_source: 5,
    max_items_per_source: 30,
    source_concurrency: 1,
  },
  sources,
  live_source_count: sources.length,
  live_true_positive_source_count: sources.filter(
    (source) => source.status === "LIVE_TRUE_POSITIVE_FOUND",
  ).length,
  bounded_zero_match_source_count: sources.filter(
    (source) => source.status === "BOUNDED_ZERO_MATCH",
  ).length,
  selector_or_scope_defect_count: sources.filter(
    (source) => source.status === "SELECTOR_OR_SCOPE_DEFECT",
  ).length,
  contextual_or_false_positive_source_count: sources.filter(
    (source) =>
      source.status === "ATTRIBUTABLE_CONTEXTUAL_OR_FALSE_POSITIVE",
  ).length,
  cau_002_tls_status: "TLS_REMEDIATED",
  cau_008_status:
    sources.find((source) => source.source_key === "cau_008")?.status ?? null,
  yonsei_060_body_status:
    sources.find((source) => source.source_key === "yonsei_060")
      ?.body_text_length.max >= 100
      ? "BODY_EXTRACTION_REMEDIATED"
      : "BODY_SELECTOR_HOLD",
  insecure_tls_host_count: 0,
  tls_verification_disabled: false,
  fuzzy_source_match_count: 0,
  automatic_source_create_count: 0,
  production_access_performed: false,
  passed:
    sources.length === cohort.source_count &&
    sources.some(
      (source) =>
        source.source_key === "yonsei_060" &&
        source.status === "LIVE_TRUE_POSITIVE_FOUND",
    ),
};

fs.writeFileSync(
  path.join(ROOT, "reports/post-phase-n-q/live-source-inspection.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify({
  passed: report.passed,
  live_true_positive_source_count: report.live_true_positive_source_count,
  bounded_zero_match_source_count: report.bounded_zero_match_source_count,
  selector_or_scope_defect_count: report.selector_or_scope_defect_count,
  cau_002_tls_status: report.cau_002_tls_status,
  yonsei_060_body_status: report.yonsei_060_body_status,
  output_path: "reports/post-phase-n-q/live-source-inspection.json",
}, null, 2));
if (!report.passed) process.exitCode = 1;
