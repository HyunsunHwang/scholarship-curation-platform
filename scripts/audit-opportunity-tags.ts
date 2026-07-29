import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import { INTEREST_JOB_IDS } from "../lib/interestCategories";
import { INTEREST_INDUSTRY_IDS } from "../lib/interestIndustries";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = raw.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
}

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase URL or service role key");

const supabase = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const [{ data: contests, error }, { data: metadata, error: metadataError }] =
    await Promise.all([
      supabase
        .from("contests")
        .select("id, content_kind, interest_categories, interest_industries"),
      supabase
        .from("contest_tagging_metadata")
        .select("contest_id, status, classifier_version, confidence"),
    ]);
  if (error) throw new Error(error.message);
  if (metadataError) throw new Error(metadataError.message);

  const allowedJobs = new Set<string>(INTEREST_JOB_IDS);
  const allowedIndustries = new Set<string>(INTEREST_INDUSTRY_IDS);
  const byKind: Record<string, { total: number; withJobs: number; withIndustries: number }> =
    {};
  const unknownJobs = new Set<string>();
  const unknownIndustries = new Set<string>();

  for (const row of contests ?? []) {
    const bucket = (byKind[row.content_kind] ??= {
      total: 0,
      withJobs: 0,
      withIndustries: 0,
    });
    bucket.total += 1;
    if (row.interest_categories?.length) bucket.withJobs += 1;
    if (row.interest_industries?.length) bucket.withIndustries += 1;
    for (const id of row.interest_categories ?? []) {
      if (!allowedJobs.has(id)) unknownJobs.add(id);
    }
    for (const id of row.interest_industries ?? []) {
      if (!allowedIndustries.has(id)) unknownIndustries.add(id);
    }
  }

  const statusCounts: Record<string, number> = {};
  for (const row of metadata ?? []) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
  }

  const report = {
    generated_at: new Date().toISOString(),
    total: contests?.length ?? 0,
    by_kind: byKind,
    metadata_status: statusCounts,
    unknown_job_ids: [...unknownJobs].sort(),
    unknown_industry_ids: [...unknownIndustries].sort(),
  };
  const outputPath = path.join(
    "reports",
    `opportunity-tag-audit-${Date.now()}.json`
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, report: outputPath }, null, 2));
  if (unknownJobs.size || unknownIndustries.size) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
