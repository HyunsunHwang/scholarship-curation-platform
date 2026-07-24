import { fingerprintTransportPolicy } from "./transport-policy-loader.mjs";

const HARD_LIMITS = Object.freeze({
  timeoutMs: 120000,
  retryCount: 3,
  retryDelayMs: 30000,
  redirectHops: 10,
  responseBytes: 52428800,
});

function mergePolicy(base = {}, override = {}) {
  return {
    ...base,
    ...override,
    retry: { ...(base.retry ?? {}), ...(override.retry ?? {}) },
    redirect: { ...(base.redirect ?? {}), ...(override.redirect ?? {}) },
  };
}

function hostnameOf(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ""; }
}

function matches(binding, source) {
  const hostname = hostnameOf(source?.listUrl);
  return (binding.sourceIds ?? []).includes(source?.sourceId)
    || (binding.universitySlugs ?? []).includes(source?.universitySlug)
    || (binding.hosts ?? []).includes(hostname);
}

function boundedInteger(value, maximum, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > maximum) {
    const error = new Error(`${label} exceeds the code-owned safety limit`);
    error.code = "transport_policy_safety_limit";
    throw error;
  }
  return number;
}

function boundedRatio(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    const error = new Error(`${label} exceeds the code-owned safety limit`);
    error.code = "transport_policy_safety_limit";
    throw error;
  }
  return number;
}

function applySafetyLimits(policy) {
  const timeoutMs = boundedInteger(policy.timeoutMs, HARD_LIMITS.timeoutMs, "timeoutMs");
  if (timeoutMs < 1) throw new Error("timeoutMs must be positive");
  const maximumResponseBytes = boundedInteger(
    policy.maximumResponseBytes,
    HARD_LIMITS.responseBytes,
    "maximumResponseBytes",
  );
  if (maximumResponseBytes < 1) throw new Error("maximumResponseBytes must be positive");
  const retry = {
    ...policy.retry,
    count: boundedInteger(policy.retry.count, HARD_LIMITS.retryCount, "retry.count"),
    baseDelayMs: boundedInteger(
      policy.retry.baseDelayMs,
      HARD_LIMITS.retryDelayMs,
      "retry.baseDelayMs",
    ),
    maximumDelayMs: boundedInteger(
      policy.retry.maximumDelayMs,
      HARD_LIMITS.retryDelayMs,
      "retry.maximumDelayMs",
    ),
    jitterRatio: boundedRatio(policy.retry.jitterRatio, "retry.jitterRatio"),
  };
  if (retry.baseDelayMs > retry.maximumDelayMs) {
    throw new Error("retry.baseDelayMs must not exceed retry.maximumDelayMs");
  }
  const redirect = {
    ...policy.redirect,
    maximumHops: boundedInteger(
      policy.redirect.maximumHops,
      HARD_LIMITS.redirectHops,
      "redirect.maximumHops",
    ),
  };
  return { ...policy, timeoutMs, maximumResponseBytes, retry, redirect };
}

