/**
 * Merge scholarship-notice research batch JSON files into one CSV.
 *
 * Expects reports/scholarship-notice-batches/batch-*.json
 * each: [{ name, notice_url, confidence?, note? }]
 *
 * Usage: npx tsx scripts/merge-scholarship-notice-csv.ts
 */
import fs from "node:fs";
import path from "node:path";

type Row = {
  name: string;
  notice_url: string | null;
  confidence?: string;
  note?: string;
};

function esc(v: string) {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

const univPath = path.join("data", "seed", "four-year-universities.json");
const universities = JSON.parse(fs.readFileSync(univPath, "utf8")) as Array<{
  id: number;
  name: string;
  school_type: string;
  region_sido: string | null;
}>;

const batchDir = path.join("reports", "scholarship-notice-batches");
const byName = new Map<string, Row>();

// Known seeds from notice_sources
const seeds: Row[] = [
  {
    name: "중앙대학교",
    notice_url:
      "https://www.cau.ac.kr/cms/FR_CON/index.do?MENU_ID=100&CONTENTS_NO=5&P_TAB_NO=5",
    confidence: "high",
    note: "notice_sources",
  },
  {
    name: "이화여자대학교",
    notice_url: "https://www.ewha.ac.kr/ewha/bachelor/scholarship-notice.do",
    confidence: "high",
    note: "notice_sources",
  },
  {
    name: "한국외국어대학교",
    notice_url: "https://www.hufs.ac.kr/hufs/11283/subview.do",
    confidence: "high",
    note: "notice_sources",
  },
  {
    name: "서울대학교",
    notice_url:
      "https://student.snu.ac.kr/%EC%86%8C%EC%8B%9D%C2%B7%EC%95%8C%EB%A6%BC/%EA%B3%B5%EC%A7%80%EC%82%AC%ED%95%AD/?category1=%EC%9D%BC%EB%B0%98%EA%B3%B5%EC%A7%80&mod=list",
    confidence: "medium",
    note: "notice_sources (general notice)",
  },
  {
    name: "연세대학교",
    notice_url:
      "https://www.yonsei.ac.kr/sc/254/subview.do?enc=Zm5jdDF8QEB8JTJGYmJzJTJGc2MlMkY1OCUyRmFydGNsTGlzdC5kbyUzRmZpbmRDbFNlcSUzRDI1NyUyNg%3D%3D",
    confidence: "high",
    note: "notice_sources",
  },
];
for (const s of seeds) byName.set(s.name, s);

if (fs.existsSync(batchDir)) {
  for (const file of fs
    .readdirSync(batchDir)
    .filter(
      (f) =>
        f.endsWith(".json") &&
        f !== "status.json" &&
        (f.startsWith("batch-") || f === "notice-sources-seeds.json")
    )) {
    const rows = JSON.parse(
      fs.readFileSync(path.join(batchDir, file), "utf8")
    ) as Row[];
    for (const row of rows) {
      if (!row?.name) continue;
      const prev = byName.get(row.name);
      if (!prev || (!prev.notice_url && row.notice_url)) {
        byName.set(row.name, row);
      }
    }
  }
}

const lines = [
  ["org_unit_id", "school_name", "school_type", "region_sido", "scholarship_notice_url", "confidence", "note"]
    .join(","),
];

let withUrl = 0;
let missing = 0;
for (const u of universities) {
  const found = byName.get(u.name);
  const url = found?.notice_url ?? "";
  if (url) withUrl++;
  else missing++;
  lines.push(
    [
      String(u.id),
      esc(u.name),
      esc(u.school_type),
      esc(u.region_sido ?? ""),
      esc(url),
      esc(found?.confidence ?? ""),
      esc(found?.note ?? ""),
    ].join(",")
  );
}

fs.mkdirSync("reports", { recursive: true });
const out = path.join(
  "reports",
  `four-year-scholarship-notice-links-${Date.now()}.csv`
);
// UTF-8 BOM so Excel on Windows opens Korean text correctly.
fs.writeFileSync(out, "\uFEFF" + lines.join("\n"), "utf8");
console.log(JSON.stringify({ out, total: universities.length, withUrl, missing }, null, 2));
