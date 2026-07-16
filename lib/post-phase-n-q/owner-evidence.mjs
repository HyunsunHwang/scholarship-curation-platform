import crypto from "node:crypto";
import fs from "node:fs";
import {
  FINGERPRINT_SCHEMA_VERSION,
  PRODUCTION_READ_ONLY_EVIDENCE_KIND,
} from "./fingerprint.mjs";
import {
  validateProductionFingerprintDocument,
} from "./production-fingerprint-runner.mjs";

const OBVIOUS_SECRET_PATTERNS = [
  { label: "credentialed_postgresql_url", regex: /postgres(?:ql)?:\/\/[^\s]+/iu },
  { label: "jwt_like_token", regex: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/u },
  { label: "secret_token", regex: /\bsb_secret_[A-Za-z0-9_-]{12,}/u },
  { label: "password_assignment", regex: /(?:password|passwd)\s*[:=]\s*["'][^"']+/iu },
];

const OBJECT_KINDS = [
  "tables",
  "columns",
  "indexes",
  "constraints",
  "policies",
  "grants",
  "functions",
  "triggers",
  "views",
  "materialized_views",
];

function readJsonBuffer(file) {
  const raw = fs.readFileSync(file);
  try {
    return { raw, document: JSON.parse(raw.toString("utf8")) };
  } catch {
    throw new Error("Owner production evidence is not valid JSON");
  }
}

function objectCountSummary(document) {
  return Object.fromEntries(
    OBJECT_KINDS.map((kind) => [
      kind,
      Array.isArray(document.objects?.[kind]) ? document.objects[kind].length : 0,
    ]),
  );
}

function optionalEvidenceLimitations(document) {
  const counts = {};
  for (const item of document.aggregates?.selected_state_distributions ?? []) {
    const status = String(item?.status ?? "unknown");
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

function secretPatternLabels(rawText, productionRef) {
  const labels = OBVIOUS_SECRET_PATTERNS
    .filter((pattern) => pattern.regex.test(rawText))
    .map((pattern) => pattern.label);
  if (productionRef && rawText.includes(productionRef)) {
    labels.push("production_project_ref");
  }
  return labels;
}

export function validateOwnerProductionFingerprint({
  fingerprintPath,
  receiptPath,
  productionRef = "",
}) {
  const fingerprint = readJsonBuffer(fingerprintPath);
  const receipt = readJsonBuffer(receiptPath);
  const fingerprintText = fingerprint.raw.toString("utf8");
  const receiptText = receipt.raw.toString("utf8");
  const validation = validateProductionFingerprintDocument(fingerprint.document);
  const originalEmbeddedHash = String(
    fingerprint.document.fingerprint_sha256 ?? "",
  );
  const receiptHash = String(receipt.document.fingerprint_sha256 ?? "");
  const rawFileHash = crypto
    .createHash("sha256")
    .update(fingerprint.raw)
    .digest("hex");
  const receiptSafetyPassed =
    receipt.document.passed === true &&
    receipt.document.transaction_read_only === true &&
    receipt.document.ddl_performed === false &&
    receipt.document.dml_performed === false &&
    receipt.document.row_body_dumped === false &&
    receipt.document.production_write_performed === false &&
    receipt.document.credentials_printed === false;
  const secretPatternLabelsFound = [
    ...secretPatternLabels(fingerprintText, productionRef),
    ...secretPatternLabels(receiptText, productionRef),
  ];
  const byteCountMatch =
    Number(receipt.document.output_byte_count) === fingerprint.raw.length;
  const legacyHashConsistent =
    Boolean(originalEmbeddedHash) &&
    Boolean(receiptHash) &&
    originalEmbeddedHash === receiptHash;
  const canonicalHash = validation.normalized?.fingerprint_sha256 ?? "";
  const passed =
    validation.passed &&
    fingerprint.document.schema_version === FINGERPRINT_SCHEMA_VERSION &&
    fingerprint.document.evidence?.evidence_kind ===
      PRODUCTION_READ_ONLY_EVIDENCE_KIND &&
    fingerprint.document.evidence?.environment === "production" &&
    receiptSafetyPassed &&
    byteCountMatch &&
    legacyHashConsistent &&
    secretPatternLabelsFound.length === 0;

  return {
    contract_version: "post-phase-n-owner-evidence-validation/v1",
    passed,
    schema_version: fingerprint.document.schema_version ?? "",
    evidence_kind: fingerprint.document.evidence?.evidence_kind ?? "",
    environment: fingerprint.document.evidence?.environment ?? "",
    original_embedded_fingerprint_sha256: originalEmbeddedHash,
    receipt_fingerprint_sha256: receiptHash,
    original_raw_file_sha256: rawFileHash,
    output_byte_count_match: byteCountMatch,
    legacy_hash_consistent: legacyHashConsistent,
    canonical_hash_algorithm: "sha256/stable-json-codepoint-v1",
    canonical_fingerprint_sha256: canonicalHash,
    canonical_hash_matches_legacy: canonicalHash === originalEmbeddedHash,
    receipt_safety_passed: receiptSafetyPassed,
    row_body_absence_contract: fingerprint.document.safety?.row_body_dumped === false,
    obvious_credential_pattern_count: secretPatternLabelsFound.length,
    object_count_summary: objectCountSummary(fingerprint.document),
    migration_metadata_status:
      fingerprint.document.migration_metadata?.status ?? "unknown",
    optional_evidence_limitations: optionalEvidenceLimitations(
      fingerprint.document,
    ),
  };
}
