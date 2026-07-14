import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { load as loadHtml } from "cheerio";

import {
  extractFromList,
  fetchHtmlWithMetadata,
  formatFetchError,
} from "./crawl-scholarship-notices.mjs";
import { extractDetailFromCheerio } from "../lib/notice-body-extraction.mjs";
import { readSourceConfigFromCsv } from "../lib/notice-sources-loader.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceCsvPath = resolve(repoRoot, "data/notice-sources.csv");
const fixtureAfterPath = resolve(
  repoRoot,
  "fixtures/post-phase-h/expanded/bounded-source-evidence.json",
);
const liveReportPath = resolve(
  repoRoot,
  "reports/post-phase-h-live-bounded-source-verification.json",
);
const comparisonPath = resolve(
  repoRoot,
  "reports/post-phase-h-live-vs-fixture-comparison.json",
);
const minimalFixturePath = resolve(
  repoRoot,
  "fixtures/post-phase-h/live/bounded-source-observation.json",
);

const targetSourceIds = ["cau_002", "cau_003", "cau_007", "cau_008"];
const budget = {
  max_list_pages_per_source: 2,
  max_detail_items_per_source: 3,
  max_attachment_metadata_checks_per_source: 3,
  max_attachment_downloads_per_source: 1,
  max_retries: 2,
  request_timeout_ms: 15_000,
  source_interval_ms: 500,
  public_endpoints_only: true,
};

