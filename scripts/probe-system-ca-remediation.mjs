import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSources } from "../lib/notice-sources-loader.mjs";
import {
  createTransportClient,
  createTransportDispatcherPool,
  loadTransportPolicyRegistry,
  resolveEffectiveTransportPolicy,
} from "../lib/crawler-engine/transport/index.mjs";
import {
  DEFAULT_SYSTEM_CA_REMEDIATION_SOURCE_IDS,
  compareSystemCaRemediationEvidence,
  probeSystemCaRemediation,
} from "../lib/crawler-engine/transport/system-ca-remediation-probe.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function kstDate(now = new Date()) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseArgs(argv) {
  const sourceIds = [];
  let output = null;
  let check = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--source-id") {
      const sourceId = argv[++index];
      if (!sourceId) throw new Error("--source-id requires a value");
      sourceIds.push(sourceId);
    } else if (value === "--output") {
      output = argv[++index];
      if (!output) throw new Error("--output requires a value");
    } else if (value === "--check") {
      check = true;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return { sourceIds: sourceIds.length > 0 ? sourceIds : DEFAULT_SYSTEM_CA_REMEDIATION_SOURCE_IDS, output, check };
}

export async function runSystemCaRemediationProbe({ argv = process.argv.slice(2) } = {}) {
  const options = parseArgs(argv);
  const outputPath = path.resolve(
    repositoryRoot,
    options.output ?? path.join("reports", "runtime-diagnostics", `transport-system-ca-remediation-${kstDate()}.json`),
  );
  const sources = (await loadSources("manifest")).sources;
  const registry = loadTransportPolicyRegistry({ sources });
  const evidence = await probeSystemCaRemediation({
    sources,
    registry,
    sourceIds: options.sourceIds,
    createClient: createTransportClient,
    createDispatcherPool: createTransportDispatcherPool,
    resolvePolicy: resolveEffectiveTransportPolicy,
  });
  if (options.check) {
    const previous = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const mismatches = compareSystemCaRemediationEvidence(previous, evidence);
    if (mismatches.length > 0) {
      const error = new Error(`System CA evidence check failed: ${mismatches.join("; ")}`);
      error.code = "transport_probe_contract_changed";
      throw error;
    }
    console.log(`system_ca_probe_check_passed=${outputPath}`);
    return evidence;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(`system_ca_probe_written=${outputPath}`);
  return evidence;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runSystemCaRemediationProbe().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