export function resolveEffectiveTransportPolicy({
  source,
  registry,
  runtimeOverrides = {},
  now = new Date(),
} = {}) {
  if (!source || !registry) throw new TypeError("source and registry are required");
  const applicable = (registry.bindings ?? [])
    .filter((binding) => matches(binding, source))
    .sort((left, right) =>
      left.priority - right.priority || left.bindingId.localeCompare(right.bindingId));
  let policy = mergePolicy({}, registry.defaults);
  const policySources = ["defaults"];
  const bindingIds = [];
  let allowedHosts = [];
  let reason = null;
  let expiresAt = null;
  for (const binding of applicable) {
    if (binding.profile) {
      policy = mergePolicy(policy, registry.profiles[binding.profile]);
      policySources.push(`profile:${binding.profile}`);
    }
    if (binding.policy) policy = mergePolicy(policy, binding.policy);
    policySources.push(`binding:${binding.bindingId}`);
    bindingIds.push(binding.bindingId);
    if (binding.allowedHosts) allowedHosts = [...binding.allowedHosts];
    if (binding.reason) reason = binding.reason;
    if (binding.expiresAt) expiresAt = binding.expiresAt;
  }

  const override = runtimeOverrides.policy ?? {};
  if (Object.keys(override).length > 0) {
    policy = mergePolicy(policy, override);
    policySources.push("runtime_override");
  }
  policy = applySafetyLimits(policy);
  const sourceHostname = hostnameOf(source.listUrl);
  if (policy.tlsMode === "insecure-exact-host") {
    if (!allowedHosts.includes(sourceHostname)) {
      const error = new Error(
        `${source.sourceId}: insecure TLS is not authorized for ${sourceHostname}`,
      );
      error.code = "transport_policy_insecure_host_mismatch";
      throw error;
    }
    if (!reason || !expiresAt || new Date(`${expiresAt}T23:59:59.999Z`) < now) {
      const error = new Error(`${source.sourceId}: insecure TLS policy is missing or expired`);
      error.code = "transport_policy_insecure_expired";
      throw error;
    }
  }
  const deprecatedHosts = runtimeOverrides.deprecatedInsecureTlsHosts ?? [];
  if (
    deprecatedHosts.includes(sourceHostname)
    && !(policy.tlsMode === "insecure-exact-host" && allowedHosts.includes(sourceHostname))
  ) {
    const error = new Error(
      `${source.sourceId}: deprecated insecure TLS override is not authorized by the registry`,
    );
    error.code = "transport_policy_unauthorized_runtime_insecure_tls";
    throw error;
  }
  const userAgent = runtimeOverrides.userAgent
    ?? registry.userAgentProfiles[policy.userAgentProfile];
  if (!userAgent) {
    const error = new Error(`${source.sourceId}: unknown user-agent profile`);
    error.code = "transport_policy_unknown_user_agent";
    throw error;
  }
  const fingerprintInput = {
    registryVersion: registry.registryVersion,
    protocolMode: policy.protocolMode,
    dnsFamily: policy.dnsFamily,
    tlsMode: policy.tlsMode,
    allowedHosts,
    userAgentProfile: runtimeOverrides.userAgent
      ? "runtime-override"
      : policy.userAgentProfile,
    userAgent,
    timeoutMs: policy.timeoutMs,
    maximumResponseBytes: policy.maximumResponseBytes,
    retry: policy.retry,
    redirect: policy.redirect,
    bindingIds,
    runtimeOverrides: runtimeOverrides.evidence ?? {},
  };
  const policyFingerprint = fingerprintTransportPolicy(fingerprintInput);
  return Object.freeze({
    policyId: bindingIds.length > 0 ? bindingIds.join("+") : "registry-defaults",
    bindingId: bindingIds.at(-1) ?? null,
    bindingIds: Object.freeze(bindingIds),
    registryVersion: registry.registryVersion,
    registryFingerprint: registry.registryFingerprint,
    policyFingerprint,
    protocolMode: policy.protocolMode,
    dnsFamily: policy.dnsFamily,
    tlsMode: policy.tlsMode,
    allowedHosts: Object.freeze(allowedHosts),
    userAgentProfile: runtimeOverrides.userAgent
      ? "runtime-override"
      : policy.userAgentProfile,
    userAgent,
    timeoutMs: policy.timeoutMs,
    maximumResponseBytes: policy.maximumResponseBytes,
    retry: Object.freeze({ ...policy.retry }),
    redirect: Object.freeze({ ...policy.redirect }),
    reason,
    expiresAt,
    policySource: policySources.join("+"),
    runtimeOverrideApplied: Object.keys(override).length > 0
      || Boolean(runtimeOverrides.userAgent)
      || deprecatedHosts.includes(sourceHostname),
    runtimeOverrideEvidence: Object.freeze({ ...(runtimeOverrides.evidence ?? {}) }),
  });
}

