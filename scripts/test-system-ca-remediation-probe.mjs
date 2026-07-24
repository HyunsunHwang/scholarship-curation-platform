import assert from "node:assert/strict";
import {
  compareSystemCaRemediationEvidence,
  probeSystemCaRemediation,
} from "../lib/crawler-engine/transport/system-ca-remediation-probe.mjs";

const source = {
  sourceId: "tls_fixture",
  sourceName: "TLS fixture",
  universitySlug: "fixture",
  listUrl: "https://tls.example/list?token=must-not-leak",
};
const calls = [];
let closed = 0;

function resolvePolicy({ source: activeSource, runtimeOverrides }) {
  const tlsMode = runtimeOverrides.policy.tlsMode;
  return {
    policyId: `fixture-${tlsMode}`,
    allowedHosts: tlsMode === "system-ca" ? [new URL(activeSource.listUrl).hostname] : [],
    tlsMode,
    retry: runtimeOverrides.policy.retry,
    timeoutMs: runtimeOverrides.policy.timeoutMs,
  };
}

function createClient({ policy }) {
  return {
    async fetchText(url, options) {
      calls.push({ url, options, tlsMode: policy.tlsMode });
      if (policy.tlsMode === "strict") {
        const error = new Error("untrusted issuer");
        error.code = "UNABLE_TO_VERIFY_LEAF_SIGNATURE";
        error.finalUrl = url;
        throw error;
      }
      return {
        httpStatus: 200,
        contentType: "text/html; charset=utf-8",
        finalUrl: url,
        text: "response body intentionally discarded by probe",
      };
    },
    evidence() {
      return {
        final_url: "https://tls.example/list?token=%5BREDACTED%5D",
        redirect_chain: [],
        insecure_tls_applied: false,
        system_ca_applied: policy.tlsMode === "system-ca",
      };
    },
  };
}

const evidence = await probeSystemCaRemediation({
  sources: [source],
  registry: {},
  sourceIds: [source.sourceId],
  timeoutMs: 25000,
  createClient,
  createDispatcherPool: () => ({ close: async () => { closed += 1; } }),
  resolvePolicy,
  now: () => new Date("2026-07-24T12:00:00.000Z"),
});

assert.equal(calls.length, 2);
assert.deepEqual(calls.map((call) => call.tlsMode), ["strict", "system-ca"]);
for (const call of calls) {
  assert.equal(call.options.retryCount, 0);
  assert.equal(call.options.timeoutMs, 25000);
}
assert.equal(closed, 1);
assert.equal(evidence.probe_policy.response_body_recorded, false);
assert.equal(JSON.stringify(evidence).includes("must-not-leak"), false);
assert.equal(evidence.sources[0].strict.error_code, "UNABLE_TO_VERIFY_LEAF_SIGNATURE");
assert.equal(evidence.sources[0].system_ca.http_status, 200);
assert.equal(evidence.sources[0].system_ca.certificate_verification_preserved, true);
assert.equal(evidence.sources[0].system_ca.system_ca_applied, true);
assert.equal(evidence.sources[0].system_ca.insecure_tls_applied, false);
assert.deepEqual(compareSystemCaRemediationEvidence(evidence, structuredClone(evidence)), []);

await assert.rejects(
  () => probeSystemCaRemediation({
    sources: [source],
    registry: {},
    sourceIds: [source.sourceId],
    createClient,
    createDispatcherPool: () => ({ close: async () => {} }),
    resolvePolicy: ({ runtimeOverrides }) => ({
      tlsMode: runtimeOverrides.policy.tlsMode,
      allowedHosts: [],
      retry: runtimeOverrides.policy.retry,
      timeoutMs: runtimeOverrides.policy.timeoutMs,
    }),
  }),
  (error) => error.code === "transport_probe_host_mismatch",
);

console.log("system_ca_remediation_probe_tests_passed=1");
