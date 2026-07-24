function clean(value) { return String(value ?? "").trim().toLowerCase(); }

/** Pure SourceConfig classifier. It selects a strategy family, never a source ID. */
export function resolveSourceExecutionStrategy(source = {}) {
  const adapter = clean(source.adapter);
  if (adapter) return Object.freeze({ kind: "custom_adapter", name: adapter });
  const contentMode = clean(source.contentMode ?? source.content_mode);
  if (contentMode === "inline_sections") return Object.freeze({ kind: "inline_sections", name: "inline_sections" });
  if (contentMode === "json_xhr") return Object.freeze({ kind: "json_xhr", name: "json_xhr" });
  if (contentMode === "form_post") return Object.freeze({ kind: "form_post", name: "form_post" });
  return Object.freeze({ kind: "generic_html_list", name: "generic_html" });
}
