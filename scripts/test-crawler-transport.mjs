import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import {
  fetchCauPortalList,
  fetchJsonApiBoardList,
} from "../lib/crawler-adapters/index.mjs";
import {
  runBoundedCrawlerSource,
} from "../lib/crawler-engine/common-runner.mjs";
import {
  createCrawlerCheckpointSession,
} from "../lib/crawler-engine/checkpoint.mjs";
import {
  buildResolvedTransportPolicyEvidence,
  createTransportClient,
  createTransportDispatcherPool,
  fingerprintTransportPolicy,
  loadTransportPolicyRegistry,
  parseTransportRuntimeOverrides,
  resolveEffectiveTransportPolicy,
  resolveTransportPoliciesForSources,
  sanitizeTransportUrl,
  validateTransportPolicyRegistry,
} from "../lib/crawler-engine/transport/index.mjs";
import {
  detectScholarshipCandidate,
} from "../lib/detection/scholarship-candidate-detector.mjs";
import { buildDetailFetchPlan } from "../lib/crawler-engine/detail-fetch-planner.mjs";
import { buildCrawlerReport } from "../lib/crawler-engine/runtime-diagnostics/report-builder.mjs";
import { createListAdapterExecution } from "../lib/crawler-engine/list-adapter-strategy.mjs";
import { loadSources } from "../lib/notice-sources-loader.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const policyRoot = path.join(repositoryRoot, "config", "crawler-transport");
const rawRegistry = JSON.parse(
  fs.readFileSync(path.join(policyRoot, "transport-policies.json"), "utf8"),
);
const manifestSources = (await loadSources("manifest")).sources;
const fixedNow = new Date("2026-07-24T00:00:00.000Z");
let passed = 0;

function clone(value) {
  return structuredClone(value);
}

async function test(name, operation) {
  await operation();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

function validationFor(registry, sources = manifestSources, now = fixedNow) {
  return validateTransportPolicyRegistry({
    registry,
    sources,
    now,
    rootDirectory: policyRoot,
  });
}

function expectInvalid(registry, pattern, sources = manifestSources, now = fixedNow) {
  const validation = validationFor(registry, sources, now);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" | "), pattern);
}

const loadedRegistry = loadTransportPolicyRegistry({
  sources: manifestSources,
  now: fixedNow,
});
const strictSource = {
  sourceId: "fixture_strict",
  sourceName: "Fixture strict",
  universitySlug: "fixture",
  listUrl: "https://fixture.example/list",
};
const strictPolicy = resolveEffectiveTransportPolicy({
  source: strictSource,
  registry: loadedRegistry,
  now: fixedNow,
});

function policy(overrides = {}) {
  return {
    ...strictPolicy,
    ...overrides,
    retry: {
      ...strictPolicy.retry,
      count: 0,
      baseDelayMs: 0,
      maximumDelayMs: 0,
      jitterRatio: 0,
      ...(overrides.retry ?? {}),
    },
    redirect: {
      ...strictPolicy.redirect,
      ...(overrides.redirect ?? {}),
    },
  };
}

class FakeDispatcherPool {
  calls = [];

  dispatcherFor(url, selectedPolicy) {
    const parsed = new URL(url);
    const insecureTlsApplied = parsed.protocol === "https:"
      && selectedPolicy.tlsMode === "insecure-exact-host"
      && selectedPolicy.allowedHosts.includes(parsed.hostname.toLowerCase());
    this.calls.push({
      url: parsed.toString(),
      hostname: parsed.hostname,
      dnsFamily: selectedPolicy.dnsFamily,
      insecureTlsApplied,
    });
    return { dispatcher: {}, insecureTlsApplied };
  }
}

function response(status = 200, body = "ok", headers = {}) {
  return new Response(body, { status, headers });
}

function cauPortalAdapterConfig(overrides = {}) {
  return {
    apiAccept: "*/*",
    jsonContentTypePolicy: "body-json",
    requiredListPath: "data.list",
    requestUrlTemplate: "https://www.cau.ac.kr/ajax/FR_SVC/BBSViewList2.do",
    detailUrlTemplate: "https://www.cau.ac.kr/cms/FR_CON/BoardView.do",
    ...overrides,
  };
}

await test("normal registry loads and resolves every manifest source", () => {
  assert.equal(validationFor(rawRegistry).valid, true);
  const policies = resolveTransportPoliciesForSources({
    sources: manifestSources,
    registry: loadedRegistry,
    now: fixedNow,
  });
  assert.equal(policies.size, manifestSources.length);
});

await test("schemaVersion mismatch fails closed", () => {
  const registry = clone(rawRegistry);
  registry.schemaVersion = "crawler-transport-policy-v0";
  expectInvalid(registry, /schema|schemaVersion/i);
});

await test("unknown profile fails closed", () => {
  const registry = clone(rawRegistry);
  registry.bindings[0].profile = "missing-profile";
  expectInvalid(registry, /unknown profile/i);
});

await test("duplicate bindingId fails closed", () => {
  const registry = clone(rawRegistry);
  registry.bindings.push(clone(registry.bindings[0]));
  expectInvalid(registry, /duplicate bindingId/i);
});

await test("conflicting same-priority bindings fail closed", () => {
  const registry = clone(rawRegistry);
  registry.bindings.push(
    {
      bindingId: "fixture-conflict-a",
      priority: 500,
      sourceIds: ["cau_001"],
      policy: { timeoutMs: 1000 },
    },
    {
      bindingId: "fixture-conflict-b",
      priority: 500,
      sourceIds: ["cau_001"],
      policy: { timeoutMs: 2000 },
    },
  );
  expectInvalid(registry, /conflicting bindings/i);
});

await test("wildcard hostname fails closed", () => {
  const registry = clone(rawRegistry);
  registry.bindings.push({
    bindingId: "fixture-wildcard",
    priority: 500,
    hosts: ["*.example.com"],
    policy: { timeoutMs: 1000 },
  });
  expectInvalid(registry, /wildcard|invalid hostname/i);
});

await test("insecure TLS requires allowedHosts", () => {
  const registry = clone(rawRegistry);
  registry.bindings.push({
    bindingId: "fixture-insecure-no-host",
    priority: 500,
    sourceIds: ["cau_001"],
    policy: { tlsMode: "insecure-exact-host" },
    reason: "fixture",
    expiresAt: "2026-12-31",
  });
  expectInvalid(registry, /requires allowedHosts/i);
});

