import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  TRANSPORT_POLICY_ROOT,
  validateTransportPolicyRegistry,
} from "./transport-policy-validator.mjs";

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function fingerprintTransportPolicy(value) {
  return crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function loadTransportPolicyRegistry({
  policyPath = process.env.CRAWL_TRANSPORT_POLICY_PATH,
  sources = [],
  now = new Date(),
  rootDirectory = TRANSPORT_POLICY_ROOT,
} = {}) {
  const resolvedPath = path.resolve(
    policyPath || path.join(rootDirectory, "transport-policies.json"),
  );
  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    const wrapped = new Error(`Transport policy registry load failed: ${resolvedPath}`);
    wrapped.code = "transport_policy_load_failed";
    wrapped.cause = error;
    throw wrapped;
  }
  const validation = validateTransportPolicyRegistry({
    registry,
    sources,
    now,
    rootDirectory,
  });
  if (!validation.valid) {
    const error = new Error(
      `Transport policy registry validation failed: ${validation.errors.join(" | ")}`,
    );
    error.code = "transport_policy_validation_failed";
    error.validation_errors = validation.errors;
    throw error;
  }
  return deepFreeze({
    ...registry,
    registryFingerprint: fingerprintTransportPolicy(registry),
    policyPath: resolvedPath,
  });
}
