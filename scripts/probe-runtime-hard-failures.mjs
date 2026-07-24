import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadSources } from "../lib/notice-sources-loader.mjs";
import {
  createTransportClient,
  createTransportDispatcherPool,
  loadTransportPolicyRegistry,
  resolveEffectiveTransportPolicy,
  sanitizeTransportUrl,
} from "../lib/crawler-engine/transport/index.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_ATTEMPTS = 5;
const MIN_INTERVAL_MS = 15_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

function clean(value) {
  return String(value ?? "").trim();
}

function redactText(value) {
  return clean(value)
    .replace(/([?&][^&=\s]*(?:token|key|secret|password|signature|credential|authorization|auth)[^&=\s]*=)[^&\s]*/gi, "$1[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
}

function sanitizeHeaderValue(value) {
  const text = redactText(value).replace(/[\r\n\t]/g, " ");
  return text ? text.slice(0, 200) : null;
}

function bodySummary(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? "");
  const text = buffer.subarray(0, Math.min(buffer.length, 65_536)).toString("utf8");
  const title = text.match(/<title\b[^>]*>([\s\S]{0,500}?)<\/title>/i)?.[1]
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, 200) ?? null;
  return {
    body_sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    body_length: buffer.length,
    html_title: title,
  };
}

function errorEvidence(error) {
  return {
    error_code: clean(error?.code ?? error?.cause?.code ?? error?.cause?.errno) || "request_failed",
    error_category: clean(error?.category) || null,
    retryable: error?.retryable === true ? true : error?.retryable === false ? false : null,
    error_message: redactText(error?.message).slice(0, 300) || null,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInteger(value, label, { minimum, maximum }) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}`);
  }
  return parsed;
}

export function parseRuntimeHardFailureProbeArgs(argv) {
  const sourceIds = [];
  const options = {
    attempts: MAX_ATTEMPTS,
    intervalMs: MIN_INTERVAL_MS,
    timeoutMs: MAX_TIMEOUT_MS,
    output: null,
    protocolVariantSourceIds: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--source-id") {
      const sourceId = clean(argv[++index]);
      if (!sourceId) throw new Error("--source-id requires a value");
      sourceIds.push(sourceId);
    } else if (value === "--attempts") {
      options.attempts = parsePositiveInteger(argv[++index], "--attempts", { minimum: 1, maximum: MAX_ATTEMPTS });
    } else if (value === "--interval-ms") {
      options.intervalMs = parsePositiveInteger(argv[++index], "--interval-ms", { minimum: MIN_INTERVAL_MS, maximum: 300_000 });
    } else if (value === "--timeout-ms") {
      options.timeoutMs = parsePositiveInteger(argv[++index], "--timeout-ms", { minimum: 1, maximum: MAX_TIMEOUT_MS });
    } else if (value === "--output") {
      options.output = clean(argv[++index]);
      if (!options.output) throw new Error("--output requires a value");
    } else if (value === "--protocol-variant-source-id") {
      const sourceId = clean(argv[++index]);
      if (!sourceId) throw new Error("--protocol-variant-source-id requires a value");
      options.protocolVariantSourceIds.push(sourceId);
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  if (sourceIds.length === 0) throw new Error("At least one --source-id is required");
  return {
    ...options,
    sourceIds: [...new Set(sourceIds)],
    protocolVariantSourceIds: [...new Set(options.protocolVariantSourceIds)],
  };
}

async function probeDns(url, lookup = dns.lookup) {
  const hostname = new URL(url).hostname;
  const startedAt = Date.now();
  try {
    const entries = await lookup(hostname, { all: true, verbatim: true });
    return {
      hostname,
      success: true,
      ipv4_addresses: entries.filter((entry) => entry.family === 4).map((entry) => entry.address),
      ipv6_addresses: entries.filter((entry) => entry.family === 6).map((entry) => entry.address),
      error_code: null,
      elapsed_ms: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      hostname,
      success: false,
      ipv4_addresses: [],
      ipv6_addresses: [],
      error_code: clean(error?.code) || "dns_lookup_failed",
      elapsed_ms: Date.now() - startedAt,
    };
  }
}

async function probeProductionTransport({ source, policy, dispatcherPool, timeoutMs }) {
  const client = createTransportClient({ source, policy, dispatcherPool });
  const startedAt = Date.now();
  try {
    const response = await client.request(source.listUrl, {
      kind: "runtime_hard_failure_probe",
      retryCount: 0,
      timeoutMs,
      maxBytes: MAX_RESPONSE_BYTES,
    });
    return {
      client: "production_transport",
      success: true,
      started_at: new Date(startedAt).toISOString(),
      finished_at: new Date().toISOString(),
      elapsed_ms: Date.now() - startedAt,
      http_status: response.httpStatus,
      content_type: response.contentType || null,
      content_length: response.contentLength ?? null,
      final_url: sanitizeTransportUrl(response.finalUrl),
      redirect_chain: response.redirectChain ?? [],
      retry_after_present: false,
      server: null,
      ...bodySummary(response.bytes),
      transport: client.evidence(),
    };
  } catch (error) {
    return {
      client: "production_transport",
      success: false,
      started_at: new Date(startedAt).toISOString(),
      finished_at: new Date().toISOString(),
      elapsed_ms: Date.now() - startedAt,
      http_status: Number(error?.httpStatus) || null,
      content_type: clean(error?.contentType) || null,
      content_length: null,
      final_url: sanitizeTransportUrl(error?.finalUrl ?? source.listUrl),
      redirect_chain: client.evidence().redirect_chain ?? [],
      retry_after_present: Boolean(error?.retryAfter),
      server: null,
      body_sha256: null,
      body_length: null,
      html_title: null,
      transport: client.evidence(),
      ...errorEvidence(error),
    };
  }
}

async function probeNodeClient({ url, timeoutMs, family, insecureHTTPParser = false, maximumRedirects = 5 }) {
  const startedAt = Date.now();
  const visit = async (target, redirects = []) => new Promise((resolve) => {
    const parsed = new URL(target);
    const requestModule = parsed.protocol === "https:" ? https : http;
    const timings = { dns_ms: null, tcp_connect_ms: null, tls_handshake_ms: null, ttfb_ms: null, body_read_ms: null };
    let socketAt = null;
    let responseAt = null;
    const request = requestModule.request(parsed, {
      method: "GET",
      headers: { "user-agent": "Mozilla/5.0", accept: "*/*" },
      timeout: timeoutMs,
      family,
      insecureHTTPParser,
      rejectUnauthorized: true,
    }, (response) => {
      responseAt = Date.now();
      timings.ttfb_ms = responseAt - startedAt;
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && location) {
        response.resume();
        if (redirects.length >= maximumRedirects) {
          resolve({ success: false, http_status: response.statusCode, final_url: sanitizeTransportUrl(target), redirect_chain: redirects, ...errorEvidence(Object.assign(new Error("redirect limit exceeded"), { code: "redirect_limit" })) });
          return;
        }
        visit(new URL(location, parsed).toString(), [...redirects, { status: response.statusCode, from: sanitizeTransportUrl(target), to: sanitizeTransportUrl(new URL(location, parsed).toString()) }]).then(resolve);
        return;
      }
      const hash = crypto.createHash("sha256");
      const titleChunks = [];
      let total = 0;
      let exceeded = false;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > MAX_RESPONSE_BYTES) {
          exceeded = true;
          response.destroy(Object.assign(new Error("response body exceeds limit"), { code: "bounded_limit_exceeded" }));
          return;
        }
        hash.update(chunk);
        if (Buffer.concat(titleChunks).length < 65_536) titleChunks.push(chunk);
      });
      response.on("end", () => {
        const finishedAt = Date.now();
        timings.body_read_ms = finishedAt - responseAt;
        const summary = bodySummary(Buffer.concat(titleChunks));
        resolve({
          client: insecureHTTPParser ? "node_http_insecure_parser_diagnostic" : "node_http_strict",
          success: response.statusCode >= 200 && response.statusCode < 400,
          started_at: new Date(startedAt).toISOString(),
          finished_at: new Date(finishedAt).toISOString(),
          elapsed_ms: finishedAt - startedAt,
          http_status: response.statusCode ?? null,
          content_type: clean(response.headers["content-type"]) || null,
          content_length: Number(response.headers["content-length"]) || null,
          final_url: sanitizeTransportUrl(target),
          redirect_chain: redirects,
          retry_after_present: Boolean(response.headers["retry-after"]),
          server: sanitizeHeaderValue(response.headers.server),
          body_sha256: exceeded ? null : hash.digest("hex"),
          body_length: total,
          html_title: summary.html_title,
          timings,
        });
      });
      response.on("error", (error) => resolve({
        client: insecureHTTPParser ? "node_http_insecure_parser_diagnostic" : "node_http_strict",
        success: false,
        started_at: new Date(startedAt).toISOString(),
        finished_at: new Date().toISOString(),
        elapsed_ms: Date.now() - startedAt,
        http_status: null,
        content_type: null,
        content_length: null,
        final_url: sanitizeTransportUrl(target),
        redirect_chain: redirects,
        retry_after_present: false,
        server: null,
        body_sha256: null,
        body_length: null,
        html_title: null,
        timings,
        ...errorEvidence(error),
      }));
    });
    request.on("socket", (socket) => {
      socketAt = Date.now();
      socket.once("connect", () => { timings.tcp_connect_ms = Date.now() - socketAt; });
      socket.once("secureConnect", () => { timings.tls_handshake_ms = Date.now() - socketAt - (timings.tcp_connect_ms ?? 0); });
      socket.once("lookup", () => { timings.dns_ms = Date.now() - socketAt; });
    });
    request.setTimeout(timeoutMs, () => request.destroy(Object.assign(new Error("request timeout"), { code: "request_timeout" })));
    request.on("error", (error) => resolve({
      client: insecureHTTPParser ? "node_http_insecure_parser_diagnostic" : "node_http_strict",
      success: false,
      started_at: new Date(startedAt).toISOString(),
      finished_at: new Date().toISOString(),
      elapsed_ms: Date.now() - startedAt,
      http_status: null,
      content_type: null,
      content_length: null,
      final_url: sanitizeTransportUrl(target),
      redirect_chain: redirects,
      retry_after_present: false,
      server: null,
      body_sha256: null,
      body_length: null,
      html_title: null,
      timings,
      ...errorEvidence(error),
    }));
    request.end();
  });
  return visit(url);
}

function probeCurl({ url, timeoutMs }) {
  const available = spawnSync("curl", ["--version"], { encoding: "utf8", windowsHide: true });
  if (available.error || available.status !== 0) return { client: "curl", curl_available: false, success: false };
  const marker = "__RUNTIME_PROBE__";
  const startedAt = Date.now();
  const result = spawnSync("curl", [
    "-sS", "-L", "--max-redirs", "5", "--connect-timeout", "10", "--max-time", String(Math.ceil(timeoutMs / 1000)),
    "--max-filesize", String(MAX_RESPONSE_BYTES), "-o", os.devNull, "-D", "-", "-w", `${marker}%{http_code}|%{url_effective}|%{content_type}|%{time_total}`, url,
  ], { encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 });
  const elapsedMs = Date.now() - startedAt;
  const output = `${result.stdout ?? ""}`;
  const markerIndex = output.lastIndexOf(marker);
  const fields = markerIndex >= 0 ? output.slice(markerIndex + marker.length).trim().split("|") : [];
  return {
    client: "curl",
    curl_available: true,
    success: result.status === 0 && Number(fields[0]) >= 200 && Number(fields[0]) < 400,
    exit_code: result.status,
    started_at: new Date(startedAt).toISOString(),
    finished_at: new Date().toISOString(),
    elapsed_ms: elapsedMs,
    http_status: Number(fields[0]) || null,
    final_url: fields[1] ? sanitizeTransportUrl(fields[1]) : sanitizeTransportUrl(url),
    content_type: fields[2] || null,
    curl_time_total_ms: fields[3] ? Math.round(Number(fields[3]) * 1000) : null,
    redirect_chain: [],
    body_sha256: null,
    body_length: null,
    html_title: null,
    error_code: result.status === 0 ? null : `curl_exit_${result.status ?? "unknown"}`,
    error_message: redactText(result.stderr).slice(0, 300) || null,
  };
}

function statistics(attempts) {
  const production = attempts.map((attempt) => attempt.production_transport);
  const elapsed = production.map((item) => item.elapsed_ms).filter(Number.isFinite).sort((left, right) => left - right);
  const counts = (field) => Object.fromEntries([...production.reduce((map, item) => {
    const key = String(item[field] ?? "null");
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map())].sort());
  const successCount = production.filter((item) => item.success).length;
  const classification = successCount === attempts.length ? "currently_healthy"
    : successCount >= 4 ? "mostly_healthy_with_transient_failure"
      : successCount >= 2 ? "intermittent_upstream_failure"
        : "reproducible_failure";
  return {
    success_count: successCount,
    failure_count: attempts.length - successCount,
    success_rate: attempts.length ? successCount / attempts.length : 0,
    http_status_counts: counts("http_status"),
    transport_error_code_counts: counts("error_code"),
    average_elapsed_ms: elapsed.length ? Math.round(elapsed.reduce((sum, item) => sum + item, 0) / elapsed.length) : null,
    median_elapsed_ms: elapsed.length ? elapsed[Math.floor(elapsed.length / 2)] : null,
    maximum_elapsed_ms: elapsed.at(-1) ?? null,
    body_hash_variants: [...new Set(production.map((item) => item.body_sha256).filter(Boolean))].length,
    redirect_chain_variants: [...new Set(production.map((item) => JSON.stringify(item.redirect_chain ?? [])))].length,
    classification,
  };
}

export async function runRuntimeHardFailureProbe({ argv = process.argv.slice(2), dependencies = {} } = {}) {
  const options = parseRuntimeHardFailureProbeArgs(argv);
  const sources = dependencies.sources ?? (await loadSources("manifest")).sources;
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  const selected = options.sourceIds.map((sourceId) => {
    const source = sourceById.get(sourceId);
    if (!source) throw Object.assign(new Error(`Unknown manifest source: ${sourceId}`), { code: "runtime_probe_unknown_source" });
    return source;
  });
  for (const sourceId of options.protocolVariantSourceIds) {
    if (!sourceById.has(sourceId) || !options.sourceIds.includes(sourceId)) {
      throw Object.assign(new Error(`Protocol variant source must be selected from the manifest: ${sourceId}`), { code: "runtime_probe_invalid_protocol_variant_source" });
    }
  }
  const registry = dependencies.registry ?? loadTransportPolicyRegistry({ sources });
  const resolvePolicy = dependencies.resolvePolicy ?? resolveEffectiveTransportPolicy;
  const dispatcherPool = dependencies.dispatcherPool ?? createTransportDispatcherPool();
  const lookup = dependencies.lookup ?? dns.lookup;
  const now = dependencies.now ?? (() => new Date());
  const delay = dependencies.delay ?? sleep;
  const productionProbe = dependencies.productionProbe ?? probeProductionTransport;
  const nodeProbe = dependencies.nodeProbe ?? probeNodeClient;
  const curlProbe = dependencies.curlProbe ?? probeCurl;
  try {
    const sourceResults = [];
    for (const source of selected) {
      const policy = resolvePolicy({ source, registry });
      const dnsEvidence = await probeDns(source.listUrl, lookup);
      const attempts = [];
      for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
        const productionTransport = await productionProbe({ source, policy, dispatcherPool, timeoutMs: options.timeoutMs });
        const nodeStrict = await nodeProbe({ url: source.listUrl, timeoutMs: options.timeoutMs, family: policy.dnsFamily === "ipv4" ? 4 : 0 });
        const curl = curlProbe({ url: source.listUrl, timeoutMs: options.timeoutMs });
        const variants = options.protocolVariantSourceIds.includes(source.sourceId) ? {
          node_insecure_parser_diagnostic: await nodeProbe({ url: source.listUrl, timeoutMs: options.timeoutMs, family: policy.dnsFamily === "ipv4" ? 4 : 0, insecureHTTPParser: true }),
          curl_https: source.listUrl.startsWith("http:") ? curlProbe({ url: source.listUrl.replace(/^http:/, "https:"), timeoutMs: options.timeoutMs }) : null,
        } : null;
        attempts.push({ attempt, production_transport: productionTransport, node_strict: nodeStrict, curl, protocol_variants: variants });
        if (attempt < options.attempts) await delay(options.intervalMs);
      }
      sourceResults.push({
        source_id: source.sourceId,
        source_name: source.sourceName,
        manifest_snapshot: { list_url: sanitizeTransportUrl(source.listUrl), base_url: sanitizeTransportUrl(source.baseUrl), adapter: source.adapter || null },
        resolved_transport_policy: {
          policy_id: policy.policyId,
          protocol_mode: policy.protocolMode,
          tls_mode: policy.tlsMode,
          dns_family: policy.dnsFamily,
          timeout_ms: policy.timeoutMs,
          allowed_http_hosts: policy.allowedHttpHosts ?? [],
        },
        dns: dnsEvidence,
        attempts,
        aggregate: statistics(attempts),
      });
    }
    return {
      schema_version: "runtime-hard-failure-probe-v1",
      captured_at: now().toISOString(),
      main_sha: dependencies.mainSha ?? null,
      branch: dependencies.branch ?? null,
      probe_configuration: {
        source_concurrency: 1,
        source_retry_count: 0,
        transport_retry_count: 0,
        attempts_per_source: options.attempts,
        interval_ms: options.intervalMs,
        timeout_ms: options.timeoutMs,
        maximum_redirects: 5,
        maximum_response_bytes: MAX_RESPONSE_BYTES,
        response_body_recorded: false,
        request_methods: ["GET"],
        cookies_or_authorization_sent: false,
        protocol_variants_diagnostic_only: options.protocolVariantSourceIds.length > 0,
        protocol_variant_source_ids: options.protocolVariantSourceIds,
      },
      sources: sourceResults,
    };
  } finally {
    await dispatcherPool.close?.();
  }
}

export async function runRuntimeHardFailureProbeCli({ argv = process.argv.slice(2) } = {}) {
  const options = parseRuntimeHardFailureProbeArgs(argv);
  const evidence = await runRuntimeHardFailureProbe({
    argv,
    dependencies: {
      mainSha: clean(spawnSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).stdout) || null,
      branch: clean(spawnSync("git", ["branch", "--show-current"], { cwd: repositoryRoot, encoding: "utf8" }).stdout) || null,
    },
  });
  const outputPath = path.resolve(repositoryRoot, options.output ?? path.join("reports", "runtime-diagnostics", `runtime-hard-failures-probe-${new Date().toISOString().slice(0, 10)}.json`));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(`runtime_hard_failure_probe_written=${outputPath}`);
  return evidence;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runRuntimeHardFailureProbeCli().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