await test("insecure TLS requires a reason", () => {
  const registry = clone(rawRegistry);
  const binding = registry.bindings.find((item) =>
    item.bindingId === "hanyang-009-insecure-tls");
  delete binding.reason;
  expectInvalid(registry, /requires reason/i);
});

await test("insecure TLS requires expiresAt", () => {
  const registry = clone(rawRegistry);
  const binding = registry.bindings.find((item) =>
    item.bindingId === "hanyang-009-insecure-tls");
  delete binding.expiresAt;
  expectInvalid(registry, /requires expiresAt/i);
});

await test("expired insecure TLS policy fails closed", () => {
  const registry = clone(rawRegistry);
  const binding = registry.bindings.find((item) =>
    item.bindingId === "hanyang-009-insecure-tls");
  binding.expiresAt = "2026-07-23";
  expectInvalid(registry, /expired/i);
});

await test("insecure TLS source hostname mismatch fails closed", () => {
  const registry = clone(rawRegistry);
  const binding = registry.bindings.find((item) =>
    item.bindingId === "hanyang-009-insecure-tls");
  binding.allowedHosts = ["other.example.com"];
  expectInvalid(registry, /not in allowedHosts/i);
});

await test("unknown policy enum fails schema validation", () => {
  const registry = clone(rawRegistry);
  registry.defaults.dnsFamily = "random";
  expectInvalid(registry, /schema|enum/i);
});

await test("registry and policy fingerprints are deterministic", () => {
  assert.equal(
    fingerprintTransportPolicy(rawRegistry),
    fingerprintTransportPolicy(clone(rawRegistry)),
  );
  const first = resolveEffectiveTransportPolicy({
    source: strictSource,
    registry: loadedRegistry,
    now: fixedNow,
  });
  const second = resolveEffectiveTransportPolicy({
    source: clone(strictSource),
    registry: loadedRegistry,
    now: fixedNow,
  });
  assert.equal(first.policyFingerprint, second.policyFingerprint);
});

await test("resolver applies defaults, group profiles, and source bindings", () => {
  assert.equal(strictPolicy.tlsMode, "strict");
  assert.equal(strictPolicy.protocolMode, "strict");
  const ewhaSource = manifestSources.find((source) => source.sourceId.startsWith("ewha_"));
  const ewhaPolicy = resolveEffectiveTransportPolicy({
    source: ewhaSource,
    registry: loadedRegistry,
    now: fixedNow,
  });
  assert.equal(ewhaPolicy.timeoutMs, 30000);
  assert.equal(ewhaPolicy.retry.count, 3);
  const cauTlsSource = manifestSources.find((source) => source.sourceId === "cau_002");
  const cauTlsPolicy = resolveEffectiveTransportPolicy({
    source: cauTlsSource,
    registry: loadedRegistry,
    now: fixedNow,
  });
  assert.equal(cauTlsPolicy.tlsMode, "system-ca");
  assert.deepEqual(cauTlsPolicy.allowedHosts, ["econ.cau.ac.kr"]);
});

await test("resolver applies hostname bindings", () => {
  const registry = clone(rawRegistry);
  registry.bindings.push({
    bindingId: "fixture-host-policy",
    priority: 500,
    hosts: ["fixture.example"],
    policy: { timeoutMs: 4321 },
  });
  const resolved = resolveEffectiveTransportPolicy({
    source: strictSource,
    registry: {
      ...registry,
      registryFingerprint: fingerprintTransportPolicy(registry),
    },
    now: fixedNow,
  });
  assert.equal(resolved.timeoutMs, 4321);
  assert.equal(resolved.bindingId, "fixture-host-policy");
});

await test("resolver enforces code-owned safety limits", () => {
  assert.throws(
    () => resolveEffectiveTransportPolicy({
      source: strictSource,
      registry: loadedRegistry,
      runtimeOverrides: {
        policy: { timeoutMs: 120001 },
        evidence: { timeout_ms: 120001 },
      },
      now: fixedNow,
    }),
    /safety limit/i,
  );
  assert.throws(
    () => resolveEffectiveTransportPolicy({
      source: strictSource,
      registry: loadedRegistry,
      runtimeOverrides: {
        policy: { retry: { jitterRatio: 2 } },
        evidence: { retry_jitter_ratio: 2 },
      },
      now: fixedNow,
    }),
    /safety limit/i,
  );
});

await test("runtime environment overrides are bounded and evidenced", () => {
  const overrides = parseTransportRuntimeOverrides({
    CRAWL_TIMEOUT_MS: "30000",
    CRAWL_RETRY_COUNT: "2",
    CRAWL_RETRY_BACKOFF_MS: "1200",
    CRAWL_RETRY_MAX_DELAY_MS: "10000",
    CRAWL_RETRY_JITTER_RATIO: "0.2",
    CRAWL_FORCE_IPV4: "false",
    CRAWL_USER_AGENT: "fixture-agent",
  });
  const resolved = resolveEffectiveTransportPolicy({
    source: strictSource,
    registry: loadedRegistry,
    runtimeOverrides: overrides,
    now: fixedNow,
  });
  assert.equal(resolved.timeoutMs, 30000);
  assert.equal(resolved.retry.count, 2);
  assert.equal(resolved.dnsFamily, "auto");
  assert.equal(resolved.runtimeOverrideApplied, true);
  assert.equal(resolved.runtimeOverrideEvidence.retry_count, 2);
  assert.equal(resolved.userAgent, "fixture-agent");
});

await test("HTTP source keeps HTTP only with explicit preserve-http policy", () => {
  const source = manifestSources.find((item) => item.sourceId === "hanyang_012");
  const resolved = resolveEffectiveTransportPolicy({
    source,
    registry: loadedRegistry,
    now: fixedNow,
  });
  assert.equal(new URL(source.listUrl).protocol, "http:");
  assert.equal(resolved.protocolMode, "preserve-http");
});

