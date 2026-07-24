import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const TRANSPORT_POLICY_ROOT = path.resolve(
  moduleDirectory,
  "..",
  "..",
  "..",
  "config",
  "crawler-transport",
);
export const TRANSPORT_POLICY_SCHEMA_VERSION = "crawler-transport-policy-v1";

const exactHostnamePattern =
  /^(?=.{1,253}$)(?!-)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.(?!-)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

function clean(value) {
  return String(value ?? "").trim();
}

function schemaErrors(validate) {
  return (validate.errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
}

function policyMerge(base = {}, override = {}) {
  return {
    ...base,
    ...override,
    retry: { ...(base.retry ?? {}), ...(override.retry ?? {}) },
    redirect: { ...(base.redirect ?? {}), ...(override.redirect ?? {}) },
  };
}

function bindingPolicy(registry, binding) {
  return policyMerge(
    registry.profiles?.[binding.profile] ?? {},
    binding.policy ?? {},
  );
}

function exactHost(value) {
  const hostname = clean(value);
  return hostname
    && hostname === value
    && hostname === hostname.toLowerCase()
    && exactHostnamePattern.test(hostname)
    && !hostname.includes("*")
    && !hostname.startsWith(".")
    ? hostname
    : null;
}

function hostnameOf(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ""; }
}

