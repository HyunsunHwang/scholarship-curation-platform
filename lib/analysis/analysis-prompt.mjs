export function buildScholarshipAnalysisPrompt(analysisInput) {
  return [
    "You are extracting a scholarship recruitment notice into strict JSON.",
    "The API constrains your output with scholarship-analysis-v1 JSON Schema.",
    "Populate every required key. Do not rename, flatten, or omit required keys.",
    "Required semantic shape: program.name; cycle.name; organizations[]; benefits[];",
    "application.start_date.value; application.end_date.value; application.method;",
    "eligibility_conditions[]; required_documents[]; important_cautions[]; evidence[].",
    "Use only the supplied body and attachment evidence. Never guess.",
    "Use null only where the schema permits it. Use [] for unknown list fields.",
    "Add every unknown or unsupported field path to unresolved_fields.",
    "Program and recruitment cycle are separate concepts.",
    "Every non-null semantic assertion must have a short evidence entry.",
    "Evidence field_path must be the exact JSON path it supports.",
    "For body evidence use source_kind=body_text and source_id=lineage.revision_id.",
    "For attachment evidence use source_kind=attachment_text and source_id=attachments[].asset_id.",
    "Every evidence quote must be a verbatim substring of the declared source text.",
    "Do not invent an application URL; use the supplied canonical URL only when the notice says it is the application destination.",
    "Return one JSON object only, with no markdown.",
    "",
    JSON.stringify(analysisInput),
  ].join("\n");
}