await test("dispatcher applies insecure TLS only to the exact HTTPS hostname", async () => {
  const source = manifestSources.find((item) => item.sourceId === "hanyang_009");
  const selectedPolicy = resolveEffectiveTransportPolicy({
    source,
    registry: loadedRegistry,
    now: fixedNow,
  });
  const pool = createTransportDispatcherPool();
  try {
    assert.equal(
      pool.dispatcherFor("https://hyurban.hanyang.ac.kr/list", selectedPolicy)
        .insecureTlsApplied,
      true,
    );
    assert.equal(
      pool.dispatcherFor("https://unrelated.example/list", selectedPolicy)
        .insecureTlsApplied,
      false,
    );
    assert.equal(
      pool.dispatcherFor("http://hyurban.hanyang.ac.kr/list", selectedPolicy)
        .insecureTlsApplied,
      false,
    );
  } finally {
    await pool.close();
  }
});

await test("TransportClient records strict policy and DNS family", async () => {
  const dispatcherPool = new FakeDispatcherPool();
  const client = createTransportClient({
    source: strictSource,
    policy: policy({ dnsFamily: "auto" }),
    dispatcherPool,
    fetchImpl: async () => response(),
  });
  await client.request(strictSource.listUrl);
  assert.equal(dispatcherPool.calls[0].dnsFamily, "auto");
  assert.equal(client.evidence().tls_mode, "strict");
  assert.equal(client.evidence().request_attempt_count, 1);
});

await test("TransportClient times out a stalled request", async () => {
  const client = createTransportClient({
    source: strictSource,
    policy: policy({ timeoutMs: 10 }),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }),
  });
  await assert.rejects(
    () => client.request(strictSource.listUrl),
    (error) => error.code === "request_timeout",
  );
});

await test("retryable network failure is retried and evidenced", async () => {
  let calls = 0;
  const client = createTransportClient({
    source: strictSource,
    policy: policy({ retry: { count: 1 } }),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("reset");
        error.code = "ECONNRESET";
        throw error;
      }
      return response();
    },
  });
  await client.request(strictSource.listUrl);
  assert.equal(calls, 2);
  assert.equal(client.evidence().request_retry_count, 1);
  assert.equal(client.evidence().request_attempt_count, 2);
});

await test("TLS failure is non-retryable", async () => {
  let calls = 0;
  const client = createTransportClient({
    source: strictSource,
    policy: policy({ retry: { count: 3 } }),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async () => {
      calls += 1;
      const error = new Error("certificate");
      error.code = "ERR_TLS_CERT_ALTNAME_INVALID";
      throw error;
    },
  });
  await assert.rejects(() => client.request(strictSource.listUrl));
  assert.equal(calls, 1);
});

for (const status of [408, 429, 500, 503]) {
  await test(`HTTP ${status} is retried`, async () => {
    let calls = 0;
    const client = createTransportClient({
      source: strictSource,
      policy: policy({ retry: { count: 1 } }),
      dispatcherPool: new FakeDispatcherPool(),
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? response(status, "", { "retry-after": "0" })
          : response();
      },
    });
    await client.request(strictSource.listUrl);
    assert.equal(calls, 2);
    assert.equal(
      client.evidence().request_attempt_history[0].retry_delay_source,
      "retry_after",
    );
  });
}

await test("ordinary HTTP 4xx is not retried", async () => {
  let calls = 0;
  const client = createTransportClient({
    source: strictSource,
    policy: policy({ retry: { count: 3 } }),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async () => {
      calls += 1;
      return response(404);
    },
  });
  await assert.rejects(() => client.request(strictSource.listUrl));
  assert.equal(calls, 1);
});

await test("exponential retry delay and jitter evidence are bounded", async () => {
  let calls = 0;
  const client = createTransportClient({
    source: strictSource,
    policy: policy({
      retry: {
        count: 1,
        baseDelayMs: 1,
        maximumDelayMs: 1,
        jitterRatio: 0.5,
      },
    }),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("reset");
        error.code = "ECONNRESET";
        throw error;
      }
      return response();
    },
    clock: { random: () => 0.5 },
  });
  await client.request(strictSource.listUrl);
  const attempt = client.evidence().request_attempt_history[0];
  assert.equal(attempt.retry_delay_source, "exponential_backoff");
  assert.equal(attempt.retry_delay_ms, 1);
});

await test("response byte limit fails closed", async () => {
  const client = createTransportClient({
    source: strictSource,
    policy: policy({ maximumResponseBytes: 4 }),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async () => response(200, "123456", { "content-length": "6" }),
  });
  await assert.rejects(
    () => client.request(strictSource.listUrl),
    (error) => error.code === "bounded_limit_exceeded",
  );
});

await test("external cancellation stops without retry", async () => {
  const controller = new AbortController();
  let calls = 0;
  const client = createTransportClient({
    source: strictSource,
    policy: policy({ retry: { count: 3 } }),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async (_url, { signal }) => {
      calls += 1;
      controller.abort(new Error("cancelled"));
      throw signal.reason;
    },
  });
  await assert.rejects(() => client.request(strictSource.listUrl, {
    signal: controller.signal,
  }));
  assert.equal(calls, 1);
});

await test("cross-host redirect can be blocked", async () => {
  let calls = 0;
  const client = createTransportClient({
    source: strictSource,
    policy: policy({ redirect: { allowCrossHost: false } }),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async () => {
      calls += 1;
      return response(302, "", { location: "https://other.example/final" });
    },
  });
  await assert.rejects(
    () => client.request(strictSource.listUrl),
    (error) => error.code === "transport_cross_host_redirect_forbidden",
  );
  assert.equal(calls, 1);
});

await test("HTTPS to HTTP redirect downgrade is blocked", async () => {
  const client = createTransportClient({
    source: strictSource,
    policy: policy({
      protocolMode: "preserve",
      allowedHttpHosts: ["fixture.example"],
      redirect: { allowHttpsToHttpDowngrade: false },
    }),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async () =>
      response(302, "", { location: "http://fixture.example/final" }),
  });
  await assert.rejects(
    () => client.request(strictSource.listUrl),
    (error) => error.code === "transport_https_downgrade_forbidden",
  );
});

await test("redirect hop limit fails closed", async () => {
  let calls = 0;
  const client = createTransportClient({
    source: strictSource,
    policy: policy({ redirect: { maximumHops: 1 } }),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async (url) => {
      calls += 1;
      return response(302, "", {
        location: new URL(url).pathname === "/list"
          ? "/second"
          : "/third",
      });
    },
  });
  await assert.rejects(
    () => client.request(strictSource.listUrl),
    (error) => error.code === "transport_redirect_limit",
  );
  assert.equal(calls, 2);
});

