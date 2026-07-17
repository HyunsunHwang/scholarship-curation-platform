import fs from "node:fs";
import path from "node:path";
import { DOCUMENT_NORMALIZATION_VERSION, sha256Bytes } from "./contract.mjs";

export const DETERMINISTIC_NEGATIVE_CACHE_STATUSES = new Set([
  "tool_unavailable",
  "unsupported_format",
  "encrypted_or_protected",
]);

export function buildDocumentCacheKey({
  byteSha256,
  parserName,
  parserVersion,
  ocrEngine = "none",
  ocrEngineVersion = "none",
  options = {},
  normalizationVersion = DOCUMENT_NORMALIZATION_VERSION,
}) {
  return sha256Bytes(JSON.stringify({
    byte_sha256: byteSha256,
    parser_name: parserName,
    parser_version: parserVersion,
    ocr_engine: ocrEngine,
    ocr_engine_version: ocrEngineVersion,
    normalization_version: normalizationVersion,
    options,
  }));
}

export function createDocumentParseCache({ directory = null } = {}) {
  const memory = new Map();
  const fileFor = (key) => directory ? path.join(directory, `${key}.json`) : null;
  return {
    get(key) {
      if (memory.has(key)) return { status: "hit", value: memory.get(key) };
      const file = fileFor(key);
      if (!file || !fs.existsSync(file)) return { status: "miss", value: null };
      try {
        const value = JSON.parse(fs.readFileSync(file, "utf8"));
        memory.set(key, value);
        return { status: "hit", value };
      } catch {
        return { status: "corrupt", value: null };
      }
    },
    set(key, value) {
      memory.set(key, value);
      const file = fileFor(key);
      if (file) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      }
    },
    has(key) {
      return this.get(key).status === "hit";
    },
  };
}

export function shouldCacheDocumentResult(result) {
  if (!result) return false;
  if (DETERMINISTIC_NEGATIVE_CACHE_STATUSES.has(result.extraction_status)) return true;
  return !["download_failed", "parser_failed"].includes(result.extraction_status);
}