function repositoryPath(value) {
  return relative(repoRoot, value).replaceAll("\\", "/");
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function truncate(value, max = 240) {
  const text = cleanText(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function sanitizePublicUrl(value) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/^(token|key|signature|sig|session|cookie|auth|password)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function failureObservation(requestType, requestUrl, error) {
  return {
    request_type: requestType,
    request_url: sanitizePublicUrl(requestUrl),
    http_status: Number.isInteger(error?.httpStatus) ? error.httpStatus : null,
    final_url: sanitizePublicUrl(error?.finalUrl ?? ""),
    timeout_ms: budget.request_timeout_ms,
    retry_count: budget.max_retries,
    response_evidence_type: "request_failure",
    request_outcome: "failed_closed",
    error: truncate(formatFetchError(error), 320),
  };
}

async function fetchObservation(requestType, requestUrl) {
  try {
    const result = await fetchHtmlWithMetadata(requestUrl);
    return {
      html: result.html,
      observation: {
        request_type: requestType,
        request_url: sanitizePublicUrl(requestUrl),
        http_status: result.httpStatus,
        final_url: sanitizePublicUrl(result.finalUrl),
        timeout_ms: budget.request_timeout_ms,
        retry_count: result.retryCount,
        response_evidence_type: "html",
        request_outcome: "success",
      },
    };
  } catch (error) {
    return { html: "", observation: failureObservation(requestType, requestUrl, error) };
  }
}

function detailEvidence(source, listItem, observation, html) {
  if (!html) {
    return {
      list_item_title: truncate(listItem.title),
      detail_url: sanitizePublicUrl(listItem.noticeUrl),
      fetch: observation,
      parser_outcome: "not_run_after_fetch_failure",
    };
  }

  const $ = loadHtml(html);
  $("script, style, nav, footer, header, aside, noscript").remove();
  const detail = extractDetailFromCheerio($, {
    baseUrl: listItem.noticeUrl || source.baseUrl || source.listUrl,
    sourceId: source.sourceId,
    detailContentSelector: source.detailContentSelector,
    maxAttachments: budget.max_attachment_metadata_checks_per_source,
  });
  return {
    list_item_title: truncate(listItem.title),
    detail_url: sanitizePublicUrl(listItem.noticeUrl),
    fetch: observation,
    parser_outcome: "completed",
    detail_candidate_mapping_status:
      source.listItemSelector || source.noticeUrlPattern
        ? "source_specific_mapping_configured"
        : "unverified_without_source_specific_mapping",
    content_selector: detail.contentSelector || null,
    body_text_length: detail.content.length,
    body_replacement_character_count: detail.qualitySignals.replacementCharacterCount,
    encoding_or_mojibake_suspected: detail.qualitySignals.encodingOrMojibakeSuspected,
    quality_classification: detail.qualitySignals.classification,
    quality_reason_codes: detail.qualitySignals.reasonCodes,
    attachment_metadata_count: detail.attachmentMetadata.length,
    attachment_metadata: detail.attachmentMetadata.slice(0, budget.max_attachment_metadata_checks_per_source).map((attachment) => ({
      url: sanitizePublicUrl(attachment.url),
      file_name: truncate(attachment.fileName, 160) || null,
      extension: attachment.extension || null,
      relation: attachment.relation,
    })),
    attachment_download_attempted: false,
  };
}

async function inspectSource(source, checkedAt) {
  const listFetch = await fetchObservation("list_page", source.listUrl);
  const shared = {
    checked_at: checkedAt,
    source_id: source.sourceId,
    source_key: source.sourceId,
    fixture_or_live: "live_observation",
    list_pages_budget: budget.max_list_pages_per_source,
    list_pages_checked: 1,
    detail_items_budget: budget.max_detail_items_per_source,
    attachment_download_budget: budget.max_attachment_downloads_per_source,
    source_specific_detail_mapping_configured: Boolean(
      source.listItemSelector || source.noticeUrlPattern,
    ),
    list_fetch: listFetch.observation,
  };

  if (!listFetch.html) {
    return {
      ...shared,
      live_result_classification: "live_verification_blocked",
      observed_list_item_count: 0,
      detail_items_checked: 0,
      limitation: "List request failed closed; TLS, access, or network remediation requires a separately approved environment fix.",
    };
  }

  const items = extractFromList(source, listFetch.html).slice(0, budget.max_detail_items_per_source);
  if (items.length === 0) {
    return {
      ...shared,
      live_result_classification: "live_evidence_insufficient",
      observed_list_item_count: 0,
      detail_items_checked: 0,
      pagination_stop_reason: "no_reusable_pagination_adapter_or_configured_second_page_url",
      limitation: "A successful list response did not yield bounded detail candidates through the existing list extractor.",
    };
  }

  const details = [];
  for (const item of items) {
    const detailFetch = await fetchObservation("detail_page", item.noticeUrl);
    details.push(detailEvidence(source, item, detailFetch.observation, detailFetch.html));
    await new Promise((done) => setTimeout(done, budget.source_interval_ms));
  }
  const completedDetailCount = details.filter((detail) => detail.parser_outcome === "completed").length;
  const detailCandidateMappingVerified = Boolean(
    source.listItemSelector || source.noticeUrlPattern,
  );
  return {
    ...shared,
    live_result_classification:
      detailCandidateMappingVerified && completedDetailCount > 0
        ? "live_evidence_captured"
        : "live_evidence_insufficient",
    observed_list_item_count: items.length,
    detail_items_checked: details.length,
    detail_items_with_parser_evidence: completedDetailCount,
    pagination_stop_reason: "no_reusable_pagination_adapter_or_configured_second_page_url",
    detail_observations: details,
    limitation:
      detailCandidateMappingVerified
        ? "One public list page was inspected within the two-page cap; no generic second-page URL was inferred or requested."
        : "The existing source configuration lacks a source-specific list selector or detail URL pattern, so generic anchor candidates are not verified as notice-detail mappings.",
  };
}

function reclassifyExistingObservation(observation, source) {
  if (!observation.list_fetch || observation.list_fetch.request_outcome !== "success") {
    return observation;
  }
  const detailCandidateMappingVerified = Boolean(
    source.listItemSelector || source.noticeUrlPattern,
  );
  if (detailCandidateMappingVerified) return observation;
  return {
    ...observation,
    source_specific_detail_mapping_configured: false,
    live_result_classification: "live_evidence_insufficient",
    detail_observations: (observation.detail_observations ?? []).map((detail) => ({
      ...detail,
      detail_candidate_mapping_status: "unverified_without_source_specific_mapping",
    })),
    limitation:
      "The existing source configuration lacks a source-specific list selector or detail URL pattern, so generic anchor candidates are not verified as notice-detail mappings.",
  };
}

function makeComparison(fixtureAfter, observations, checkedAt) {
  const fixtureBySource = new Map(fixtureAfter.sources.map((source) => [source.source_id, source]));
  const sources = observations.map((observation) => {
    const fixture = fixtureBySource.get(observation.source_id);
    return {
      source_id: observation.source_id,
      source_key: observation.source_key,
      fixture_backed_after: fixture
        ? {
            list_items_observed: fixture.list_items_observed,
            detail_urls_resolved: fixture.detail_urls_resolved,
            body_parse_success: fixture.body_parse_success,
            attachment_metadata_present: fixture.attachment_metadata_present,
            source_health_status: fixture.source_health_status,
          }
        : null,
      live_observation: {
        live_result_classification: observation.live_result_classification,
        list_http_status: observation.list_fetch.http_status,
        observed_list_item_count: observation.observed_list_item_count,
        detail_items_with_parser_evidence: observation.detail_items_with_parser_evidence ?? 0,
      },
      live_inference: "Live observations are bounded point-in-time evidence and do not establish fixture equivalence, source exhaustion, or scholarship absence.",
      unverified_backlog: observation.live_result_classification === "live_evidence_captured"
        ? ["pagination beyond one observed page", "review and public exposure decision"]
        : [observation.limitation],
    };
  });
  return {
    generated_at: checkedAt,
    contract_version: "post-phase-h-live-vs-fixture-comparison/v1",
    read_only: true,
    fixture_backed_baseline: "fixtures/post-phase-h/baseline/bounded-source-evidence.json",
    fixture_backed_after: "fixtures/post-phase-h/expanded/bounded-source-evidence.json",
    live_observation: "reports/post-phase-h-live-bounded-source-verification.json",
    sources,
  };
}

async function main() {
  const checkedAt = new Date().toISOString();
  const allSources = readSourceConfigFromCsv(sourceCsvPath);
  const byId = new Map(allSources.map((source) => [source.sourceId, source]));
  const missing = targetSourceIds.filter((sourceId) => !byId.has(sourceId));
  if (missing.length > 0) throw new Error(`Missing target sources: ${missing.join(", ")}`);

  if (process.argv.includes("--from-existing-report")) {
    const existing = JSON.parse(await readFile(liveReportPath, "utf8"));
    const observations = existing.live_observation.map((observation) =>
      reclassifyExistingObservation(observation, byId.get(observation.source_id)),
    );
    const fixtureAfter = JSON.parse(await readFile(fixtureAfterPath, "utf8"));
    const report = { ...existing, live_observation: observations };
    const comparison = makeComparison(fixtureAfter, observations, existing.generated_at);
    const minimalFixture = {
      generated_at: existing.generated_at,
      contract_version: "post-phase-h-live-bounded-source-observation/v1",
      provenance: "sanitized live public endpoint observations; no HTML, cookies, credentials, or downloaded files retained",
      bounds: budget,
      sources: observations,
    };
    await mkdir(dirname(minimalFixturePath), { recursive: true });
    await writeFile(liveReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(comparisonPath, `${JSON.stringify(comparison, null, 2)}\n`, "utf8");
    await writeFile(minimalFixturePath, `${JSON.stringify(minimalFixture, null, 2)}\n`, "utf8");
    console.log("Rewrote Post-Phase H artifacts from existing live observations without network access.");
    return;
  }

  const observations = [];
  for (const sourceId of targetSourceIds) {
    observations.push(await inspectSource(byId.get(sourceId), checkedAt));
    await new Promise((done) => setTimeout(done, budget.source_interval_ms));
  }
  const fixtureAfter = JSON.parse(await readFile(fixtureAfterPath, "utf8"));
  const report = {
    generated_at: checkedAt,
    contract_version: "post-phase-h-live-bounded-source-verification/v1",
    read_only: true,
    db_access: false,
    db_write: false,
    supabase_access: false,
    migration: false,
    production_apply: false,
    operational_crawler_workflow_execution: false,
    full_crawl: false,
    public_exposure_auto_expansion: false,
    input_paths: {
      source_csv: repositoryPath(sourceCsvPath),
      fixture_after: repositoryPath(fixtureAfterPath),
    },
    bounds: budget,
    fixture_backed_baseline: "fixtures/post-phase-h/baseline/bounded-source-evidence.json",
    fixture_backed_after: "fixtures/post-phase-h/expanded/bounded-source-evidence.json",
    live_observation: observations,
    live_inference: "The captured observations are source-specific, bounded, and point-in-time only. They are not coverage, absence, or public-exposure evidence.",
    unverified_backlog: [
      "No source is exhausted by this run.",
      "No attachment download or content interpretation was attempted.",
      "No review outcome, database write, or public exposure decision was made.",
    ],
  };
  const comparison = makeComparison(fixtureAfter, observations, checkedAt);
  const minimalFixture = {
    generated_at: checkedAt,
    contract_version: "post-phase-h-live-bounded-source-observation/v1",
    provenance: "sanitized live public endpoint observations; no HTML, cookies, credentials, or downloaded files retained",
    bounds: budget,
    sources: observations,
  };
  await mkdir(dirname(minimalFixturePath), { recursive: true });
  await writeFile(liveReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(comparisonPath, `${JSON.stringify(comparison, null, 2)}\n`, "utf8");
  await writeFile(minimalFixturePath, `${JSON.stringify(minimalFixture, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "PASS",
    target_source_count: observations.length,
    live_evidence_captured_count: observations.filter((source) => source.live_result_classification === "live_evidence_captured").length,
    blocked_count: observations.filter((source) => source.live_result_classification === "live_verification_blocked").length,
  }, null, 2));
}

await main();