await test("redirect target gets a new dispatcher and bounded evidence", async () => {
  const dispatcherPool = new FakeDispatcherPool();
  const observedHeaders = [];
  const insecurePolicy = policy({
    tlsMode: "insecure-exact-host",
    allowedHosts: ["fixture.example"],
  });
  const client = createTransportClient({
    source: strictSource,
    policy: insecurePolicy,
    dispatcherPool,
    fetchImpl: async (url, options) => {
      observedHeaders.push(options.headers);
      return new URL(url).hostname === "fixture.example"
        ? response(302, "", { location: "https://other.example/final?token=secret" })
        : response();
    },
  });
  const result = await client.request(strictSource.listUrl, {
    headers: {
      authorization: "Bearer must-not-leak",
      cookie: "session=must-not-leak",
    },
  });
  const evidence = client.evidence();
  assert.equal(result.finalUrl, "https://other.example/final?token=secret");
  assert.deepEqual(
    dispatcherPool.calls.map((call) => call.insecureTlsApplied),
    [true, false],
  );
  assert.equal(evidence.redirect_hop_count, 1);
  assert.equal(observedHeaders[0].authorization, "Bearer must-not-leak");
  assert.equal(observedHeaders[1].authorization, undefined);
  assert.equal(observedHeaders[1].cookie, undefined);
  assert.match(evidence.redirect_chain[0].to, /%5BREDACTED%5D/);
  assert.match(evidence.final_url, /%5BREDACTED%5D/);
  assert.doesNotMatch(JSON.stringify(evidence), /must-not-leak/);
});

await test("central CAU adapter uses injected TransportClient with exact request count", async () => {
  const source = {
    sourceId: "cau_fixture",
    sourceName: "CAU fixture",
    universitySlug: "cau",
    listUrl: "https://www.cau.ac.kr/cms/FR_CON/index.do?MENU_ID=100",
    baseUrl: "https://www.cau.ac.kr/",
    adapterConfig: cauPortalAdapterConfig(),
  };
  let calls = 0;
  const requestUrls = [];
  const client = createTransportClient({
    source,
    policy: policy(),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async (url, options) => {
      calls += 1;
      requestUrls.push(new URL(url).toString());
      if (options.method === "GET") {
        return response(200, [
          '<form id="sendForm">',
          '<input name="MENU_ID" value="100">',
          '<input name="SITE_NO" value="2">',
          '<input name="BOARD_SEQ" value="3">',
          '<input name="pagePerCnt" value="15">',
          "</form>",
        ].join(""), { "content-type": "text/html; charset=utf-8" });
      }
      return response(200, JSON.stringify({
        data: {
          list: [{
            BBS_SEQ: "99",
            SUBJECT: "장학 공지",
            WRITE_DATE: "2026-07-24",
            NOTICE_YN: "N",
          }],
        },
      }), { "content-type": "application/json" });
    },
  });
  const items = await fetchCauPortalList(source, {
    transportClient: client,
    maxPages: 1,
    maxItems: 10,
    lookbackDays: 31,
    now: fixedNow,
  });
  assert.equal(items.length, 1);
  assert.equal(calls, 2);
  assert.deepEqual(requestUrls, [
    source.listUrl,
    source.adapterConfig.requestUrlTemplate,
  ]);
  assert.equal(
    items[0].noticeUrl,
    "https://www.cau.ac.kr/cms/FR_CON/BoardView.do?MENU_ID=100&SITE_NO=2&BOARD_SEQ=3&BBS_SEQ=99",
  );
  assert.equal(client.evidence().request_attempt_count, 2);
});

await test("CAU adapter accepts the CMS JSON response despite its text/html header", async () => {
  const source = structuredClone(
    manifestSources.find((item) => item.sourceId === "cau_univ_001"),
  );
  const accepted = [];
  const client = createTransportClient({
    source,
    policy: policy(),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async (_url, options) => {
      accepted.push(options.headers.accept);
      if (options.method === "GET") {
        return response(200, '<form id="sendForm"><input name="MENU_ID" value="100"><input name="SITE_NO" value="2"><input name="BOARD_SEQ" value="3"></form>', { "content-type": "text/html" });
      }
      return response(200, JSON.stringify({ data: { list: [] } }), { "content-type": "text/html; charset=utf-8" });
    },
  });
  await fetchCauPortalList(source, { transportClient: client, maxPages: 1 });
  assert.equal(accepted.at(-1), "*/*");
  assert.deepEqual(source.adapterConfig, {
    ...cauPortalAdapterConfig(),
  });
});

await test("CAU adapter strict policy rejects a JSON body labeled as HTML", async () => {
  const source = {
    sourceId: "cau_fixture_strict_content_type",
    sourceName: "CAU strict fixture",
    universitySlug: "cau",
    listUrl: "https://www.cau.ac.kr/cms/FR_CON/index.do?MENU_ID=100",
    adapterConfig: cauPortalAdapterConfig({
      apiAccept: "application/json",
      jsonContentTypePolicy: "strict",
    }),
  };
  const client = createTransportClient({
    source,
    policy: policy(),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async (_url, options) => (
      options.method === "GET"
        ? response(200, '<form id="sendForm"><input name="MENU_ID" value="100"></form>', { "content-type": "text/html" })
        : response(200, '{"data":{"list":[]}}', { "content-type": "text/html" })
    ),
  });
  await assert.rejects(
    () => fetchCauPortalList(source, { transportClient: client, maxPages: 1 }),
    (error) => error.code === "unexpected_content_type",
  );
});

await test("CAU adapter requiredListPath fails closed on a changed JSON shape", async () => {
  const source = {
    sourceId: "cau_fixture_shape",
    sourceName: "CAU shape fixture",
    universitySlug: "cau",
    listUrl: "https://www.cau.ac.kr/cms/FR_CON/index.do?MENU_ID=100",
    adapterConfig: cauPortalAdapterConfig(),
  };
  const client = createTransportClient({
    source,
    policy: policy(),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async (_url, options) => (
      options.method === "GET"
        ? response(200, '<form id="sendForm"><input name="MENU_ID" value="100"></form>', { "content-type": "text/html" })
        : response(200, '{"data":{"items":[]}}', { "content-type": "text/html" })
    ),
  });
  await assert.rejects(
    () => fetchCauPortalList(source, { transportClient: client, maxPages: 1 }),
    (error) => error.code === "json_shape_mismatch",
  );
});