function bindingMatchesSource(binding, source) {
  let hostname = "";
  try {
    hostname = new URL(source?.listUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (binding.sourceIds ?? []).includes(source?.sourceId)
    || (binding.universitySlugs ?? []).includes(source?.universitySlug)
    || (binding.hosts ?? []).includes(hostname);
}

function overlap(left = [], right = []) {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function bindingsCanOverlap(left, right, sources) {
  if (Array.isArray(sources) && sources.length > 0) {
    return sources.some((source) =>
      bindingMatchesSource(left, source) && bindingMatchesSource(right, source));
  }
  return overlap(left.sourceIds, right.sourceIds)
    || overlap(left.universitySlugs, right.universitySlugs)
    || overlap(left.hosts, right.hosts);
}

function policyConflicts(left, right) {
  const flatten = (policy) => ({
    protocolMode: policy.protocolMode,
    dnsFamily: policy.dnsFamily,
    tlsMode: policy.tlsMode,
    userAgentProfile: policy.userAgentProfile,
    timeoutMs: policy.timeoutMs,
    maximumResponseBytes: policy.maximumResponseBytes,
    retryCount: policy.retry?.count,
    retryBaseDelayMs: policy.retry?.baseDelayMs,
    retryMaximumDelayMs: policy.retry?.maximumDelayMs,
    retryJitterRatio: policy.retry?.jitterRatio,
    redirectMaximumHops: policy.redirect?.maximumHops,
    redirectAllowCrossHost: policy.redirect?.allowCrossHost,
    redirectAllowHttpsToHttpDowngrade:
      policy.redirect?.allowHttpsToHttpDowngrade,
  });
  const a = flatten(left);
  const b = flatten(right);
  return Object.keys(a).some((key) =>
    a[key] !== undefined && b[key] !== undefined && a[key] !== b[key]);
}

export function createTransportPolicySchemaValidator({
  rootDirectory = TRANSPORT_POLICY_ROOT,
} = {}) {
  const schema = JSON.parse(
    fs.readFileSync(path.join(rootDirectory, "transport-policy.schema.json"), "utf8"),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  return ajv.compile(schema);
}

export function validateTransportPolicyRegistry({
  registry,
  sources = [],
  now = new Date(),
  rootDirectory = TRANSPORT_POLICY_ROOT,
} = {}) {
  const errors = [];
  const validate = createTransportPolicySchemaValidator({ rootDirectory });
  if (!validate(registry)) {
    errors.push(`transport policy schema: ${schemaErrors(validate)}`);
    return { valid: false, errors };
  }
  if (registry.schemaVersion !== TRANSPORT_POLICY_SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion: ${registry.schemaVersion}`);
  }
  if (registry.registryVersion !== clean(registry.registryVersion)) {
    errors.push("registryVersion must be trimmed");
  }
  const knownUserAgents = new Set(Object.keys(registry.userAgentProfiles ?? {}));
  const checkUserAgent = (policy, label) => {
    if (policy?.userAgentProfile && !knownUserAgents.has(policy.userAgentProfile)) {
      errors.push(`${label}: unknown userAgentProfile ${policy.userAgentProfile}`);
    }
  };
  checkUserAgent(registry.defaults, "defaults");
  for (const [name, profile] of Object.entries(registry.profiles ?? {})) {
    if (name !== clean(name)) errors.push(`profile ${name}: name must be trimmed`);
    checkUserAgent(profile, `profile ${name}`);
  }

  const bindingIds = new Set();
  const sourceIds = new Set((sources ?? []).map((source) => source.sourceId));
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  for (const binding of registry.bindings ?? []) {
    if (bindingIds.has(binding.bindingId)) {
      errors.push(`${binding.bindingId}: duplicate bindingId`);
    }
    bindingIds.add(binding.bindingId);
    if (binding.profile && !Object.hasOwn(registry.profiles, binding.profile)) {
      errors.push(`${binding.bindingId}: unknown profile ${binding.profile}`);
    }
    checkUserAgent(binding.policy, `binding ${binding.bindingId}`);
    for (const field of [
      "sourceIds",
      "universitySlugs",
      "hosts",
      "allowedHosts",
      "allowedHttpHosts",
    ]) {
      for (const value of binding[field] ?? []) {
        if (value !== clean(value)) errors.push(`${binding.bindingId}.${field}: values must be trimmed`);
      }
    }
    for (const host of [
      ...(binding.hosts ?? []),
      ...(binding.allowedHosts ?? []),
      ...(binding.allowedHttpHosts ?? []),
    ]) {
      if (!exactHost(host)) {
        errors.push(`${binding.bindingId}: wildcard or invalid hostname is forbidden (${host})`);
      }
    }
    for (const sourceId of binding.sourceIds ?? []) {
      if (sources.length > 0 && !sourceIds.has(sourceId)) {
        errors.push(`${binding.bindingId}: unknown sourceId ${sourceId}`);
      }
    }
    const effective = bindingPolicy(registry, binding);
    if (effective.tlsMode === "system-ca") {
      if (!(binding.allowedHosts?.length > 0)) {
        errors.push(`${binding.bindingId}: system-ca requires allowedHosts`);
      }
      if (!clean(binding.reason)) {
        errors.push(`${binding.bindingId}: system-ca requires reason`);
      }
      for (const source of sources.filter((item) =>
        (binding.sourceIds ?? []).includes(item.sourceId))) {
        const hostname = hostnameOf(source.listUrl);
        if (!(binding.allowedHosts ?? []).includes(hostname)) {
          errors.push(
            `${binding.bindingId}: source ${source.sourceId} hostname ${hostname} is not in allowedHosts`,
          );
        }
      }
    }
    if (effective.tlsMode === "insecure-exact-host") {
      if (!(binding.allowedHosts?.length > 0)) {
        errors.push(`${binding.bindingId}: insecure-exact-host requires allowedHosts`);
      }
      if (!clean(binding.reason)) {
        errors.push(`${binding.bindingId}: insecure-exact-host requires reason`);
      }
      if (!clean(binding.expiresAt)) {
        errors.push(`${binding.bindingId}: insecure-exact-host requires expiresAt`);
      } else {
        const expiry = new Date(`${binding.expiresAt}T23:59:59.999Z`);
        if (Number.isNaN(expiry.getTime()) || expiry < today) {
          errors.push(`${binding.bindingId}: insecure-exact-host policy is expired`);
        }
      }
      for (const source of sources.filter((item) =>
        (binding.sourceIds ?? []).includes(item.sourceId))) {
        let hostname = "";
        try { hostname = new URL(source.listUrl).hostname.toLowerCase(); } catch {}
        if (!(binding.allowedHosts ?? []).includes(hostname)) {
          errors.push(
            `${binding.bindingId}: source ${source.sourceId} hostname ${hostname} is not in allowedHosts`,
          );
        }
      }
    }
  }

  const bindings = registry.bindings ?? [];
  for (let leftIndex = 0; leftIndex < bindings.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < bindings.length; rightIndex += 1) {
      const left = bindings[leftIndex];
      const right = bindings[rightIndex];
      if (
        left.priority === right.priority
        && bindingsCanOverlap(left, right, sources)
        && policyConflicts(bindingPolicy(registry, left), bindingPolicy(registry, right))
      ) {
        errors.push(
          `${left.bindingId}/${right.bindingId}: conflicting bindings at priority ${left.priority}`,
        );
      }
    }
  }

  for (const source of sources) {
    let parsed;
    try {
      parsed = new URL(source.listUrl);
    } catch {
      continue;
    }
    let effective = registry.defaults;
    let effectiveAllowedHttpHosts = [];
    for (const binding of bindings
      .filter((item) => bindingMatchesSource(item, source))
      .sort((left, right) => left.priority - right.priority)) {
      effective = policyMerge(effective, bindingPolicy(registry, binding));
      if (binding.allowedHttpHosts) effectiveAllowedHttpHosts = binding.allowedHttpHosts;
    }
    if (parsed.protocol === "http:" && effective.protocolMode !== "preserve-http") {
      errors.push(`${source.sourceId}: HTTP list URL requires an explicit preserve-http policy`);
    }
    if (parsed.protocol === "http:" && effective.protocolMode === "preserve-http") {
      effectiveAllowedHttpHosts = [...new Set([
        ...effectiveAllowedHttpHosts,
        parsed.hostname.toLowerCase(),
      ])];
      if (!effectiveAllowedHttpHosts.includes(parsed.hostname.toLowerCase())) {
        errors.push(`${source.sourceId}: preserve-http policy must authorize the list hostname`);
      }
    }
    if (effective.protocolMode === "strict" && effectiveAllowedHttpHosts.length > 0) {
      errors.push(`${source.sourceId}: strict policy cannot declare allowedHttpHosts`);
    }
  }
  return { valid: errors.length === 0, errors };
}