export function resolveTransportPoliciesForSources({
  sources = [],
  registry,
  runtimeOverrides = {},
  now = new Date(),
} = {}) {
  const policies = new Map();
  for (const source of sources) {
    policies.set(
      source.sourceId,
      resolveEffectiveTransportPolicy({ source, registry, runtimeOverrides, now }),
    );
  }
  const requestedDeprecatedHosts = new Set(
    runtimeOverrides.deprecatedInsecureTlsHosts ?? [],
  );
  const authorizedHosts = new Set(
    [...policies.values()].flatMap((policy) =>
      policy.tlsMode === "insecure-exact-host" ? policy.allowedHosts : []),
  );
  for (const host of requestedDeprecatedHosts) {
    if (!authorizedHosts.has(host)) {
      const error = new Error(
        `Deprecated insecure TLS host ${host} is not authorized by the registry`,
      );
      error.code = "transport_policy_unauthorized_runtime_insecure_tls";
      throw error;
    }
  }
  return policies;
}

function optionalNumber(value, label) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    const error = new Error(`${label} must be numeric`);
    error.code = "transport_runtime_override_invalid";
    throw error;
  }
  return number;
}

export function parseTransportRuntimeOverrides(environment = process.env) {
  const policy = {};
  const retry = {};
  const evidence = {};
  const timeoutMs = optionalNumber(environment.CRAWL_TIMEOUT_MS, "CRAWL_TIMEOUT_MS");
  if (timeoutMs !== undefined) {
    policy.timeoutMs = Math.floor(timeoutMs);
    evidence.timeout_ms = policy.timeoutMs;
  }
  const retryCount = optionalNumber(environment.CRAWL_RETRY_COUNT, "CRAWL_RETRY_COUNT");
  if (retryCount !== undefined) {
    retry.count = Math.floor(retryCount);
    evidence.retry_count = retry.count;
  }
  const baseDelayMs = optionalNumber(
    environment.CRAWL_RETRY_BACKOFF_MS,
    "CRAWL_RETRY_BACKOFF_MS",
  );
  if (baseDelayMs !== undefined) {
    retry.baseDelayMs = Math.floor(baseDelayMs);
    evidence.retry_base_delay_ms = retry.baseDelayMs;
  }
  const maximumDelayMs = optionalNumber(
    environment.CRAWL_RETRY_MAX_DELAY_MS,
    "CRAWL_RETRY_MAX_DELAY_MS",
  );
  if (maximumDelayMs !== undefined) {
    retry.maximumDelayMs = Math.floor(maximumDelayMs);
    evidence.retry_maximum_delay_ms = retry.maximumDelayMs;
  }
  const jitterRatio = optionalNumber(
    environment.CRAWL_RETRY_JITTER_RATIO,
    "CRAWL_RETRY_JITTER_RATIO",
  );
  if (jitterRatio !== undefined) {
    retry.jitterRatio = jitterRatio;
    evidence.retry_jitter_ratio = retry.jitterRatio;
  }
  if (Object.keys(retry).length > 0) policy.retry = retry;
  if (environment.CRAWL_FORCE_IPV4 !== undefined) {
    policy.dnsFamily = String(environment.CRAWL_FORCE_IPV4).toLowerCase() === "false"
      ? "auto"
      : "ipv4";
    evidence.dns_family = policy.dnsFamily;
  }
  const deprecatedInsecureTlsHosts = [...new Set(
    String(environment.CRAWL_ALLOW_INSECURE_TLS_HOSTS ?? "")
      .split(/[\s,|]+/)
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  )].sort();
  if (deprecatedInsecureTlsHosts.some((host) => host.includes("*") || host.startsWith("."))) {
    const error = new Error("CRAWL_ALLOW_INSECURE_TLS_HOSTS accepts exact hostnames only");
    error.code = "transport_runtime_override_invalid";
    throw error;
  }
  if (deprecatedInsecureTlsHosts.length > 0) {
    evidence.deprecated_insecure_tls_hosts = deprecatedInsecureTlsHosts;
  }
  const userAgent = String(environment.CRAWL_USER_AGENT ?? "").trim() || null;
  if (userAgent) evidence.user_agent_profile = "runtime-override";
  return Object.freeze({
    policy,
    deprecatedInsecureTlsHosts,
    userAgent,
    evidence,
  });
}