await test("declarative JSON API adapter applies manifest URL and field mapping", async () => {
  const source = structuredClone(
    manifestSources.find((item) => item.sourceId === "korea_033"),
  );
  const fixture = fs.readFileSync(
    path.join(
      repositoryRoot,
      "fixtures",
      "crawler",
      "runtime-remediation",
      "korea-033-board.json",
    ),
    "utf8",
  );
  const requests = [];
  const client = createTransportClient({
    source,
    policy: policy(),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async (url, options) => {
      requests.push({
        url: new URL(url).toString(),
        accept: options.headers.accept,
        referer: options.headers.referer,
      });
      return response(200, fixture, { "content-type": "application/json" });
    },
  });
  const items = await fetchJsonApiBoardList(source, {
    transportClient: client,
    maxPages: 1,
    maxItems: 10,
    lookbackDays: 31,
    now: fixedNow,
  });
  assert.deepEqual(items.map((item) => item.noticeUrl), [
    "https://ie.korea.ac.kr/board/scholarship/undergrad/408?pageNo=1",
    "https://ie.korea.ac.kr/board/scholarship/undergrad/407?pageNo=1",
  ]);
  assert.deepEqual(items.map((item) => item.content), [
    "Detailed scholarship body one.",
    "Detailed scholarship body two.",
  ]);
  assert.deepEqual(requests, [{
    url: "https://api.ie.korea.ac.kr/v1/board?type=scholarship-undergraduate&page=1",
    accept: "application/json",
    referer: source.listUrl,
  }]);
  assert.equal(client.evidence().request_attempt_count, 1);
});

function jsonApiBoardPayload(totalPages, boardList = []) {
  return JSON.stringify({
    paging: { totalPages },
    boardList,
  });
}

function jsonApiBoardItem(id = 1) {
  return {
    id,
    title: `Scholarship ${id}`,
    content: `<p>Detail ${id}</p>`,
    createdAt: "2026-07-23 00:00:00",
    isNoticed: false,
  };
}

async function runJsonApiPaginationSource(responses, { maxPages = 3 } = {}) {
  const source = structuredClone(manifestSources.find((item) => item.sourceId === "korea_033"));
  let responseIndex = 0;
  const client = createTransportClient({
    source,
    policy: policy({ retry: { count: 3 } }),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async () => response(
      200,
      responses[Math.min(responseIndex++, responses.length - 1)],
      { "content-type": "application/json" },
    ),
  });
  const adapterExecution = createListAdapterExecution({
    source,
    transportClient: client,
    listAdapter: fetchJsonApiBoardList,
    adapterOptions: { maxPages, maxItems: 50, now: fixedNow, lookbackDays: 31 },
  });
  const result = await runBoundedCrawlerSource({
    source,
    inventoryRows: [{ source_id: source.sourceId }],
    strategy: adapterExecution.strategy,
    fetchHtml: adapterExecution.fetchHtml,
    listUrls: [source.listUrl],
    fetchDetails: false,
    retryCount: 3,
    retryBackoffMs: 0,
    maximumRetryDelayMs: 0,
    timeoutMs: 1000,
  });
  return { adapterExecution, client, result };
}

for (const [label, totalPages] of [
  ["missing", undefined],
  ["null", null],
  ["numeric string", "3"],
  ["true", true],
  ["false", false],
  ["string", "abc"],
  ["fraction", 1.5],
  ["zero", 0],
  ["negative", -1],
  ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
]) {
  await test(`JSON API pagination ${label} totalPages fails closed without Source retry`, async () => {
    const { client, result } = await runJsonApiPaginationSource([
      jsonApiBoardPayload(totalPages, []),
    ]);
    assert.equal(result.result_status, "parser_error");
    assert.equal(result.error_code, "json_shape_mismatch");
    assert.equal(result.total_attempt_count, 1);
    assert.equal(result.retried, false);
    assert.equal(client.evidence().request_attempt_count, 1);
  });
}

await test("JSON API pagination smaller than the requested page fails closed", async () => {
  const { client, result } = await runJsonApiPaginationSource([
    jsonApiBoardPayload(2, [jsonApiBoardItem(1)]),
    jsonApiBoardPayload(1, [jsonApiBoardItem(2)]),
  ]);
  assert.equal(result.result_status, "parser_error");
  assert.equal(result.error_code, "json_shape_mismatch");
  assert.equal(result.total_attempt_count, 1);
  assert.equal(result.retried, false);
  assert.equal(client.evidence().request_attempt_count, 2);
});

await test("JSON API pagination records a bounded maxPages termination", async () => {
  const { adapterExecution, client, result } = await runJsonApiPaginationSource([
    jsonApiBoardPayload(5, [jsonApiBoardItem(1)]),
    jsonApiBoardPayload(5, [jsonApiBoardItem(2)]),
    jsonApiBoardPayload(5, [jsonApiBoardItem(3)]),
  ], { maxPages: 3 });
  assert.notEqual(result.result_status, "parser_error");
  assert.equal(client.evidence().request_attempt_count, 3);
  assert.deepEqual(adapterExecution.getAdapterEvidence(), {
    api_item_count: 3,
    api_item_missing_content_count: 0,
    api_item_with_content_count: 3,
    pagination_bounded_by_max_pages: true,
    pagination_pages_requested: 3,
    pagination_total_pages: 5,
  });
});

await test("invalid JSON response is non-retryable", async () => {
  const client = createTransportClient({
    source: { sourceId: "json_fixture", listUrl: "https://example.edu/list" },
    policy: policy({ retry: { count: 2 } }),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async () => response(200, "<html>not json</html>", { "content-type": "text/html" }),
  });
  await assert.rejects(
    () => client.fetchJson("https://example.edu/list"),
    (error) => error.code === "json_decode_error",
  );
  assert.equal(client.evidence().request_attempt_count, 1);
});

await test("strict JSON content type rejects HTML without retrying", async () => {
  const client = createTransportClient({
    source: { sourceId: "strict_json_fixture", listUrl: "https://example.edu/list" },
    policy: policy({ retry: { count: 2 } }),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async () => response(200, '{"items":[]}', { "content-type": "text/html" }),
  });
  await assert.rejects(
    () => client.fetchJson("https://example.edu/list", {
      contentTypePolicy: "strict",
      expectedContentTypes: ["application/json"],
    }),
    (error) => error.code === "unexpected_content_type",
  );
  assert.equal(client.evidence().request_attempt_count, 1);
});

