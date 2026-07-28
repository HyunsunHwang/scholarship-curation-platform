import { canonicalizeNoticeUrl } from "./normalized-graph.mjs";
import { summarizeLegacyArtifact } from "./legacy-notice-artifact.mjs";
import { summarizeGraphPlan } from "./normalized-graph.mjs";
import { HANDOFF_STATUS_READY } from "../crawler-engine/crawler-handoff.mjs";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeTitle(value) {
  return clean(value).toLocaleLowerCase("ko-KR");
}

function datePresence(value) {
  const text = clean(value);
  if (!text) return "missing";
  const head = text.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : "unparsed";
}

function applicationLinkSet(links) {
  const values = Array.isArray(links) ? links : [];
  return [...new Set(values.map((link) => {
    if (typeof link === "string") return clean(link);
    return clean(link?.url ?? link?.href);
  }).filter(Boolean))].sort();
}

function legacyMatchKey(row) {
  const sourceId = clean(row.source_id);
  const canonical = canonicalizeNoticeUrl(row.canonical_url ?? row.notice_url) || clean(row.notice_url);
  return `${sourceId}|${canonical}`;
}

function normalizedRowsFromPlan(plan) {
  const notices = plan?.tables?.ingestion_notices ?? [];
  const revisions = new Map((plan?.tables?.ingestion_notice_revisions ?? []).map((row) => [row.notice_id, row]));
  const occurrences = new Map((plan?.tables?.ingestion_notice_occurrences ?? []).map((row) => [row.notice_id, row]));
  const assetsByNotice = new Map();
  for (const asset of plan?.tables?.ingestion_notice_assets ?? []) {
    const bucket = assetsByNotice.get(asset.notice_id) ?? [];
    bucket.push(asset);
    assetsByNotice.set(asset.notice_id, bucket);
  }

  return notices.map((notice) => {
    const revision = revisions.get(notice.id) ?? null;
    const occurrence = occurrences.get(notice.id) ?? null;
    const assets = assetsByNotice.get(notice.id) ?? [];
    const sections = revision?.normalized_payload?.inline_sections;
    const sectionLinks = Array.isArray(sections)
      ? sections.flatMap((section) => applicationLinkSet(section.section_links))
      : [];
    const payloadAppLinks = applicationLinkSet(
      revision?.normalized_payload?.application_links,
    );
    return {
      source_id: clean(notice.source_id),
      notice_id: notice.id,
      identity_kind: clean(notice.identity_kind),
      identity_key: clean(notice.identity_key),
      canonical_url: clean(notice.canonical_url),
      title: clean(revision?.title),
      body: clean(revision?.body) || null,
      body_present: Boolean(clean(revision?.body)),
      body_quality: clean(revision?.body_quality_status) || null,
      notice_posted_at: datePresence(occurrence?.raw_date_text),
      raw_date_text: clean(occurrence?.raw_date_text) || null,
      attachment_count: assets.length,
      application_links: [...new Set([...payloadAppLinks, ...sectionLinks])].sort(),
      candidate_classification: Array.isArray(sections)
        ? clean(sections.find((section) => section.candidate_classification)?.candidate_classification)
        : clean(revision?.normalized_payload?.candidate_classification) || null,
      inline_section_count: Array.isArray(sections) ? sections.length : 0,
      match_key: `${clean(notice.source_id)}|${clean(notice.canonical_url)}`,
    };
  });
}

