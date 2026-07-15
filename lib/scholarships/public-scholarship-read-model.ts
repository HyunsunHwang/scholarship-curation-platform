import f0Report from "@/reports/post-phase-f0-adapter-foundation.json";
import f1Report from "@/reports/post-phase-f1-admin-review-integration.json";

import {
  evaluatePublicScholarshipExposure,
  type PublicExposureInput,
  type ScholarshipExposureStatus,
} from "./public-scholarship-exposure-policy";

type F0Row = {
  canonical_key: string;
  source_id: string | null;
  source_key_snapshot: string;
  source_resolution_status: string;
  title: string;
  original_url: string;
  published_at: string;
  body_text: string;
  no_assets: boolean;
  review_status: string;
  quality_status: string;
  blocker_status: string | null;
  duplicate_status: string;
  admin_review_required: boolean;
  target_summary: string[];
  keyword_summary: string[];
  body_quality: string;
  image_only_suspected: boolean;
  source_result_status: string;
  zero_match_observed: boolean;
  batch_observability_status: string;
  evidence_json: {
    source_resolution?: {
      evidence?: { source_name?: string; source_level?: string };
    };
    quality_policy?: { assets?: Array<{ url: string; kind: string }> };
  };
};

type F1Row = {
  id: string;
  parserFailureReasonCodes?: string[];
  qualityFlags?: string[];
  f3RiskCodes?: string[];
};

type ReportShape = { review_read_model: F0Row[] };
type DiagnosticShape = { diagnostics: F1Row[] };

const f0Rows = (f0Report as ReportShape).review_read_model;
const f1Rows = (f1Report as DiagnosticShape).diagnostics;
const diagnosticsByKey = new Map(f1Rows.map((row) => [row.id, row]));

export type PublicScholarship = {
  id: string;
  canonicalKey: string;
  sourceId: string | null;
  sourceKey: string;
  title: string;
  organization: string;
  category: string;
  targetLabels: string[];
  keywordLabels: string[];
  publishedAt: string;
  summary: string;
  body: string;
  sourceUrl: string;
  attachments: Array<{ url: string; kind: string }>;
  noAssets: boolean;
  provenanceLabel: string;
};

export type PublicScholarshipReadModelStatus = {
  dataBacking: "report-backed";
  serviceState: "prototype-only";
  generatedAt: string;
  sourceReport: string;
  inputCandidateCount: number;
  publicItemCount: number;
  hiddenItemCount: number;
  exposurePolicy: "fail-closed";
  attachmentsVerified: false;
};

export type ExposureDecision = {
  canonicalKey: string;
  exposureStatus: ScholarshipExposureStatus;
  parserFailureReasonCodes: string[];
  qualityFlags: string[];
};

function toPublicId(canonicalKey: string) {
  return `public-${canonicalKey.replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

function toCategory(row: F0Row) {
  const sourceLevel = row.evidence_json.source_resolution?.evidence?.source_level;
  return sourceLevel === "department" ? "Department notice" : "Scholarship notice";
}

function toOrganization(row: F0Row) {
  return row.source_key_snapshot.toUpperCase();
}

function toExposureInput(row: F0Row, diagnostic?: F1Row): PublicExposureInput {
  return {
    sourceResolutionStatus: row.source_resolution_status,
    reviewStatus: row.review_status,
    blockerStatus: row.blocker_status,
    duplicateStatus: row.duplicate_status,
    qualityStatus: row.quality_status,
    bodyQuality: row.body_quality,
    imageOnlySuspected: row.image_only_suspected,
    adminReviewRequired: row.admin_review_required,
    sourceResultStatus: row.source_result_status,
    zeroMatchObserved: row.zero_match_observed,
    observabilityStatus: row.batch_observability_status,
    parserRiskCodes: diagnostic?.f3RiskCodes ?? [],
    title: row.title,
    originalUrl: row.original_url,
    publishedAt: row.published_at,
    bodyText: row.body_text,
  };
}

function toPublicScholarship(row: F0Row): PublicScholarship {
  return {
    id: toPublicId(row.canonical_key),
    canonicalKey: row.canonical_key,
    sourceId: row.source_id,
    sourceKey: row.source_key_snapshot,
    title: row.title,
    organization: toOrganization(row),
    category: toCategory(row),
    targetLabels: row.target_summary,
    keywordLabels: row.keyword_summary,
    publishedAt: row.published_at,
    summary: row.body_text.slice(0, 180),
    body: row.body_text,
    sourceUrl: row.original_url,
    attachments: row.evidence_json.quality_policy?.assets ?? [],
    noAssets: row.no_assets,
    provenanceLabel: "Reviewed report snapshot",
  };
}

const exposureDecisions = f0Rows.map((row): ExposureDecision => {
  const diagnostic = diagnosticsByKey.get(row.canonical_key);

  return {
    canonicalKey: row.canonical_key,
    exposureStatus: evaluatePublicScholarshipExposure(toExposureInput(row, diagnostic)),
    parserFailureReasonCodes: diagnostic?.parserFailureReasonCodes ?? [],
    qualityFlags: diagnostic?.qualityFlags ?? [],
  };
});

const exposureByKey = new Map(
  exposureDecisions.map((decision) => [decision.canonicalKey, decision]),
);

const publicScholarships = f0Rows
  .filter((row) => exposureByKey.get(row.canonical_key)?.exposureStatus === "public")
  .map(toPublicScholarship)
  .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));

const publicScholarshipReadModelStatus: PublicScholarshipReadModelStatus = {
  dataBacking: "report-backed",
  serviceState: "prototype-only",
  generatedAt: f0Report.generated_at,
  sourceReport: "reports/post-phase-f0-adapter-foundation.json",
  inputCandidateCount: f0Rows.length,
  publicItemCount: publicScholarships.length,
  hiddenItemCount: f0Rows.length - publicScholarships.length,
  exposurePolicy: "fail-closed",
  attachmentsVerified: false,
};

export function getPublicScholarships() {
  return publicScholarships;
}

export function getPublicScholarshipReadModelStatus() {
  return publicScholarshipReadModelStatus;
}

export function getPublicScholarshipDetail(id: string) {
  return publicScholarships.find((scholarship) => scholarship.id === id) ?? null;
}

export function isPublicScholarshipId(id: string) {
  return id.startsWith("public-");
}

export function getPublicScholarshipExposureDecisions() {
  return exposureDecisions;
}

export function filterPublicScholarships(options: {
  query?: string;
  organization?: string;
  category?: string;
}) {
  const query = options.query?.trim().toLocaleLowerCase("en-US") ?? "";

  return publicScholarships.filter((scholarship) => {
    if (options.organization && scholarship.organization !== options.organization) {
      return false;
    }

    if (options.category && scholarship.category !== options.category) {
      return false;
    }

    if (!query) {
      return true;
    }

    const searchable = [
      scholarship.title,
      scholarship.organization,
      scholarship.category,
      scholarship.summary,
      ...scholarship.targetLabels,
      ...scholarship.keywordLabels,
    ]
      .join(" ")
      .toLocaleLowerCase("en-US");

    return searchable.includes(query);
  });
}

export function getPublicScholarshipFilterOptions() {
  return {
    organizations: [...new Set(publicScholarships.map((item) => item.organization))].sort(),
    categories: [...new Set(publicScholarships.map((item) => item.category))].sort(),
  };
}
