export function buildScholarshipAnalysisPrompt(analysisInput) {
  return [
    "You are extracting a scholarship recruitment notice into strict JSON.",
    "Use only the supplied body and attachment evidence. Never guess.",
    "Unknown values must be null, unknown, or listed in unresolved_fields.",
    "Program and recruitment cycle are separate concepts.",
    "Every non-null semantic assertion must have a short evidence entry.",
    "Evidence field_path must point to a real output path and quote must occur in its declared source.",
    "Return one JSON object only, with no markdown.",
    "",
    JSON.stringify(analysisInput),
  ].join("\n");
}
