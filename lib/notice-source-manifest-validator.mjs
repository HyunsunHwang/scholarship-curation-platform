import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { fileURLToPath } from "node:url";
import { getListAdapter } from "./crawler-adapters/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const NOTICE_SOURCE_MANIFEST_ROOT = path.resolve(__dirname, "..", "config", "notice-sources");
export const SUPPORTED_UNIVERSITY_GROUPS = Object.freeze([
  "ewha", "cau", "korea", "khu", "hanyang", "hongik", "yonsei", "skku", "uos",
]);

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Canonical(value) {
  return crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function sourceIdSetSha256(sourceIds) {
  return sha256Canonical([...sourceIds].map((value) => String(value)).sort());
}

export function readManifestJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Manifest JSON load failed (${path.resolve(filePath)}): ${error.message}`);
  }
}

function schemaPath(name) {
  return path.join(NOTICE_SOURCE_MANIFEST_ROOT, "schema", name);
}

function schemaErrors(validate) {
  return (validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
}

export function createManifestSchemaValidator({ rootDirectory = NOTICE_SOURCE_MANIFEST_ROOT } = {}) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const schemas = {
    manifest: readManifestJson(path.join(rootDirectory, "schema", "notice-source-manifest.schema.json")),
    index: readManifestJson(path.join(rootDirectory, "schema", "notice-source-index.schema.json")),
    snapshot: readManifestJson(path.join(rootDirectory, "schema", "db-source-id-snapshot.schema.json")),
  };
  return {
    validateManifest: ajv.compile(schemas.manifest),
    validateIndex: ajv.compile(schemas.index),
    validateSnapshot: ajv.compile(schemas.snapshot),
  };
}

function requireTrimmed(value, label, errors, { allowEmpty = true } = {}) {
  if (typeof value !== "string") return;
  if ((!allowEmpty && !value) || value !== value.trim()) errors.push(`${label} must be trimmed${allowEmpty ? "" : " and non-empty"}`);
}

function validateHttpUrl(value, label, errors, { required = false } = {}) {
  if (!value && !required) return;
  try {
    const protocol = new URL(value).protocol;
    if (protocol !== "http:" && protocol !== "https:") errors.push(`${label} must use HTTP or HTTPS`);
  } catch {
    errors.push(`${label} must be a valid HTTP or HTTPS URL`);
  }
}

function validateSource(source, manifestSlug, errors) {
  const prefix = String(source.sourceId ?? "").split("_")[0]?.toLowerCase();
  if (prefix !== manifestSlug) errors.push(`${source.sourceId}: sourceId prefix must match universitySlug ${manifestSlug}`);
  if (source.universitySlug !== manifestSlug) errors.push(`${source.sourceId}: source universitySlug must match manifest universitySlug`);
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") requireTrimmed(value, `${source.sourceId}.${key}`, errors, { allowEmpty: key !== "sourceId" && key !== "sourceName" && key !== "listUrl" });
  }
  if (source.enabled) {
    for (const key of ["sourceId", "sourceName", "listUrl"]) {
      if (!String(source[key] ?? "").trim()) errors.push(`${source.sourceId || "<unknown>"}: enabled source requires ${key}`);
    }
  }
  validateHttpUrl(source.listUrl, `${source.sourceId}.listUrl`, errors, { required: source.enabled });
  validateHttpUrl(source.baseUrl, `${source.sourceId}.baseUrl`, errors);
  if (source.noticeUrlPattern) {
    try { new RegExp(source.noticeUrlPattern); } catch { errors.push(`${source.sourceId}: noticeUrlPattern is not a valid RegExp`); }
  }
  if (source.adapter && !getListAdapter(source.adapter)) errors.push(`${source.sourceId}: unknown adapter ${source.adapter}`);
  if (source.adapter === "cau_portal") {
    if (!source.adapterConfig) {
      errors.push(`${source.sourceId}: cau_portal requires adapterConfig`);
    } else {
      for (const key of ["apiAccept", "jsonContentTypePolicy", "requiredListPath"]) {
        requireTrimmed(source.adapterConfig[key], `${source.sourceId}.adapterConfig.${key}`, errors, {
          allowEmpty: false,
        });
      }
    }
  } else if (source.adapterConfig) {
    errors.push(`${source.sourceId}: adapterConfig is not supported for adapter ${source.adapter || "<empty>"}`);
  }
  if (source.contentMode === "inline_sections") {
    if (source.detailFetchRequired !== false) errors.push(`${source.sourceId}: inline_sections requires detailFetchRequired=false`);
    if (source.detailContentAlreadyAvailable !== true) errors.push(`${source.sourceId}: inline_sections requires detailContentAlreadyAvailable=true`);
    if (!source.sectionTitleSelector) errors.push(`${source.sourceId}: inline_sections requires sectionTitleSelector`);
    if (source.sectionBodyBoundary !== "next_heading") errors.push(`${source.sourceId}: inline_sections requires sectionBodyBoundary=next_heading`);
  }
  for (const [index, keyword] of (source.keywords ?? []).entries()) {
    if (typeof keyword !== "string" || !keyword || keyword !== keyword.trim()) {
      errors.push(`${source.sourceId}.keywords[${index}] must be a trimmed non-empty string`);
    }
  }
}

export function validateNoticeSourceManifests({ index, manifests, snapshot, rootDirectory = NOTICE_SOURCE_MANIFEST_ROOT } = {}) {
  const validators = createManifestSchemaValidator({ rootDirectory });
  const errors = [];
  if (!validators.validateIndex(index)) errors.push(`index schema: ${schemaErrors(validators.validateIndex)}`);
  if (!validators.validateSnapshot(snapshot)) errors.push(`snapshot schema: ${schemaErrors(validators.validateSnapshot)}`);
  const groups = index?.groups ?? [];
  const groupNames = groups.map((group) => group.universitySlug);
  if (groupNames.length !== SUPPORTED_UNIVERSITY_GROUPS.length || new Set(groupNames).size !== groupNames.length || SUPPORTED_UNIVERSITY_GROUPS.some((group) => !groupNames.includes(group))) {
    errors.push("index must contain each supported university group exactly once");
  }
  const sourceIds = new Set();
  const snapshotSourceIds = Array.isArray(snapshot?.sourceIds) ? snapshot.sourceIds : [];
  const snapshotIds = new Set(snapshotSourceIds);
  const sortedSnapshotSourceIds = [...snapshotSourceIds].sort();
  if (snapshotIds.size !== snapshotSourceIds.length) errors.push("snapshot sourceIds must not contain duplicates");
  if (snapshotSourceIds.some((sourceId) => typeof sourceId !== "string" || !sourceId || sourceId !== sourceId.trim())) {
    errors.push("snapshot sourceIds must contain trimmed non-empty strings");
  }
  if (JSON.stringify(snapshotSourceIds) !== JSON.stringify(sortedSnapshotSourceIds)) {
    errors.push("snapshot sourceIds must be sorted ascending");
  }
  const normalizedManifests = Array.isArray(manifests) ? manifests : [];
  for (const entry of groups) {
    if (!entry.path.startsWith("universities/") || entry.path.includes("..") || path.isAbsolute(entry.path)) errors.push(`${entry.universitySlug}: invalid manifest index path`);
    const manifest = normalizedManifests.find((item) => item?.universitySlug === entry.universitySlug);
    if (!manifest) { errors.push(`${entry.universitySlug}: indexed manifest was not loaded`); continue; }
    if (!validators.validateManifest(manifest)) errors.push(`${entry.universitySlug} schema: ${schemaErrors(validators.validateManifest)}`);
    if (manifest.universitySlug !== entry.universitySlug) errors.push(`${entry.universitySlug}: index and manifest universitySlug differ`);
    if (!String(manifest.manifestVersion ?? "").trim() || manifest.manifestVersion !== String(manifest.manifestVersion).trim()) {
      errors.push(`${entry.universitySlug}: manifestVersion must be trimmed and non-empty`);
    }
    if (manifest.manifestVersion !== index.manifestVersion) {
      errors.push(`${entry.universitySlug}: manifestVersion ${manifest.manifestVersion} does not match index ${index.manifestVersion}`);
    }
    for (const source of manifest.sources ?? []) {
      validateSource(source, manifest.universitySlug, errors);
      if (sourceIds.has(source.sourceId)) errors.push(`${source.sourceId}: duplicate sourceId`);
      sourceIds.add(source.sourceId);
      if (!snapshotIds.has(source.sourceId)) errors.push(`${source.sourceId}: not present in DB source ID snapshot`);
    }
  }
  if (!String(index?.manifestVersion ?? "").trim() || index.manifestVersion !== String(index.manifestVersion).trim()) {
    errors.push("index manifestVersion must be trimmed and non-empty");
  }
  const expectedSnapshotHash = sourceIdSetSha256(snapshotSourceIds);
  if (snapshot?.sourceIdSetSha256 !== expectedSnapshotHash) errors.push("snapshot sourceIdSetSha256 does not match canonical sourceIds");
  return { valid: errors.length === 0, errors, sourceIds: [...sourceIds].sort() };
}

export function sanitizeRegistryUrl(value) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/(token|key|secret|password|signature|credential|auth)/i.test(key)) url.searchParams.set(key, "[REDACTED]");
    }
    return url.toString();
  } catch { return String(value ?? ""); }
}
