/**
 * One-shot: insert a single Linkareer contest into public.contests for UI testing.
 *   node scripts/seed-test-contest.mjs
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const path = ".env.local";
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]]) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sample = JSON.parse(
  fs.readFileSync(".crawler/chai-contest-sample.json", "utf8")
);

const INTEREST_MAP = {
  "기획/아이디어": "planning",
  "광고/마케팅": "marketing",
  "디자인": "design",
  "영상/콘텐츠": "content",
  "콘텐츠": "content",
  "IT/개발": "dev",
  "데이터": "data_ai",
  "AI": "data_ai",
};

function mapInterests(cats = []) {
  const out = [];
  for (const c of cats) {
    const id = INTEREST_MAP[c];
    if (id && !out.includes(id)) out.push(id);
  }
  // CHAI is AI advertising — ensure data_ai + marketing + planning
  for (const extra of ["planning", "marketing", "data_ai"]) {
    if (!out.includes(extra)) out.push(extra);
  }
  return out;
}

function toDate(iso) {
  if (!iso) return null;
  return String(iso).slice(0, 10);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const row = {
  name: sample.title,
  organization: sample.org,
  organization_type: sample.orgType,
  support_amount_text: sample.reward != null ? `${sample.reward}만원` : null,
  apply_start_date: toDate(sample.start),
  apply_end_date: toDate(sample.end),
  targets: sample.targets ?? null,
  benefits: sample.benefits ?? null,
  apply_types: ["홈페이지"],
  interest_categories: mapInterests(sample.cats),
  required_documents: [],
  apply_method: "홈페이지 온라인 접수",
  apply_url: sample.apply || sample.home || "",
  homepage_url: sample.home || null,
  contact: "chai.aichallenge@artistchai.co.kr",
  note: null,
  selection_note: null,
  poster_image_url: sample.posterUrl || sample.thumb || null,
  original_notice_image_url: (sample.bodyImgs || [])[0] || null,
  original_notice_image_urls: sample.bodyImgs?.length
    ? sample.bodyImgs
    : sample.posterUrl
      ? [sample.posterUrl]
      : null,
  original_notice_text: sample.bodyText || null,
  source: "linkareer",
  external_id: String(sample.id),
  source_url: `https://linkareer.com/activity/${sample.id}`,
  is_verified: true,
  list_on_home: true,
  is_recommended: true,
  recommended_sort_order: 1,
  collected_at: new Date().toISOString().slice(0, 10),
};

const { error: delErr } = await supabase
  .from("contests")
  .delete()
  .eq("source", "linkareer")
  .eq("external_id", String(sample.id));
if (delErr) console.warn("delete warn:", delErr.message);

const { data, error } = await supabase
  .from("contests")
  .insert(row)
  .select(
    "id, name, is_verified, list_on_home, poster_image_url, interest_categories, support_amount_text, apply_end_date"
  )
  .single();

if (error) {
  console.error(error);
  process.exit(1);
}
console.log("inserted", data);
