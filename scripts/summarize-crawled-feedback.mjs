import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function cleanText(value) {
  return String(value ?? "").trim();
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const env = {};
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalIndex = line.indexOf("=");
    if (equalIndex <= 0) continue;
    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function loadSupabaseCredentials() {
  const root = path.resolve(".");
  const envFiles = [".env.local", ".env.production", ".env"];
  const mergedEnv = {};
  for (const envFile of envFiles) {
    Object.assign(mergedEnv, readEnvFile(path.join(root, envFile)));
  }
  const supabaseUrl =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    mergedEnv.SUPABASE_URL ??
    mergedEnv.NEXT_PUBLIC_SUPABASE_URL ??
    "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? mergedEnv.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return { supabaseUrl: cleanText(supabaseUrl), serviceRoleKey: cleanText(serviceRoleKey) };
}

const { supabaseUrl, serviceRoleKey } = loadSupabaseCredentials();
const OUTPUT_PATH =
  process.env.FEEDBACK_OUTPUT_PATH ?? "exports/notices/quality/review-feedback-latest.json";
const LOOKBACK_DAYS = Number(process.env.FEEDBACK_LOOKBACK_DAYS ?? 14);
const PAGE_SIZE = 1000;

function parseRejectTag(reviewNote) {
  const note = cleanText(reviewNote);
  if (!note) return "untagged";
  const bracket = note.match(/^\[([a-z0-9_]+)\]/i);
  if (bracket?.[1]) return bracket[1].toLowerCase();
  if (/중복|duplicate/i.test(note)) return "duplicate";
  if (/장학\s*아님|not\s*scholarship/i.test(note)) return "not_scholarship";
  if (/기간\s*종료|마감|expired|closed/i.test(note)) return "expired";
  return "untagged";
}

async function fetchNotices(supabase, fromIso) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("crawled_notices")
      .select("id, source_group, source_id, status, review_note, reviewed_at, run_at")
      .gte("run_at", fromIso)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`feedback query failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function aggregate(rows) {
  const byGroup = new Map();
  const rejectTags = new Map();

  const ensureGroup = (group) => {
    if (!byGroup.has(group)) {
      byGroup.set(group, {
        sourceGroup: group,
        total: 0,
        newCount: 0,
        promotedCount: 0,
        rejectedCount: 0,
        promoteRate: 0,
      });
    }
    return byGroup.get(group);
  };

  for (const row of rows) {
    const group = cleanText(row.source_group) || "unknown";
    const record = ensureGroup(group);
    record.total += 1;
    if (row.status === "new") record.newCount += 1;
    if (row.status === "promoted") record.promotedCount += 1;
    if (row.status === "rejected") {
      record.rejectedCount += 1;
      const tag = parseRejectTag(row.review_note);
      rejectTags.set(tag, (rejectTags.get(tag) ?? 0) + 1);
    }
  }

  const groups = [...byGroup.values()]
    .map((item) => ({
      ...item,
      promoteRate: item.total > 0 ? item.promotedCount / item.total : 0,
    }))
    .sort((a, b) => b.total - a.total);
  const rejectTagCounts = Object.fromEntries(
    [...rejectTags.entries()].sort((a, b) => b[1] - a[1]),
  );

  return {
    total: rows.length,
    groups,
    rejectTagCounts,
  };
}

async function run() {
  if (!supabaseUrl || !serviceRoleKey) {
    console.log("skip=missing_supabase_credentials");
    console.log(
      "hint=set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or add them to .env.local)",
    );
    return;
  }

  const now = new Date();
  const fromDate = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const fromIso = fromDate.toISOString();
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const rows = await fetchNotices(supabase, fromIso);
  const aggregates = aggregate(rows);
  const payload = {
    generatedAt: now.toISOString(),
    lookbackDays: LOOKBACK_DAYS,
    fromIso,
    ...aggregates,
  };

  const outputPath = path.resolve(OUTPUT_PATH);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");

  console.log(`feedback_output=${outputPath}`);
  console.log(`feedback_rows=${aggregates.total}`);
  console.log(`feedback_groups=${aggregates.groups.length}`);
}

run().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
