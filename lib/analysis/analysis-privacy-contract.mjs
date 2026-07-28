export const PRIVACY_SCAN_STATUSES = Object.freeze([
  "not_scanned",
  "clear",
  "redacted",
  "blocked",
]);

export const PRIVACY_PATTERN_HINTS = Object.freeze([
  "resident_registration_number",
  "bank_account_number",
  "personal_phone_number",
  "personal_email",
  "personal_name_list",
  "admittee_or_roster_list",
]);

/**
 * Placeholder redaction contract for future analysis input builders.
 * Does not implement a full PII detector.
 */
export function buildPrivacyRedactionContract(input = {}) {
  const status = PRIVACY_SCAN_STATUSES.includes(input.status)
    ? input.status
    : "not_scanned";
  return {
    status,
    redaction_version: input.redaction_version || "analysis-redaction-contract-v1",
    detected_pattern_hints: Array.isArray(input.detected_pattern_hints)
      ? input.detected_pattern_hints
      : [],
    blocked_for_provider_call: status === "blocked",
    notes: [
      "Phase 2 records the contract only.",
      "Full detector and masking belong to a later analysis input builder phase.",
    ],
  };
}
