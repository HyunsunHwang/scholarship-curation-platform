import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TransportDispatcherPool,
  createTransportClient,
  fingerprintTransportPolicy,
  loadTransportPolicyRegistry,
  resolveEffectiveTransportPolicy,
  resolveSystemCaCertificates,
  resolveTransportPoliciesForSources,
  validateTransportPolicyRegistry,
} from "../lib/crawler-engine/transport/index.mjs";
import { loadSources } from "../lib/notice-sources-loader.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policyRoot = path.join(repositoryRoot, "config", "crawler-transport");
const rawRegistry = JSON.parse(fs.readFileSync(path.join(policyRoot, "transport-policies.json"), "utf8"));
const sources = (await loadSources("manifest")).sources;
const now = new Date("2026-07-24T00:00:00.000Z");
let passed = 0;

function clone(value) { return structuredClone(value); }
async function test(name, operation) {
  await operation();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}
function validate(registry) {
  return validateTransportPolicyRegistry({ registry, sources, now, rootDirectory: policyRoot });
}
function response(status = 200, body = "ok", headers = {}) {
  return new Response(body, { status, headers });
}

const registry = loadTransportPolicyRegistry({ sources, now, rootDirectory: policyRoot });
const cau002 = sources.find((source) => source.sourceId === "cau_002");
const hanyang009 = sources.find((source) => source.sourceId === "hanyang_009");
const cauPolicy = resolveEffectiveTransportPolicy({ source: cau002, registry, now });
const hanyangPolicy = resolveEffectiveTransportPolicy({ source: hanyang009, registry, now });

await test("all sources resolve and only hanyang_009 is insecure exact-host", () => {
  const policies = resolveTransportPoliciesForSources({ sources, registry, now });
  const insecure = [...policies.entries()]
    .filter(([, policy]) => policy.tlsMode === "insecure-exact-host")
    .map(([sourceId]) => sourceId);
  assert.deepEqual(insecure, ["hanyang_009"]);
  assert.equal(cauPolicy.tlsMode, "system-ca");
  assert.deepEqual(cauPolicy.allowedHosts, ["econ.cau.ac.kr"]);
  assert.equal(cauPolicy.expiresAt, null);
});

await test("system-ca bindings require exact host and reason", () => {
  const noHost = clone(rawRegistry);
  delete noHost.bindings.find((binding) => binding.bindingId === "cau-002-system-ca").allowedHosts;
  assert.match(validate(noHost).errors.join(" | "), /system-ca requires allowedHosts/i);
  const noReason = clone(rawRegistry);
  delete noReason.bindings.find((binding) => binding.bindingId === "cau-002-system-ca").reason;
  assert.match(validate(noReason).errors.join(" | "), /system-ca requires reason/i);
  const mismatched = clone(rawRegistry);
  mismatched.bindings.find((binding) => binding.bindingId === "cau-002-system-ca")
    .allowedHosts = ["other.example"];
  assert.match(validate(mismatched).errors.join(" | "), /not in allowedHosts/i);
});

await test("hostname fields reject uppercase, wildcards, URL forms, ports, and spaces", () => {
  for (const value of ["EXAMPLE.com", "*.example.com", ".example.com", "https://example.com", "example.com:443", "example .com"]) {
    const invalid = clone(rawRegistry);
    invalid.bindings.find((binding) => binding.bindingId === "cau-002-system-ca")
      .allowedHosts = [value];
    assert.equal(validate(invalid).valid, false, value);
  }
});

await test("system CA certificates require a supported non-empty system store and are deterministic", () => {
  assert.throws(() => resolveSystemCaCertificates(null), (error) => error.code === "transport_system_ca_unsupported");
  assert.throws(() => resolveSystemCaCertificates(() => []), (error) => error.code === "transport_system_ca_empty");
  const certificates = resolveSystemCaCertificates((type) => type === "default"
    ? ["default-a", "shared"] : ["system-b", "shared"]);
  assert.deepEqual(certificates, ["default-a", "shared", "system-b"]);
  assert.throws(() => certificates.push("mutate"), TypeError);
});