await test("body-json policy accepts a JSON body labeled as HTML", async () => {
  const client = createTransportClient({
    source: { sourceId: "body_json_fixture", listUrl: "https://example.edu/list" },
    policy: policy(),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async () => response(200, '{"items":[]}', { "content-type": "text/html" }),
  });
  const result = await client.fetchJson("https://example.edu/list", {
    contentTypePolicy: "body-json",
  });
  assert.deepEqual(result.json, { items: [] });
});

async function runContentContractSource({
  code,
  body = "{}",
  contentType = "application/json",
  contentTypePolicy = "body-json",
  validateJson = () => {},
}) {
  const source = {
    sourceId: `fixture_${code}`,
    sourceName: `Fixture ${code}`,
    universitySlug: "fixture",
    listUrl: "https://example.edu/list",
  };
  const client = createTransportClient({
    source,
    policy: policy({ retry: { count: 3 } }),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async () => response(200, body, { "content-type": contentType }),
  });
  const adapterExecution = createListAdapterExecution({
    source,
    transportClient: client,
    listAdapter: async (_source, { transportClient }) => {
      const responseValue = await transportClient.fetchJson(source.listUrl, {
        retryCount: 0,
        contentTypePolicy,
      });
      validateJson(responseValue.json);
      return [];
    },
  });
  const result = await runBoundedCrawlerSource({
    source,
    inventoryRows: [{ source_id: source.sourceId }],
    strategy: adapterExecution.strategy,
    fetchHtml: adapterExecution.fetchHtml,
    listUrls: [source.listUrl],
    fetchDetails: false,
    retryCount: 3,
    retryBackoffMs: 0,
    maximumRetryDelayMs: 0,
    timeoutMs: 1000,
  });
  return { client, result };
}

await test("JSON decode errors do not retry the whole Source", async () => {
  const { client, result } = await runContentContractSource({
    code: "json_decode_error",
    body: "<html>not json</html>",
    contentType: "text/html",
  });
  assert.equal(result.result_status, "parser_error");
  assert.equal(result.error_code, "json_decode_error");
  assert.equal(result.total_attempt_count, 1);
  assert.equal(result.retried, false);
  assert.equal(result.retry_exhausted, false);
  assert.equal(client.evidence().request_attempt_count, 1);
});

await test("JSON shape errors do not retry the whole Source", async () => {
  const { client, result } = await runContentContractSource({
    code: "json_shape_mismatch",
    body: '{"data":{}}',
    validateJson: (json) => {
      if (!Array.isArray(json?.data?.list)) {
        const error = new Error("Missing data.list.");
        error.code = "json_shape_mismatch";
        throw error;
      }
    },
  });
  assert.equal(result.result_status, "parser_error");
  assert.equal(result.error_code, "json_shape_mismatch");
  assert.equal(result.total_attempt_count, 1);
  assert.equal(result.retried, false);
  assert.equal(result.retry_exhausted, false);
  assert.equal(client.evidence().request_attempt_count, 1);
});

await test("unexpected content types do not retry the whole Source", async () => {
  const { client, result } = await runContentContractSource({
    code: "unexpected_content_type",
    body: '{"data":{"list":[]}}',
    contentType: "text/html",
    contentTypePolicy: "strict",
  });
  assert.equal(result.result_status, "parser_error");
  assert.equal(result.error_code, "unexpected_content_type");
  assert.equal(result.total_attempt_count, 1);
  assert.equal(result.retried, false);
  assert.equal(result.retry_exhausted, false);
  assert.equal(client.evidence().request_attempt_count, 1);
});

await test("transient network errors still retry the whole Source", async () => {
  const source = {
    sourceId: "fixture_network_retry",
    sourceName: "Fixture network retry",
    universitySlug: "fixture",
    listUrl: "https://example.edu/list",
  };
  let requestCount = 0;
  const client = createTransportClient({
    source,
    policy: policy({ retry: { count: 0 } }),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async () => {
      requestCount += 1;
      if (requestCount === 1) {
        const error = new Error("reset");
        error.code = "ECONNRESET";
        throw error;
      }
      return response(200, '{"items":[]}', { "content-type": "application/json" });
    },
  });
  const adapterExecution = createListAdapterExecution({
    source,
    transportClient: client,
    listAdapter: async (_source, { transportClient }) => {
      await transportClient.fetchJson(source.listUrl, { retryCount: 0 });
      return [{
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        listUrl: source.listUrl,
        noticeUrl: "https://example.edu/detail/1",
        title: "Fixture notice",
        dateText: "2026-07-24",
      }];
    },
  });
  const result = await runBoundedCrawlerSource({
    source,
    inventoryRows: [{ source_id: source.sourceId }],
    strategy: adapterExecution.strategy,
    fetchHtml: adapterExecution.fetchHtml,
    listUrls: [source.listUrl],
    fetchDetails: false,
    retryCount: 3,
    retryBackoffMs: 0,
    maximumRetryDelayMs: 0,
    timeoutMs: 1000,
  });
  assert.equal(result.total_attempt_count, 2);
  assert.equal(result.retried, true);
  assert.equal(result.recovered_after_retry, true);
  assert.equal(result.retry_exhausted, false);
  assert.equal(client.evidence().request_attempt_count, 2);
});

await test("CAU adapter has no hidden retry", async () => {
  const source = {
    sourceId: "cau_fixture",
    sourceName: "CAU fixture",
    universitySlug: "cau",
    listUrl: "https://www.cau.ac.kr/cms/FR_CON/index.do",
    adapterConfig: cauPortalAdapterConfig(),
  };
  let calls = 0;
  const client = createTransportClient({
    source,
    policy: policy({ retry: { count: 3 } }),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async () => {
      calls += 1;
      return response(503);
    },
  });
  await assert.rejects(() => fetchCauPortalList(source, {
    transportClient: client,
  }));
  assert.equal(calls, 1);
});

