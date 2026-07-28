import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { assertPostPhaseLTarget } from "../lib/post-phase-l/target-guard.mjs";
import { buildGoldDatasetRows } from "../lib/analysis/semantic-review.mjs";

function args(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    const value = argv[index + 1];
    result[key] = !value || value.startsWith("--") ? true : value;
    if (result[key] !== true) index += 1;
  }
  return result;
}

function writeJsonl(outputPath, rows) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
  return resolved;
}

async function readDatabase() {
  if (typeof process.loadEnvFile === "function" && fs.existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
  const guard = assertPostPhaseLTarget({
    POST_PHASE_L_TARGET_PROJECT_REF: process.env.POST_PHASE_L_TARGET_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  }, { requireApply: false });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  const client = createClient(guard.target_project_url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [results, runs, evidence, reviews] = await Promise.all([
    client.from("notice_analysis_results").select("*"),
    client.from("notice_analysis_runs").select("*"),
    client.from("notice_analysis_evidence").select("*"),
    client.from("notice_analysis_review_events").select("*"),
  ]);
  for (const response of [results, runs, evidence, reviews]) {
    if (response.error) throw new Error(response.error.message);
  }
  return {
    results: results.data ?? [],
    runs: runs.data ?? [],
    evidence: evidence.data ?? [],
    reviews: reviews.data ?? [],
    safeInputs: (runs.data ?? []).flatMap((run) =>
      run.metadata?.safe_analysis_input
        ? [{ input_fingerprint: run.input_fingerprint, normalized_input: run.metadata.safe_analysis_input }]
        : []),
  };
}

async function main() {
  const options = args(process.argv.slice(2));
  const output = String(options.out ?? "reports/analysis-gold-dataset.jsonl");
  const input = options.fixture
    ? JSON.parse(fs.readFileSync(path.resolve(String(options.fixture)), "utf8"))
    : await readDatabase();
  const rows = buildGoldDatasetRows(input);
  const resolved = writeJsonl(output, rows);
  console.log(`gold_rows=${rows.length}`);
  console.log(`gold_output=${resolved}`);
}

main().catch((error) => {
  console.error(`gold_export_failed=${error.message}`);
  process.exitCode = 1;
});
