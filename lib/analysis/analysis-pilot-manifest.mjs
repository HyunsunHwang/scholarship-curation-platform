import { createHash } from "node:crypto";

const FIELDS = [
  "execution_order",
  "stage",
  "job_id",
  "expected_revision_id",
  "expected_input_fingerprint",
];

function clean(value) {
  return String(value ?? "").trim();
}

function lengthPrefix(value) {
  const normalized = clean(value);
  return `${Buffer.byteLength(normalized, "utf8")}:${normalized}`;
}

export function normalizePilotMembers(members = []) {
  if (!Array.isArray(members)) throw new Error("pilot_manifest_array_required");
  return members.map((member) => {
    const normalized = {
      execution_order: Number(member?.execution_order),
      stage: clean(member?.stage),
      job_id: clean(member?.job_id),
      expected_revision_id: clean(member?.expected_revision_id),
      expected_input_fingerprint: clean(member?.expected_input_fingerprint),
    };
    if (!Number.isInteger(normalized.execution_order)
        || normalized.execution_order < 1
        || !["smoke", "expansion"].includes(normalized.stage)
        || !normalized.job_id
        || !normalized.expected_revision_id
        || !/^[a-f0-9]{64}$/.test(normalized.expected_input_fingerprint)) {
      throw new Error("pilot_manifest_member_invalid");
    }
    return normalized;
  }).sort((left, right) => left.execution_order - right.execution_order);
}

export function serializePilotManifest(members = []) {
  const normalized = normalizePilotMembers(members);
  return `pilot-manifest-v1${normalized.map((member) =>
    FIELDS.map((field) => lengthPrefix(member[field])).join("")).join("")}`;
}

export function fingerprintPilotManifest(members = []) {
  return createHash("sha256").update(serializePilotManifest(members)).digest("hex");
}

export function assertPilotManifestFingerprint(members, expectedFingerprint) {
  const actual = fingerprintPilotManifest(members);
  if (actual !== clean(expectedFingerprint)) {
    throw Object.assign(new Error("pilot_manifest_fingerprint_mismatch"), {
      expected_fingerprint: clean(expectedFingerprint),
      actual_fingerprint: actual,
    });
  }
  return actual;
}

export function assertPilotManifestPreflight({ pilot, members, stage }) {
  if (!pilot?.id) throw new Error("pilot_manifest_preflight_missing_pilot");
  const normalized = normalizePilotMembers(members);
  if (normalized.length !== 5) throw new Error("pilot_manifest_member_count_mismatch");
  if (normalized.filter((member) => member.stage === "smoke").length !== 1) {
    throw new Error("pilot_manifest_smoke_member_count_mismatch");
  }
  if (normalized.filter((member) => member.stage === "expansion").length !== 4) {
    throw new Error("pilot_manifest_expansion_member_count_mismatch");
  }
  assertPilotManifestFingerprint(normalized, pilot.manifest_fingerprint);
  const stageMembers = normalized.filter((member) => member.stage === stage);
  const required = stage === "smoke" ? 1 : stage === "expansion" ? 4 : 0;
  if (!required || stageMembers.length !== required) {
    throw new Error("pilot_manifest_stage_member_count_mismatch");
  }
  return { fingerprint: pilot.manifest_fingerprint, members: normalized, stageMembers };
}
