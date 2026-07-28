import fs from "node:fs";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { assertPostPhaseLTarget } from "../lib/post-phase-l/target-guard.mjs";
import { analysisSha256 } from "../lib/analysis/analysis-identifiers.mjs";

function option(argv, name) {
  const index = argv.indexOf(`--${name}`);
  if (index < 0) return null;
  const next = argv[index + 1];
  return !next || next.startsWith("--") ? true : next;
}

async function main() {
  const argv = process.argv.slice(2);
  const cycleId = String(option(argv, "cycle-id") ?? "");
  if (!cycleId) throw new Error("--cycle-id is required");
  if (option(argv, "allow-db-write") !== true) throw new Error("--allow-db-write is required");
  if (typeof process.loadEnvFile === "function" && fs.existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
  const guard = assertPostPhaseLTarget({
    POST_PHASE_L_TARGET_PROJECT_REF: process.env.POST_PHASE_L_TARGET_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  }, { requireApply: false });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  }
  const db = createClient(guard.target_project_url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc("project_scholarship_cycle", {
    p_cycle_id: cycleId,
    p_projection_fingerprint: analysisSha256(`scholarship-projection-v1|${cycleId}`),
  });
  if (error) throw new Error(error.message);
  console.log(JSON.stringify(data, null, 2));
}

main().catch((error) => {
  console.error(`cycle_projection_failed=${error.message}`);
  process.exitCode = 1;
});
