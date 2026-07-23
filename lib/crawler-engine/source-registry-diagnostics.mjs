function canonicalListUrl(value) {
  try {
    const url = new URL(String(value));
    url.hash = "";
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return String(value ?? "").trim();
  }
}

export function buildSourceRegistryDiagnostics(sources = []) {
  const groups = new Map();
  for (const source of Array.isArray(sources) ? sources : []) {
    const canonical_list_url = canonicalListUrl(source?.listUrl ?? source?.list_url);
    if (!canonical_list_url) continue;
    if (!groups.has(canonical_list_url)) groups.set(canonical_list_url, []);
    groups.get(canonical_list_url).push({
      source_id: source?.sourceId ?? source?.source_id ?? null,
      source_name: source?.sourceName ?? source?.source_name ?? "",
      adapter: source?.adapter ?? null,
      list_item_selector: source?.listItemSelector ?? source?.list_item_selector ?? null,
      source_level: source?.sourceLevel ?? source?.source_level ?? null,
    });
  }
  const duplicate_list_urls = [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([canonical_list_url, source_rows]) => ({
      canonical_list_url,
      source_count: source_rows.length,
      sources: source_rows,
      automatic_deduplication_applied: false,
    }))
    .sort((left, right) => left.canonical_list_url.localeCompare(right.canonical_list_url));
  return {
    version: "source-registry-diagnostics-v1",
    source_count: Array.isArray(sources) ? sources.length : 0,
    duplicate_list_url_count: duplicate_list_urls.length,
    duplicate_list_urls,
    deduplication_hook_available: true,
    automatic_deduplication_applied: false,
  };
}

export function groupSourcesByCanonicalListUrl(sources = []) {
  const diagnostics = buildSourceRegistryDiagnostics(sources);
  return diagnostics.duplicate_list_urls;
}
