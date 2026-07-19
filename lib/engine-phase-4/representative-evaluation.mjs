export function ratio(numerator, denominator, reason) {
  if (denominator === 0) return { status: "not_evaluated", value: null, sample_count: 0, numerator: 0, denominator: 0, reason };
  return { status: "evaluated", value: numerator / denominator, sample_count: denominator, numerator, denominator };
}

export function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function summarizeRows(rows, reason) {
  if (rows.length === 0) return { status: "not_evaluated", value: null, sample_count: 0, reason };
  return {
    status: "evaluated", sample_count: rows.length,
    schema_valid_count: rows.filter((row) => row.validation.valid).length,
    classification_exact_count: rows.filter((row) => row.classification_exact).length,
    review_required_count: rows.filter((row) => row.record.review.required).length,
    program_candidate_usable_count: rows.filter((row) => row.usability.program_candidate_usable).length,
    cycle_candidate_usable_count: rows.filter((row) => row.usability.cycle_candidate_usable).length,
    phase5_handoff_usable_count: rows.filter((row) => row.usability.phase5_handoff_usable).length,
  };
}

export function buildSlices(rows, relations, fixtureVersion) {
  const dimensions = {
    by_source_key: (row) => [row.fixture.source_key], by_source_level: (row) => [row.fixture.source_level],
    by_source_type: (row) => [row.fixture.source_type], by_document_format: (row) => [row.fixture.input_format],
    by_document_kind: (row) => [row.fixture.document_kind_gold], by_parser_quality: (row) => [row.fixture.parser_quality],
    by_review_reason: (row) => row.fixture.gold_review_reason_codes.length ? row.fixture.gold_review_reason_codes : ["none"],
    by_fixture_version: () => [fixtureVersion], by_extractor_kind: () => ["deterministic"],
  };
  const output = {};
  for (const [name, keysFor] of Object.entries(dimensions)) {
    const buckets = {};
    for (const row of rows) for (const key of keysFor(row)) (buckets[key] ??= []).push(row);
    output[name] = Object.fromEntries(Object.entries(buckets).map(([key, bucket]) => [key, summarizeRows(bucket, `No representative cases exist for ${name}=${key}.`)]));
  }
  const fieldNames = [...new Set(rows.flatMap((row) => Object.keys(row.fixture.gold_fields)))];
  output.by_field = Object.fromEntries(fieldNames.map((name) => {
    const observations = rows.map((row) => row.field_observations.find((item) => item.field === name)).filter(Boolean);
    return [name, { status: observations.length ? "evaluated" : "not_evaluated", sample_count: observations.length, status_exact_count: observations.filter((item) => item.status_exact).length, false_present_count: observations.filter((item) => item.false_present).length, false_negative_count: observations.filter((item) => item.false_negative).length, ...(observations.length ? {} : { value: null, reason: `No field annotations exist for ${name}.` }) }];
  }));
  const statuses = ["present", "not_found", "unknown", "not_applicable", "ambiguous", "conflicting"];
  output.by_value_status = Object.fromEntries(statuses.map((status) => {
    const observations = rows.flatMap((row) => row.field_observations).filter((item) => item.gold_status === status);
    return [status, observations.length ? { status: "evaluated", sample_count: observations.length, status_exact_count: observations.filter((item) => item.status_exact).length } : { status: "not_evaluated", value: null, sample_count: 0, reason: `No gold annotations use value status ${status}.` }];
  }));
  const relationTypes = [...new Set(relations.groups.map((group) => group.relation_type))];
  output.by_relation_type = Object.fromEntries(relationTypes.map((type) => { const groups = relations.groups.filter((group) => group.relation_type === type); return [type, { status: "not_evaluated", value: null, sample_count: groups.reduce((sum, group) => sum + group.pairs.length, 0), reason: "Phase 5 relation resolution is annotation-only in Gate C." }]; }));
  output.by_extractor_kind.model = { status: "not_evaluated", value: null, sample_count: 0, reason: "External model extraction is prohibited in Gate C." };
  return output;
}
