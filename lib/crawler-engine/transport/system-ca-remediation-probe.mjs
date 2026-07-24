import { sanitizeTransportUrl } from "./transport-client.mjs";

export const DEFAULT_SYSTEM_CA_REMEDIATION_SOURCE_IDS = Object.freeze([
  "skku_009",
  "skku_013",
  "yonsei_057",
]);

function hostnameOf(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function errorCode(error) {
  return String(error?.code ?? error?.cause?.code ?? "request_failed").trim() || "request_failed";
}

function baseProbePolicy({ source, registry, mode, timeoutMs, resolvePolicy }) {
  const policy = resolvePolicy({
    source,
    registry,
    runtimeOverrides: {
      policy: {
        timeoutMs,
        tlsMode: mode,
        retry: {
          count: 0,
          baseDelayMs: 0,
          maximumDelayMs: 0,
          jitterRatio: 0,
        },
      },
      evidence: {
        system_ca_remediation_probe: true,
        tls_mode: mode,
      },
    },
  });
  if (mode === "system-ca" && !policy.allowedHosts.includes(hostnameOf(source.listUrl))) {
    const error = new Error(`${source.sourceId}: system-ca probe requires an exact registry host binding.`);
    error.code = "transport_probe_host_mismatch";
    throw error;
  }
  return policy;
}

async function probeMode({ source, registry, mode, timeoutMs, createClient, dispatcherPool, resolvePolicy }) {
  const policy = baseProbePolicy({ source, registry, mode, timeoutMs, resolvePolicy });
  const client = createClient({ source, policy, dispatcherPool });
  try {
    const response = await client.fetchText(source.listUrl, {
      kind: "runtime_diagnostic_probe",
      retryCount: 0,
      timeoutMs,
    });
    const transport = client.evidence();
    return {
      success: true,
      http_status: response.httpStatus,
      content_type: response.contentType || null,
      final_url: sanitizeTransportUrl(response.finalUrl),
      redirect_chain: transport.redirect_chain ?? [],
      ...(mode === "system-ca" ? {
        certificate_verification_preserved: transport.insecure_tls_applied !== true,
      } : {}),
      system_ca_applied: transport.system_ca_applied === true,
      insecure_tls_applied: transport.insecure_tls_applied === true,
    };
  } catch (error) {
    const transport = client.evidence();
    return {
      success: false,
      error_code: errorCode(error),
      final_url: sanitizeTransportUrl(error?.finalUrl ?? transport.final_url ?? source.listUrl),
      redirect_chain: transport.redirect_chain ?? [],
      ...(mode === "system-ca" ? {
        certificate_verification_preserved: transport.insecure_tls_applied !== true,
      } : {}),
      system_ca_applied: transport.system_ca_applied === true,
      insecure_tls_applied: transport.insecure_tls_applied === true,
    };
  }
}

export async function probeSystemCaRemediation({
  sources = [],
  registry,
  sourceIds = DEFAULT_SYSTEM_CA_REMEDIATION_SOURCE_IDS,
  timeoutMs = 25000,
  createClient,
  createDispatcherPool,
  resolvePolicy,
  now = () => new Date(),
} = {}) {
  if (!registry || typeof createClient !== "function" || typeof createDispatcherPool !== "function" || typeof resolvePolicy !== "function") {
    throw new TypeError("registry, createClient, createDispatcherPool, and resolvePolicy are required");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 25000) {
    throw new RangeError("timeoutMs must be an integer from 1 through 25000");
  }
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  const selected = sourceIds.map((sourceId) => {
    const source = sourceById.get(sourceId);
    if (!source) {
      const error = new Error(`Unknown manifest source: ${sourceId}`);
      error.code = "transport_probe_unknown_source";
      throw error;
    }
    if (!/^https:$/i.test(new URL(source.listUrl).protocol)) {
      const error = new Error(`${sourceId}: system-ca probe requires an HTTPS list URL.`);
      error.code = "transport_probe_invalid_source_host";
      throw error;
    }
    return source;
  });
  const dispatcherPool = createDispatcherPool();
  try {
    const results = [];
    for (const source of selected) {
      const strict = await probeMode({
        source, registry, mode: "strict", timeoutMs, createClient, dispatcherPool, resolvePolicy,
      });
      const systemCa = await probeMode({
        source, registry, mode: "system-ca", timeoutMs, createClient, dispatcherPool, resolvePolicy,
      });
      results.push({
        source_id: source.sourceId,
        list_url: sanitizeTransportUrl(source.listUrl),
        hostname: hostnameOf(source.listUrl),
        strict,
        system_ca: systemCa,
      });
    }
    return {
      schema_version: "crawler-transport-system-ca-evidence-v1",
      captured_at: now().toISOString(),
      probe_policy: {
        request_method: "GET",
        request_count_per_mode: 1,
        timeout_ms: timeoutMs,
        retry_count: 0,
        response_body_recorded: false,
      },
      sources: results,
    };
  } finally {
    await dispatcherPool.close?.();
  }
}

export function compareSystemCaRemediationEvidence(expected, actual) {
  const mismatches = [];
  const expectedById = new Map((expected?.sources ?? []).map((item) => [item.source_id, item]));
  const actualById = new Map((actual?.sources ?? []).map((item) => [item.source_id, item]));
  for (const [sourceId, previous] of expectedById) {
    const current = actualById.get(sourceId);
    if (!current) {
      mismatches.push(`${sourceId}: missing current result`);
      continue;
    }
    for (const [label, left, right] of [
      ["hostname", previous.hostname, current.hostname],
      ["strict.success", previous.strict?.success, current.strict?.success],
      ["strict.error_code", previous.strict?.error_code ?? null, current.strict?.error_code ?? null],
      ["system_ca.success", previous.system_ca?.success, current.system_ca?.success],
      ["system_ca.http_status", previous.system_ca?.http_status ?? null, current.system_ca?.http_status ?? null],
      ["system_ca.certificate_verification_preserved", previous.system_ca?.certificate_verification_preserved, current.system_ca?.certificate_verification_preserved],
      ["system_ca.system_ca_applied", previous.system_ca?.system_ca_applied, current.system_ca?.system_ca_applied],
      ["system_ca.insecure_tls_applied", previous.system_ca?.insecure_tls_applied, current.system_ca?.insecure_tls_applied],
    ]) {
      if (left !== right) mismatches.push(`${sourceId}: ${label} changed`);
    }
  }
  for (const sourceId of actualById.keys()) {
    if (!expectedById.has(sourceId)) mismatches.push(`${sourceId}: unexpected current result`);
  }
  return mismatches;
}