function comparePair(legacy, normalized) {
  const mismatches = [];
  if (clean(legacy.source_id) !== clean(normalized.source_id)) {
    mismatches.push("source");
  }
  if (normalizeTitle(legacy.title) !== normalizeTitle(normalized.title)) {
    // Inline multi-section pages intentionally synthesize a page title from sections.
    if (normalized.inline_section_count > 1) {
      mismatches.push("title_section_collapse_expected");
    } else {
      mismatches.push("title");
    }
  }
  const legacyDate = datePresence(legacy.notice_posted_at || legacy.raw_date_text);
  const normalizedDate = datePresence(normalized.notice_posted_at || normalized.raw_date_text);
  if (legacyDate !== "missing" && normalizedDate !== "missing" && legacyDate !== "unparsed"
    && normalizedDate !== "unparsed" && legacyDate !== normalizedDate) {
    mismatches.push("published_date");
  }
  const legacyCanonical = canonicalizeNoticeUrl(legacy.canonical_url ?? legacy.notice_url);
  if (legacyCanonical && legacyCanonical !== clean(normalized.canonical_url)) {
    mismatches.push("canonical_url");
  }
  if (Boolean(legacy.body_present) !== Boolean(normalized.body_present)) {
    mismatches.push("body_presence");
  }
  if (Number(legacy.attachment_count ?? 0) !== Number(normalized.attachment_count ?? 0)) {
    mismatches.push("attachment_count");
  }
  const legacyApps = applicationLinkSet(legacy.application_links).join("|");
  const normalizedApps = applicationLinkSet(normalized.application_links).join("|");
  if (legacyApps && normalizedApps && legacyApps !== normalizedApps) {
    mismatches.push("application_links");
  }
  if (
    legacy.candidate_classification
    && normalized.candidate_classification
    && clean(legacy.candidate_classification) !== clean(normalized.candidate_classification)
  ) {
    mismatches.push("candidate_classification");
  }

  const hardMismatches = mismatches.filter((code) => code !== "title_section_collapse_expected");
  let status = "matched";
  if (hardMismatches.length > 0) status = "field_mismatch";
  if (legacy.identity_kind === "legacy_notice_url" && normalized.identity_kind) {
    // Always emit mapping detail; elevate only when fields already mismatch.
    if (status === "matched" && mismatches.includes("title_section_collapse_expected")) {
      status = "identity_mapping_review";
    }
  }
  return {
    status,
    mismatches,
    identity_mapping: {
      legacy_identity_kind: legacy.identity_kind,
      legacy_identity_key: legacy.identity_key,
      normalized_identity_kind: normalized.identity_kind,
      normalized_identity_key: normalized.identity_key,
    },
  };
}

function collectHardBlockers({ plan, blockedSources, adapted }) {
  const blockers = [];
  if (!adapted?.validation?.valid) {
    blockers.push("handoff_validation_failed");
  }
  if ((blockedSources ?? []).length > 0) {
    blockers.push("handoff_sources_blocked");
  }
  if (adapted?.plan_error) {
    blockers.push(`plan_error:${adapted.plan_error}`);
  }
  for (const notice of plan?.tables?.ingestion_notices ?? []) {
    if (!["external_article_id", "canonical_detail_url"].includes(clean(notice.identity_kind))) {
      blockers.push("unsupported_identity_kinds");
      break;
    }
  }
  const aliasKeys = (plan?.tables?.ingestion_notice_url_aliases ?? []).map(
    (row) => `${row.source_id}|${row.normalized_url_hash}`,
  );
  if (new Set(aliasKeys).size !== aliasKeys.length) {
    blockers.push("alias_uniqueness_conflicts");
  }
  for (const revision of plan?.tables?.ingestion_notice_revisions ?? []) {
    const sections = revision?.normalized_payload?.inline_sections;
    const policy = revision?.normalized_payload?.inline_section_policy;
    if (policy === "page_evidence_v1" && (!Array.isArray(sections) || sections.length === 0)) {
      blockers.push("missing_inline_section_evidence");
      break;
    }
  }
  return [...new Set(blockers)];
}