await test("adapter source attempts and physical request attempts remain distinct", async () => {
  const source = {
    sourceId: "cau_adapter_retry_fixture",
    sourceName: "CAU retry fixture",
    universitySlug: "cau",
    listUrl: "https://www.cau.ac.kr/cms/FR_CON/index.do",
    baseUrl: "https://www.cau.ac.kr/",
    adapterConfig: cauPortalAdapterConfig(),
  };
  let calls = 0;
  const client = createTransportClient({
    source,
    policy: policy({ retry: { count: 1 } }),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async (_url, options) => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("reset");
        error.code = "ECONNRESET";
        throw error;
      }
      if (options.method === "GET") {
        return response(200, [
          '<form id="sendForm">',
          '<input name="MENU_ID" value="100">',
          '<input name="SITE_NO" value="2">',
          '<input name="BOARD_SEQ" value="3">',
          '<input name="pagePerCnt" value="15">',
          "</form>",
        ].join(""), { "content-type": "text/html; charset=utf-8" });
      }
      return response(200, JSON.stringify({
        data: {
          list: [{
            BBS_SEQ: "100",
            SUBJECT: "장학 공지",
            WRITE_DATE: "2026-07-24",
            NOTICE_YN: "N",
          }],
        },
      }), { "content-type": "application/json" });
    },
  });
  const adapterExecution = createListAdapterExecution({
    source,
    listAdapter: fetchCauPortalList,
    transportClient: client,
    adapterOptions: {
      maxPages: 1,
      maxItems: 10,
      lookbackDays: 31,
      now: fixedNow,
    },
  });
  const result = await runBoundedCrawlerSource({
    source,
    inventoryRows: [{ source_id: source.sourceId }],
    strategy: adapterExecution.strategy,
    fetchHtml: adapterExecution.fetchHtml,
    listUrls: [source.listUrl],
    fetchDetails: false,
    retryCount: 1,
    retryBackoffMs: 0,
    maximumRetryDelayMs: 0,
    timeoutMs: 1000,
    candidateDetector: detectScholarshipCandidate,
    detailFetchPlanner: buildDetailFetchPlan,
    candidateDetectionOptions: {
      keywords: ["장학"],
      lookbackDays: 31,
      allowUndated: false,
      now: fixedNow,
    },
  });
  assert.equal(result.total_attempt_count, 2);
  assert.equal(result.recovered_after_retry, true);
  assert.equal(calls, 3);
  assert.equal(client.evidence().request_attempt_count, 3);
  assert.equal(client.evidence().request_retry_count, 0);
});

await test("non-candidate diagnostic detail probe uses the same TransportClient", async () => {
  const source = {
    sourceId: "fixture_probe",
    sourceName: "Probe fixture",
    universitySlug: "fixture",
    listUrl: "https://fixture.example/list",
  };
  const dispatcherPool = new FakeDispatcherPool();
  const client = createTransportClient({
    source,
    policy: policy(),
    dispatcherPool,
    fetchImpl: async (url) => response(
      200,
      new URL(url).pathname === "/list" ? "list" : "detail",
      { "content-type": "text/html; charset=utf-8" },
    ),
  });
  const strategy = {
    name: "fixture",
    parseList: () => [{
      sourceId: source.sourceId,
      sourceName: source.sourceName,
      listUrl: source.listUrl,
      noticeUrl: "https://fixture.example/detail",
      title: "일반 행사 안내",
      dateText: "2026-07-24",
    }],
    parseDetail: () => ({ content: "일반 행사 상세 내용입니다. 충분한 본문입니다." }),
  };
  const result = await runBoundedCrawlerSource({
    source,
    inventoryRows: [{ source_id: source.sourceId }],
    strategy,
    fetchHtml: async (url, request) => (
      await client.fetchHtml(url, { ...request, retryCount: 0 })
    ).html,
    retryCount: 0,
    timeoutMs: 1000,
    fetchDetails: true,
    candidateDetector: detectScholarshipCandidate,
    detailFetchPlanner: buildDetailFetchPlan,
    candidateDetectionOptions: {
      keywords: ["장학"],
      lookbackDays: 31,
      allowUndated: false,
      now: fixedNow,
    },
  });
  assert.equal(result.diagnostic_detail_probe.status, "success");
  assert.equal(client.evidence().request_attempt_count, 2);
});

await test("HTTP source URL is not upgraded and strict HTTPS remains HTTPS", async () => {
  const requested = [];
  const httpSource = {
    sourceId: "fixture_http",
    sourceName: "HTTP fixture",
    universitySlug: "fixture",
    listUrl: "http://fixture.example/list",
  };
  const fetchImpl = async (url) => {
    requested.push(new URL(url).toString());
    return response();
  };
  await createTransportClient({
    source: httpSource,
    policy: policy({ protocolMode: "preserve-http", allowedHttpHosts: ["fixture.example"] }),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl,
  }).request(httpSource.listUrl);
  await createTransportClient({
    source: strictSource,
    policy: policy(),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl,
  }).request(strictSource.listUrl);
  assert.equal(requested[0].startsWith("http://"), true);
  assert.equal(requested[1].startsWith("https://"), true);
});

await test("worker receives resolved policy and never loads registry", () => {
  const workerSource = fs.readFileSync(
    path.join(repositoryRoot, "lib", "crawler-engine", "source-execution-worker.mjs"),
    "utf8",
  );
  const mainSource = fs.readFileSync(
    path.join(repositoryRoot, "scripts", "crawl-scholarship-notices.mjs"),
    "utf8",
  );
  assert.match(workerSource, /transportPolicy/);
  assert.doesNotMatch(workerSource, /loadTransportPolicyRegistry/);
  assert.match(mainSource, /workerData:[\s\S]*transportPolicy/);
});