await test("system-ca and insecure agents are exact-host scoped", async () => {
  const created = [];
  const pool = new TransportDispatcherPool({
    systemCaProvider: (type) => type === "default" ? ["default"] : ["system"],
    agentFactory: (options) => {
      created.push(options);
      return { close: async () => {} };
    },
  });
  try {
    const system = pool.dispatcherFor("https://econ.cau.ac.kr/list", cauPolicy);
    const unrelated = pool.dispatcherFor("https://unrelated.example/list", cauPolicy);
    const insecure = pool.dispatcherFor("https://hyurban.hanyang.ac.kr/list", hanyangPolicy);
    const http = pool.dispatcherFor("http://hyurban.hanyang.ac.kr/list", hanyangPolicy);
    assert.equal(system.systemCaApplied, true);
    assert.equal(system.insecureTlsApplied, false);
    assert.deepEqual(created[0].connect.ca, ["default", "system"]);
    assert.notEqual(created[0].connect.rejectUnauthorized, false);
    assert.equal(unrelated.systemCaApplied, false);
    assert.equal(unrelated.insecureTlsApplied, false);
    assert.equal(insecure.insecureTlsApplied, true);
    assert.equal(insecure.systemCaApplied, false);
    assert.equal(created[2].connect.rejectUnauthorized, false);
    assert.equal(http.insecureTlsApplied, false);
    assert.equal(http.systemCaApplied, false);
  } finally {
    await pool.close();
  }
});

await test("preserve-http derives a deterministic exact list hostname allowlist", () => {
  for (const source of sources.filter((item) => new URL(item.listUrl).protocol === "http:")) {
    const resolved = resolveEffectiveTransportPolicy({ source, registry, now });
    assert.equal(resolved.protocolMode, "preserve-http", source.sourceId);
    assert.deepEqual(resolved.allowedHttpHosts, [...resolved.allowedHttpHosts].sort());
    assert.equal(resolved.allowedHttpHosts.includes(new URL(source.listUrl).hostname), true);
  }
  const legacySource = sources.find((source) => source.sourceId === "hanyang_012");
  const legacyPolicy = resolveEffectiveTransportPolicy({ source: legacySource, registry, now });
  const changed = resolveEffectiveTransportPolicy({
    source: { ...legacySource, listUrl: "http://different.example/list" }, registry, now,
  });
  assert.notEqual(legacyPolicy.policyFingerprint, changed.policyFingerprint);
  assert.equal(fingerprintTransportPolicy(legacyPolicy.allowedHttpHosts), fingerprintTransportPolicy(legacyPolicy.allowedHttpHosts));
});

await test("deprecated insecure override cannot re-authorize cau_002", () => {
  assert.throws(() => resolveEffectiveTransportPolicy({
    source: cau002, registry, now,
    runtimeOverrides: { deprecatedInsecureTlsHosts: ["econ.cau.ac.kr"] },
  }), (error) => error.code === "transport_policy_unauthorized_runtime_insecure_tls");
  assert.doesNotThrow(() => resolveEffectiveTransportPolicy({
    source: hanyang009, registry, now,
    runtimeOverrides: { deprecatedInsecureTlsHosts: ["hyurban.hanyang.ac.kr"] },
  }));
});

await test("HTTP is exact-host enforced before fetch for paths, redirects, and probes", async () => {
  const source = { sourceId: "fixture_http", sourceName: "HTTP fixture", universitySlug: "fixture", listUrl: "http://legacy.example/list" };
  const policy = Object.freeze({
    ...hanyangPolicy, policyFingerprint: "f".repeat(64), protocolMode: "preserve-http", tlsMode: "strict",
    allowedHosts: Object.freeze([]), allowedHttpHosts: Object.freeze(["legacy.example"]),
    retry: Object.freeze({ ...hanyangPolicy.retry, count: 0 }),
  });
  let requests = 0;
  const client = createTransportClient({
    source, policy,
    dispatcherPool: { dispatcherFor: () => ({ dispatcher: {}, insecureTlsApplied: false, systemCaApplied: false }) },
    fetchImpl: async (url) => {
      requests += 1;
      return new URL(url).pathname === "/redirect"
        ? response(302, "", { location: "http://other.example/list" }) : response();
    },
  });
  await client.request("http://legacy.example/same-path?x=1");
  await assert.rejects(() => client.request("http://other.example/attachment"), (error) => error.code === "transport_http_host_forbidden");
  await assert.rejects(() => client.request("http://legacy.example/redirect"), (error) => error.code === "transport_http_host_forbidden");
  assert.equal(requests, 2);
  const evidence = client.evidence();
  assert.deepEqual(evidence.allowed_http_hosts, ["legacy.example"]);
  assert.equal(evidence.system_ca_applied, false);
  assert.equal(evidence.insecure_tls_applied, false);
});

console.log(`1..${passed}`);
