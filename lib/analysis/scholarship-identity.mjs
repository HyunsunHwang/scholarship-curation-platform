import { analysisSha256 } from "./analysis-identifiers.mjs";

export const SCHOLARSHIP_IDENTITY_VERSION = "v1";
export const ORGANIZATION_UNKNOWN = "organization-unknown";

/** Matches SQL public.scholarship_identity_normalize as closely as practical. */
export function scholarshipIdentityNormalize(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\s\p{P}]+/gu, "")
    .toLowerCase();
}

export function normalizeProgramOrganization(value) {
  return scholarshipIdentityNormalize(value) || ORGANIZATION_UNKNOWN;
}

export function normalizeProgramDiscriminator(value) {
  return scholarshipIdentityNormalize(value) || "default";
}

export function buildProgramIdentityCanonicalString({
  canonicalName,
  operatingOrganization,
  discriminator = "default",
}) {
  const normalizedName = scholarshipIdentityNormalize(canonicalName);
  const normalizedOrganization = normalizeProgramOrganization(operatingOrganization);
  const normalizedDiscriminator = normalizeProgramDiscriminator(discriminator);
  return [
    SCHOLARSHIP_IDENTITY_VERSION,
    "program",
    normalizedName,
    normalizedOrganization,
    normalizedDiscriminator,
  ].join("|");
}

export function buildCycleRevisionCanonicalString({ programId, revisionId }) {
  return [
    SCHOLARSHIP_IDENTITY_VERSION,
    "cycle-revision",
    String(programId ?? ""),
    String(revisionId ?? ""),
  ].join("|");
}

export function buildCycleClearCanonicalString({
  programId,
  cycleYear,
  academicTerm,
  applicationStartAt,
  applicationEndAt,
}) {
  const term = scholarshipIdentityNormalize(academicTerm) || "-";
  return [
    SCHOLARSHIP_IDENTITY_VERSION,
    "cycle-clear",
    String(programId ?? ""),
    String(cycleYear ?? "-"),
    term,
    applicationStartAt ? String(applicationStartAt) : "-",
    applicationEndAt ? String(applicationEndAt) : "-",
  ].join("|");
}

export function buildProgramIdentity(input) {
  const canonical = buildProgramIdentityCanonicalString(input);
  return {
    normalized_name: scholarshipIdentityNormalize(input.canonicalName),
    normalized_organization: normalizeProgramOrganization(input.operatingOrganization),
    identity_discriminator: normalizeProgramDiscriminator(input.discriminator),
    identity_key: analysisSha256(canonical),
    canonical_string: canonical,
  };
}

export function buildCycleIdentity(input) {
  const revisionCanonical = buildCycleRevisionCanonicalString({
    programId: input.programId,
    revisionId: input.revisionId,
  });
  const term = scholarshipIdentityNormalize(input.academicTerm);
  const hasClearSemanticIdentity = Boolean(
    input.cycleYear && (term || (input.applicationStartAt && input.applicationEndAt)),
  );
  const clearCanonical = hasClearSemanticIdentity
    ? buildCycleClearCanonicalString({
      programId: input.programId,
      cycleYear: input.cycleYear,
      academicTerm: input.academicTerm,
      applicationStartAt: input.applicationStartAt,
      applicationEndAt: input.applicationEndAt,
    })
    : null;
  return {
    revision_identity_key: analysisSha256(revisionCanonical),
    revision_canonical_string: revisionCanonical,
    cycle_identity_key: clearCanonical ? analysisSha256(clearCanonical) : null,
    cycle_canonical_string: clearCanonical,
  };
}
