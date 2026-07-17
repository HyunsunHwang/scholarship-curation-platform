import path from "node:path";
import { createDocumentParseCache } from "./cache.mjs";
import { createNoticeDocumentProcessor } from "./processor.mjs";
import { createDocumentParserRegistry } from "./registry.mjs";

export function isDocumentParsingEnabled(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

export function createCrawlerDocumentRuntime({
  enabled = false,
  cacheDirectory = ".tmp/engine-phase-3/cache",
  inspectAsset = null,
  fetchAsset = null,
  ocrAdapter,
  hwpBinaryAdapter,
  parserOptions = {},
} = {}) {
  if (!enabled) {
    return {
      enabled: false,
      cache_directory: null,
      registry: null,
      processNoticeDocuments: null,
    };
  }
  const resolvedCacheDirectory = path.resolve(cacheDirectory);
  const cache = createDocumentParseCache({ directory: resolvedCacheDirectory });
  const registry = createDocumentParserRegistry({
    cache,
    ...(ocrAdapter ? { ocrAdapter } : {}),
    ...(hwpBinaryAdapter ? { hwpBinaryAdapter } : {}),
  });
  return {
    enabled: true,
    cache_directory: resolvedCacheDirectory,
    registry,
    processNoticeDocuments: createNoticeDocumentProcessor({
      registry,
      inspectAsset,
      fetchAsset,
      options: parserOptions,
    }),
  };
}
