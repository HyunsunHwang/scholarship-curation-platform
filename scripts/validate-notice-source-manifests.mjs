import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadNoticeSourceManifestRegistry } from "../lib/notice-source-manifest-loader.mjs";

export function validateNoticeSourceManifests(options = {}) {
  const registry = loadNoticeSourceManifestRegistry({ ...options, includeDisabled: true });
  return { valid: true, sourceCount: registry.sources.length, sourceRegistry: registry.fingerprint };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { console.log(JSON.stringify(validateNoticeSourceManifests(), null, 2)); }
  catch (error) { console.error(error?.message ?? error); process.exitCode = 1; }
}
