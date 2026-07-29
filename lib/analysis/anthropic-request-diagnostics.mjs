export function classifyProvider4xxDiagnostic(error) {
  const type = String(error?.provider_error_type ?? "").toLowerCase();
  const code = String(error?.provider_error_code ?? "").toLowerCase();
  const message = String(error?.provider_error_message ?? "").toLowerCase();
  const text = `${type} ${code} ${message}`;
  if (/schema is too complex|too complex for compilation|compiled grammar is too large|grammar.*too large/u.test(text)) return "schema_too_complex";
  if (/invalid json schema|invalid schema/u.test(text)) return "invalid_schema";
  if (/unsupported.*schema|schema.*unsupported|unsupported.*output_config/u.test(text)) return "unsupported_schema_feature";
  if (/model.*not supported|unsupported model/u.test(text)) return "model_not_supported";
  if (/feature.*not available|not enabled|feature.*unsupported/u.test(text)) return "feature_not_available";
  if (type === "invalid_request_error" || /invalid request/u.test(text)) return "invalid_request";
  return "unknown_4xx";
}

export function schemaMetrics(schema) {
  const metrics = { object_count: 0, array_count: 0, max_nesting_depth: 0, property_count: 0, optional_property_count: 0, union_type_array_count: 0, enum_count: 0, enum_value_count: 0, nullable_field_count: 0, objects_missing_additional_properties_false: 0 };
  const visit = (node, depth = 0) => {
    if (!node || typeof node !== "object") return;
    metrics.max_nesting_depth = Math.max(metrics.max_nesting_depth, depth);
    if (node.type === "object") {
      metrics.object_count += 1;
      if (node.additionalProperties !== false) metrics.objects_missing_additional_properties_false += 1;
      const properties = node.properties ?? {}; const required = new Set(node.required ?? []);
      metrics.property_count += Object.keys(properties).length;
      metrics.optional_property_count += Object.keys(properties).filter((key) => !required.has(key)).length;
      Object.values(properties).forEach((child) => visit(child, depth + 1));
    }
    if (node.type === "array") { metrics.array_count += 1; visit(node.items, depth + 1); }
    if (Array.isArray(node.type)) { metrics.union_type_array_count += 1; if (node.type.includes("null")) metrics.nullable_field_count += 1; }
    if (Array.isArray(node.enum)) { metrics.enum_count += 1; metrics.enum_value_count += node.enum.length; }
  };
  visit(schema);
  return metrics;
}

export function sanitizedErrorRecord(error) {
  return { http_status: Number.isInteger(error?.http_status) ? error.http_status : null, request_id: error?.request_id ?? null, provider_error_type: error?.provider_error_type ?? null, provider_error_code: error?.provider_error_code ?? null, provider_error_message: error?.provider_error_message ?? null, diagnostic_subtype: Number(error?.http_status) >= 400 && Number(error?.http_status) < 500 ? classifyProvider4xxDiagnostic(error) : null };
}