export function compareShadowParity({
  legacyArtifact,
  adapted,
  generatedAt = new Date().toISOString(),
} = {}) {
  const plan = adapted?.plan ?? null;
  const normalizedRows = normalizedRowsFromPlan(plan);
  const legacyRows = (legacyArtifact?.records ?? []).map((row) => ({
    ...row,
    match_key: legacyMatchKey(row),
  }));

  const legacyByKey = new Map();
  for (const row of legacyRows) {
    if (!legacyByKey.has(row.match_key)) legacyByKey.set(row.match_key, row);
  }
  const normalizedByKey = new Map();
  for (const row of normalizedRows) {
    if (!normalizedByKey.has(row.match_key)) normalizedByKey.set(row.match_key, row);
  }

  const allKeys = [...new Set([...legacyByKey.keys(), ...normalizedByKey.keys()])].sort();
  const comparisons = [];
  const statusCounts = {
    matched: 0,
    legacy_only: 0,
    normalized_only: 0,
    field_mismatch: 0,
    identity_mapping_review: 0,
  };

  for (const key of allKeys) {
    const legacy = legacyByKey.get(key) ?? null;
    const normalized = normalizedByKey.get(key) ?? null;
    if (legacy && !normalized) {
      statusCounts.legacy_only += 1;
      comparisons.push({
        match_key: key,
        status: "legacy_only",
        legacy,
        normalized: null,
        mismatches: ["normalized_missing"],
      });
      continue;
    }
    if (!legacy && normalized) {
      statusCounts.normalized_only += 1;
      comparisons.push({
        match_key: key,
        status: "normalized_only",
        legacy: null,
        normalized,
        mismatches: ["legacy_missing"],
      });
      continue;
    }
    const result = comparePair(legacy, normalized);
    statusCounts[result.status] = (statusCounts[result.status] ?? 0) + 1;
    comparisons.push({
      match_key: key,
      status: result.status,
      legacy,
      normalized,
      mismatches: result.mismatches,
      identity_mapping: result.identity_mapping,
    });
  }

  const hardBlockers = collectHardBlockers({
    plan,
    blockedSources: adapted?.blocked_sources,
    adapted,
  });

  return {
    schema_version: "shadow-parity-report-v1",
    generated_at: generatedAt,
    safety: {
      databaseReadPerformed: false,
      databaseWritePerformed: false,
      publicWritePerformed: false,
      externalLlmCallCount: 0,
      writes_performed: false,
      scheduled_cutover: false,
    },
    legacy_summary: summarizeLegacyArtifact(legacyArtifact),
    normalized_summary: plan ? summarizeGraphPlan(plan) : null,
    notice_counts: {
      legacy: legacyRows.length,
      normalized: normalizedRows.length,
      distinct_match_keys: allKeys.length,
    },
    status_counts: statusCounts,
    hard_blockers: hardBlockers,
    blocked_sources: adapted?.blocked_sources ?? [],
    handoff_ready_source_count: (adapted?.graph_input?.source_results ?? []).length,
    handoff_status_contract: HANDOFF_STATUS_READY,
    comparisons,
  };
}

export function renderShadowParityMarkdown(report) {
  const lines = [];
  lines.push("# Shadow Parity Report");
  lines.push("");
  lines.push(`- generated_at: \`${report.generated_at}\``);
  lines.push(`- schema_version: \`${report.schema_version}\``);
  lines.push("- mode: local dry-run (no DB write, no scheduled cutover)");
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push(`- legacy notices: **${report.notice_counts.legacy}**`);
  lines.push(`- normalized notices: **${report.notice_counts.normalized}**`);
  lines.push(`- match keys: **${report.notice_counts.distinct_match_keys}**`);
  lines.push("");
  lines.push("## Status");
  lines.push("");
  for (const [status, count] of Object.entries(report.status_counts)) {
    lines.push(`- ${status}: **${count}**`);
  }
  lines.push("");
  lines.push("## Hard blockers");
  lines.push("");
  if ((report.hard_blockers ?? []).length === 0) {
    lines.push("- none");
  } else {
    for (const blocker of report.hard_blockers) lines.push(`- ${blocker}`);
  }
  lines.push("");
  lines.push("## Comparisons");
  lines.push("");
  for (const row of report.comparisons.slice(0, 50)) {
    lines.push(`### \`${row.match_key}\``);
    lines.push(`- status: \`${row.status}\``);
    if (row.mismatches?.length) lines.push(`- mismatches: ${row.mismatches.join(", ")}`);
    if (row.identity_mapping) {
      lines.push(
        `- identity: legacy \`${row.identity_mapping.legacy_identity_kind}\` → normalized \`${row.identity_mapping.normalized_identity_kind}\``,
      );
    }
    lines.push("");
  }
  if (report.comparisons.length > 50) {
    lines.push(`_… ${report.comparisons.length - 50} more comparisons omitted_`);
    lines.push("");
  }
  lines.push("## Safety");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.safety, null, 2));
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
}
