import assert from "node:assert/strict";
import { parseRuntimeHardFailureProbeArgs, runRuntimeHardFailureProbe } from "./probe-runtime-hard-failures.mjs";

assert.deepEqual(parseRuntimeHardFailureProbeArgs(["--source-id", "fixture", "--attempts", "2", "--interval-ms", "15000", "--timeout-ms", "25000"]), {
  sourceIds: ["fixture"], attempts: 2, intervalMs: 15000, timeoutMs: 25000, output: null, protocolVariantSourceIds: [],
});
assert.throws(() => parseRuntimeHardFailureProbeArgs(["--source-id", "fixture", "--interval-ms", "1"]), /15000/);
assert.throws(() => parseRuntimeHardFailureProbeArgs([]), /source-id/);

const calls = [];
const evidence = await runRuntimeHardFailureProbe({
  argv: ["--source-id", "fixture", "--attempts", "2", "--interval-ms", "15000", "--timeout-ms", "25000"],
  dependencies: {
    sources: [{ sourceId: "fixture", sourceName: "Fixture", listUrl: "https://fixture.example/list?token=must-not-leak", baseUrl: "https://fixture.example", adapter: "" }],
    registry: {},
    resolvePolicy: () => ({ policyId: "fixture-policy", protocolMode: "strict", tlsMode: "strict", dnsFamily: "ipv4", timeoutMs: 25000, allowedHttpHosts: [] }),
    dispatcherPool: { close: async () => { calls.push("close"); } },
    lookup: async () => [{ address: "192.0.2.1", family: 4 }],
    delay: async (milliseconds) => { calls.push(`delay:${milliseconds}`); },
    productionProbe: async ({ timeoutMs }) => { calls.push(`production:${timeoutMs}`); return { success: false, elapsed_ms: 4, error_code: "UND_ERR_CONNECT_TIMEOUT", final_url: "https://fixture.example/list?token=%5BREDACTED%5D", redirect_chain: [] }; },
    nodeProbe: async () => { calls.push("node"); return { success: false, elapsed_ms: 3, error_code: "ETIMEDOUT", redirect_chain: [] }; },
    curlProbe: () => { calls.push("curl"); return { curl_available: false, success: false }; },
    now: () => new Date("2026-07-25T00:00:00.000Z"),
    mainSha: "fixture-sha",
    branch: "diagnostic/fixture",
  },
});

assert.equal(evidence.sources.length, 1);
assert.equal(evidence.sources[0].attempts.length, 2);
assert.equal(evidence.sources[0].aggregate.classification, "reproducible_failure");
assert.equal(evidence.probe_configuration.transport_retry_count, 0);
assert.equal(evidence.probe_configuration.response_body_recorded, false);
assert.equal(JSON.stringify(evidence).includes("must-not-leak"), false);
assert.deepEqual(calls, ["production:25000", "node", "curl", "delay:15000", "production:25000", "node", "curl", "close"]);

console.log("runtime_hard_failure_probe_tests_passed=1");
