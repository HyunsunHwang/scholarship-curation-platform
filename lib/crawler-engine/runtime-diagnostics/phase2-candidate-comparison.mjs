import crypto from "node:crypto";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function canonicalUrl(value) {
  const text = clean(value);
  if (!text) return "";
  try {
    const parsed = new URL(text);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function candidateKey(candidate = {}) {
  const url = canonicalUrl(candidate.noticeUrl ?? candidate.notice_url ?? candidate.url);
  if (url) return `url:${url}`;
  const explicit = clean(candidate.candidateKey ?? candidate.candidate_key);
  if (!explicit) throw new Error("Candidate comparison requires a resolvable URL or explicit candidate key.");
  return `key:${explicit}`;
}

function disposition(candidate = {}) {
  return clean(candidate.disposition ?? candidate.candidate_disposition) === "real_notice"
    ? "real_notice"
    : "unresolved";
}

function indexCandidates(candidates, label) {
  if (!Array.isArray(candidates)) throw new Error(`${label} candidates must be an array.`);
  const indexed = new Map();
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    if (indexed.has(key)) throw new Error(`${label} candidates contain duplicate identity ${key}.`);
    indexed.set(key, { key, disposition: disposition(candidate) });
  }
  return indexed;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function buildPhase2CandidateComparison({ sourceId, control, treatment }) {
  const normalizedSourceId = clean(sourceId);
  if (!normalizedSourceId) throw new Error("Candidate comparison requires sourceId.");
  const controlHtmlSha256 = clean(control?.html_sha256 ?? control?.htmlSha256);
  const treatmentHtmlSha256 = clean(treatment?.html_sha256 ?? treatment?.htmlSha256);
  if (!/^[a-f0-9]{64}$/i.test(controlHtmlSha256) || controlHtmlSha256 !== treatmentHtmlSha256) {
    throw new Error("Candidate comparison requires identical SHA-256 evidence for control and treatment HTML.");
  }
  const controlCandidates = indexCandidates(control?.candidates, "control");
  const treatmentCandidates = indexCandidates(treatment?.candidates, "treatment");
  const common = [...controlCandidates.keys()].filter((key) => treatmentCandidates.has(key)).sort();
  const removed = [...controlCandidates.values()].filter((candidate) => !treatmentCandidates.has(candidate.key));
  const added = [...treatmentCandidates.values()].filter((candidate) => !controlCandidates.has(candidate.key));
  const comparison = {
    schema_version: "phase2-candidate-comparison-v1",
    source_id: normalizedSourceId,
    same_html_sha256: controlHtmlSha256.toLowerCase(),
    control_candidate_count: controlCandidates.size,
    treatment_candidate_count: treatmentCandidates.size,
    common_candidate_count: common.length,
    removed_candidate_count: removed.length,
    added_candidate_count: added.length,
    removed_real_notice_count: removed.filter((candidate) => candidate.disposition === "real_notice").length,
    removed_unresolved_count: removed.filter((candidate) => candidate.disposition !== "real_notice").length,
    added_false_positive_count: added.filter((candidate) => candidate.disposition !== "real_notice").length,
    candidate_recall_verified: removed.length === 0 && added.every((candidate) => candidate.disposition === "real_notice"),
    comparison_sha256: "",
  };
  comparison.comparison_sha256 = sha256(JSON.stringify({ ...comparison, comparison_sha256: undefined }));
  return comparison;
}
