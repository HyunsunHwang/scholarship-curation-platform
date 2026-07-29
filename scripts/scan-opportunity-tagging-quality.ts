/**
 * Spot-check tagging quality: DB stored tags vs current classifier,
 * plus heuristic "likely wrong" buckets (e.g. 광고 공모 without marketing jobs).
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { classifyOpportunityTags } from "../lib/opportunity-tagging";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key]) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const MARKETING_JOBS = new Set([
  "ae",
  "brand_marketing",
  "performance",
  "content_sns",
  "crm",
  "growth",
  "pr",
  "content_prod",
  "pd",
  "graphic",
  "bx",
  "motion",
]);

const AD_TITLE = /광고|마케팅|홍보\s*공모|브랜드\s*캠페인|크리에이티브\s*공모/;
const DESIGN_TITLE = /디자인\s*공모|포스터|로고|CI\s*공모|BX|그래픽/;
const DEV_TITLE = /해커톤|코딩|프로그래밍|소프트웨어\s*개발|앱\s*개발|프론트|백엔드/;
const DEV_JOBS = new Set([
  "backend",
  "frontend",
  "mobile",
  "devops",
  "qa",
  "security",
  "game_dev",
  "embedded",
]);

function sameSet(a: string[] | null | undefined, b: string[] | null | undefined) {
  const aa = [...(a ?? [])].sort();
  const bb = [...(b ?? [])].sort();
  return JSON.stringify(aa) === JSON.stringify(bb);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing supabase env");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rows: Array<{
    id: number;
    name: string;
    organization: string | null;
    organization_type: string | null;
    content_kind: string;
    note: string | null;
    benefits: string[] | null;
    original_notice_text: string | null;
    interest_categories: string[] | null;
  }> = [];

  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from("contests")
      .select(
        "id, name, organization, organization_type, content_kind, note, benefits, original_notice_text, interest_categories"
      )
      .order("id")
      .range(from, from + 499);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 500) break;
  }

  let emptyJobs = 0;
  let emptyIndustries = 0;
  let jobsChanged = 0;
  let industriesChanged = 0;
  let eitherChanged = 0;
  let needsReview = 0;
  let autoTagged = 0;

  const suspicious: Array<Record<string, unknown>> = [];
  const adMissingMarketing: Array<Record<string, unknown>> = [];
  const designMissingDesign: Array<Record<string, unknown>> = [];
  const statusByKind: Record<string, Record<string, number>> = {};

  for (const row of rows) {
    const result = classifyOpportunityTags({
      title: row.name,
      organization: row.organization,
      organizationType: row.organization_type,
      body: row.original_notice_text,
      note: row.note,
      benefits: row.benefits,
      contentKind: row.content_kind as "contest" | "education" | "activity",
    });

    const storedJobs = row.interest_categories ?? [];
    if (!storedJobs.length) emptyJobs += 1;
    if (!result.industries.length) emptyIndustries += 1;

    const jobDiff = !sameSet(storedJobs, result.jobs);
    if (jobDiff) jobsChanged += 1;
    if (result.industries.length === 0) industriesChanged += 1;
    if (jobDiff) eitherChanged += 1;
    if (result.status === "needs_review") needsReview += 1;
    else autoTagged += 1;

    const kind = row.content_kind || "unknown";
    statusByKind[kind] ??= {};
    statusByKind[kind][result.status] = (statusByKind[kind][result.status] ?? 0) + 1;

    const title = row.name ?? "";
    const predictedMarketing = result.jobs.some((j) => MARKETING_JOBS.has(j));
    const storedMarketing = storedJobs.some((j) => MARKETING_JOBS.has(j));

    if (AD_TITLE.test(title) && !predictedMarketing) {
      adMissingMarketing.push({
        id: row.id,
        name: row.name,
        stored: storedJobs,
        predicted: result.jobs,
        industries: result.industries,
        status: result.status,
      });
    }
    if (AD_TITLE.test(title) && !storedMarketing) {
      suspicious.push({
        kind: "ad_title_no_marketing_in_db",
        id: row.id,
        name: row.name,
        stored: storedJobs,
        predicted: result.jobs,
      });
    }
    if (
      DESIGN_TITLE.test(title) &&
      !result.jobs.some((j) =>
        ["graphic", "bx", "product_design", "ux_ui", "motion", "web_publishing"].includes(j)
      )
    ) {
      designMissingDesign.push({
        id: row.id,
        name: row.name,
        stored: storedJobs,
        predicted: result.jobs,
      });
    }
  }

  const summary = {
    generated_at: new Date().toISOString(),
    total: rows.length,
    stored: {
      empty_jobs: emptyJobs,
      empty_jobs_pct: Number(((emptyJobs / Math.max(1, rows.length)) * 100).toFixed(1)),
      note: "interest_industries column not in DB yet; industry stats are classifier-only",
    },
    vs_current_classifier: {
      jobs_differ_from_db: jobsChanged,
      jobs_differ_pct: Number(((jobsChanged / Math.max(1, rows.length)) * 100).toFixed(1)),
      predicted_empty_industries: emptyIndustries,
      predicted_empty_industries_pct: Number(
        ((emptyIndustries / Math.max(1, rows.length)) * 100).toFixed(1)
      ),
      either_differ: eitherChanged,
      either_differ_pct: Number(((eitherChanged / Math.max(1, rows.length)) * 100).toFixed(1)),
      auto_tagged: autoTagged,
      needs_review: needsReview,
      needs_review_pct: Number(((needsReview / Math.max(1, rows.length)) * 100).toFixed(1)),
    },
    status_by_kind: statusByKind,
    heuristic_gaps: {
      ad_title_still_missing_marketing_after_fix: adMissingMarketing.length,
      ad_title_missing_marketing_in_db: suspicious.length,
      design_title_missing_design_jobs: designMissingDesign.length,
    },
    samples: {
      ad_title_still_missing_marketing_after_fix: adMissingMarketing.slice(0, 25),
      ad_title_missing_marketing_in_db: suspicious.slice(0, 25),
      design_title_missing_design_jobs: designMissingDesign.slice(0, 15),
    },
  };

  const out = path.join("reports", `opportunity-tagging-quality-scan-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, samples: undefined, report: out }, null, 2));
  console.log("\n--- ad title still missing marketing (after fix) ---");
  for (const row of adMissingMarketing.slice(0, 15)) {
    console.log(`#${row.id} ${row.name} -> ${JSON.stringify(row.predicted)}`);
  }
  console.log("\n--- ad title missing marketing IN DB (what users see now) ---");
  for (const row of suspicious.slice(0, 15)) {
    console.log(`#${row.id} ${row.name} stored=${JSON.stringify(row.stored)} pred=${JSON.stringify(row.predicted)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