await test("isolated worker executes list and detail with the pre-resolved policy", async () => {
  const server = http.createServer((request, result) => {
    if (request.url.startsWith("/list")) {
      result.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      result.end([
        "<ul><li>",
        '<a href="/detail?articleNo=1">장학금 안내</a>',
        "<span>2026-07-24</span>",
        "</li></ul>",
      ].join(""));
      return;
    }
    result.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    result.end("<h2>장학금 안내</h2><main>장학금 상세 본문 내용입니다.</main>");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const source = {
    sourceId: "fixture_worker",
    sourceName: "Worker fixture",
    universitySlug: "fixture",
    listUrl: `http://127.0.0.1:${address.port}/list`,
    baseUrl: `http://127.0.0.1:${address.port}/`,
    listItemSelector: "li",
    linkSelector: "a",
    titleSelector: "a",
    dateSelector: "span",
    detailContentSelector: "main",
    detailDateSelector: "",
    noticeUrlPattern: "articleNo=",
    keywords: ["장학"],
    adapter: "",
  };
  const transportPolicy = policy({
    protocolMode: "preserve-http",
    allowedHttpHosts: ["127.0.0.1"],
    timeoutMs: 2000,
  });
  const worker = new Worker(
    new URL("../lib/crawler-engine/source-execution-worker.mjs", import.meta.url),
    {
      workerData: {
        workerId: "fixture-worker",
        source,
        transportPolicy,
        inventoryRows: [{ source_id: source.sourceId }],
        completedWorkItemKeys: [],
        config: {
          lookbackDays: 31,
          allowUndated: false,
          maxItems: 10,
          maxPages: 1,
          fetchDetails: true,
          detailConcurrency: 1,
          documentParsingEnabled: false,
          documentCacheDirectory: path.join(os.tmpdir(), "unused-worker-cache"),
          documentMaxBytes: 100000,
          documentMaxPages: 2,
          documentMaxOcrPages: 0,
          documentOcrTimeoutMs: 1000,
          fallbackCharset: "utf-8",
          sourceMinimumIntervalMs: 0,
          hostMinimumIntervalMs: 0,
          hostConcurrency: 1,
          telemetryEnabled: false,
          runAt: fixedNow.toISOString(),
          seenNoticeUrls: [],
        },
      },
    },
  );
  try {
    const message = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("isolated worker fixture timed out")),
        5000,
      );
      worker.on("message", (event) => {
        if (event?.type === "result" || event?.type === "error") {
          clearTimeout(timeout);
          resolve(event);
        }
      });
      worker.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    assert.equal(message.type, "result");
    assert.equal(message.execution_result.result_status, "success");
    assert.equal(message.execution_result.notices.length, 1);
    assert.equal(
      message.execution_result.transport_evidence.transport_policy_fingerprint,
      transportPolicy.policyFingerprint,
    );
    assert.equal(
      message.execution_result.transport_evidence.request_attempt_count,
      2,
    );
  } finally {
    await worker.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
});

await test("isolation on and off clients expose the same resolved policy", () => {
  const first = createTransportClient({
    source: strictSource,
    policy: strictPolicy,
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async () => response(),
  });
  const second = createTransportClient({
    source: clone(strictSource),
    policy: clone(strictPolicy),
    dispatcherPool: new FakeDispatcherPool(),
    fetchImpl: async () => response(),
  });
  assert.deepEqual(
    buildResolvedTransportPolicyEvidence(first.policy),
    buildResolvedTransportPolicyEvidence(second.policy),
  );
});

await test("checkpoint stores policy fingerprints and rejects changed policy on resume", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "crawler-transport-checkpoint-"));
  const checkpointPath = path.join(directory, "checkpoint.json");
  const firstFingerprint = "a".repeat(64);
  const secondFingerprint = "b".repeat(64);
  const registryFingerprint = "c".repeat(64);
  const configuration = {
    runner_contract_version: "fixture",
    transport_policy_schema_version: "crawler-transport-policy-v1",
    transport_policy_registry_version: "fixture",
    transport_policy_registry_fingerprint: registryFingerprint,
    resolved_transport_policy_fingerprints: { fixture_strict: firstFingerprint },
    runtime_transport_overrides: {},
  };
  try {
    const session = await createCrawlerCheckpointSession({
      checkpointPath,
      sourceKeys: ["fixture_strict"],
      configuration,
      runIdentity: "transport-fixture",
    });
    const snapshot = session.snapshot();
    assert.equal(snapshot.transport_policy_registry_fingerprint, registryFingerprint);
    assert.equal(
      snapshot.resolved_transport_policy_fingerprints.fixture_strict,
      firstFingerprint,
    );
    await session.markCompleted();
    await assert.rejects(
      () => createCrawlerCheckpointSession({
        checkpointPath,
        resume: true,
        sourceKeys: ["fixture_strict"],
        configuration: {
          ...configuration,
          resolved_transport_policy_fingerprints: {
            fixture_strict: secondFingerprint,
          },
        },
        runIdentity: "transport-fixture",
      }),
      (error) => error.code === "checkpoint_configuration_mismatch",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

await test("crawler report preserves additive transport registry evidence", () => {
  const transportPolicyRegistry = {
    schema_version: loadedRegistry.schemaVersion,
    registry_version: loadedRegistry.registryVersion,
    registry_fingerprint: loadedRegistry.registryFingerprint,
  };
  const report = buildCrawlerReport({
    runAt: fixedNow.toISOString(),
    transportPolicyRegistry,
  });
  assert.deepEqual(report.transportPolicyRegistry, transportPolicyRegistry);
});

await test("transport URL evidence redacts secrets even for malformed URLs", () => {
  const sanitized = sanitizeTransportUrl(
    "not a url?api_key=must-not-leak&authorization=Bearer-secret",
  );
  assert.doesNotMatch(sanitized, /must-not-leak|Bearer-secret/);
  assert.match(sanitized, /\[REDACTED\]/);
});

await test("production scholarship crawler paths contain no direct raw fetch", () => {
  const files = [
    "scripts/crawl-scholarship-notices.mjs",
    "lib/crawler-adapters/index.mjs",
    "lib/crawler-engine/source-execution-worker.mjs",
    "lib/crawler-engine/document-parsing/transport-runtime.mjs",
  ];
  for (const file of files) {
    const contents = fs.readFileSync(path.join(repositoryRoot, file), "utf8");
    assert.doesNotMatch(contents, /\bfetch\s*\(/, file);
    assert.doesNotMatch(contents, /fetchWithRetry/, file);
  }
});

await test("GitHub Actions no longer owns university transport policy", () => {
  const workflows = [
    ".github/workflows/crawl-scholarship-notices.yml",
    ".github/workflows/crawl-scholarship-notices-baseline.yml",
    ".github/workflows/crawl-hanyang-smoke.yml",
  ].map((file) => fs.readFileSync(path.join(repositoryRoot, file), "utf8")).join("\n");
  assert.doesNotMatch(
    workflows,
    /CRAWL_(?:TIMEOUT_MS|RETRY_COUNT|RETRY_BACKOFF_MS|RETRY_MAX_DELAY_MS|RETRY_JITTER_RATIO|FORCE_IPV4|ALLOW_INSECURE_TLS_HOSTS|USER_AGENT)/,
  );
});

console.log(`crawler_transport_tests_passed=${passed}`);
