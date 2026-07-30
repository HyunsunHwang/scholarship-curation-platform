/**
 * Apply unresolved-51 CSV remediations after common adapter/pattern fixes.
 * Usage: node scripts/apply-unresolved-51-csv-fixes.mjs
 */
import fs from "node:fs";
import path from "node:path";

const CSV_PATH = "data/notice-sources-four-year-univ.csv";
const BASELINE = JSON.parse(
  fs.readFileSync("reports/university-beta/unresolved-51-baseline.json", "utf8"),
).sources;
const baselineIds = new Set(BASELINE.map((s) => s.source_id));

const EXPANDED_PATTERN =
  "(mode=view|sMode=VIEW_FORM|iBrdContNo=|articleNo=|boardNo=|nttNo=|nttId=|nttSn=|idx=\\d+|no=\\d+|wr_id=\\d+|boardSeq=\\d+|b_idx=\\d+|seq=\\d+|uid=\\d+|artclNo=|brdIdx=|DOC_NO=|BBS_SEQ=|bIdx=|bdId=|artclView\\.do|selectNttInfo\\.do|selectBoardArticle\\.do|BoardView\\.do|boardCnts\\/view\\.do|boardView\\.do|detailView\\.do|scholarDetail\\.do|View\\d+\\.do|view\\.do|\\/portalBbs\\/|\\/article\\/[^/]+\\/detail\\/|\\/web\\/Board\\/|notice-view\\?id=|mod=document)";

const SOURCE_FIXES = {
  // CAU / Konkuk FR_CON XHR list
  ou_8_univ_001: {
    adapter: "cau_portal",
    list_item_selector: "",
    link_selector: "",
    title_selector: "",
    date_selector: "",
    notes_suffix: " | adapter=cau_portal (FR_CON BBSViewList2)",
  },
  ou_1779_univ_001: {
    adapter: "cau_portal",
    list_item_selector: "",
    link_selector: "",
    title_selector: "",
    date_selector: "",
    notes_suffix: " | adapter=cau_portal (FR_CON BBSViewList2)",
  },
  // UOS scholarship portal: calendar tbody is wrong; notice list is li.main_notice_news
  ou_10_univ_001: {
    list_item_selector: "li.main_notice_news",
    link_selector: 'a[onclick*="fnView"]',
    title_selector: 'a[onclick*="fnView"]',
    date_selector: "span.f_right",
    notes_suffix: " | selector=li.main_notice_news + fnView",
  },
  // Dongguk: goDetail onclick
  ou_12_univ_001: {
    link_selector: "a[onclick*='goDetail'], a[href]",
    notes_suffix: " | goDetail adapter",
  },
  // Hanseo boardCnts goView
  ou_3437_univ_001: {
    link_selector: "a[onclick*='goView'], a[href]",
    notes_suffix: " | goView boardCnts",
  },
  // UHS jf_view
  ou_3518_univ_001: {
    link_selector: "a[onclick*='jf_view'], a[href]",
    notes_suffix: " | jf_view portalBbs",
  },
  // Hanbat / Hanbat industrial duplicate: fn_search_detail
  ou_2106_univ_001: {
    link_selector: "a[onclick*='fn_search_detail'], a[href*='view.do']",
    notes_suffix: " | fn_search_detail",
  },
  ou_3436_univ_001: {
    link_selector: "a[onclick*='fn_search_detail'], a[href*='view.do']",
    notes_suffix: " | fn_search_detail",
  },
  // eGov nttInfoBtn data-id boards
  ou_1821_univ_001: {
    link_selector: "a.nttInfoBtn, a[data-id], a[href]",
    notes_suffix: " | data-id→selectNttInfo",
  },
  ou_1864_univ_001: {
    link_selector: "a.nttInfoBtn, a[data-id], a[href]",
    notes_suffix: " | data-id→selectNttInfo",
  },
  ou_2074_univ_001: {
    link_selector: "a.nttInfoBtn, a[data-id], a[href]",
    notes_suffix: " | data-id→selectNttInfo",
  },
  ou_2081_univ_001: {
    link_selector: "a.nttInfoBtn, a[data-id], a[href]",
    notes_suffix: " | data-id→selectNttInfo",
  },
  ou_2246_univ_001: {
    link_selector: "a.nttInfoBtn, a[data-id], a[href]",
    notes_suffix: " | data-id→selectNttInfo",
  },
  ou_2515_univ_001: {
    link_selector: "a.nttInfoBtn, a[data-id], a[href]",
    notes_suffix: " | data-id→selectNttInfo",
  },
  // Round-2 onclick boards
  ou_2163_univ_001: {
    link_selector: "a[href*='goBdView'], a[href]",
    notes_suffix: " | goBdView→boardView.do",
  },
  ou_3064_univ_001: {
    link_selector: "a[onclick*='pf_DetailMove'], a[href]",
    notes_suffix: " | pf_DetailMove→detailView.do",
  },
  ou_2909_univ_001: {
    link_selector: "a[onclick*='doDetail'], a[href]",
    notes_suffix: " | doDetail→scholarDetail.do",
  },
  ou_2401_univ_001: {
    list_url: "https://www.cup.ac.kr/entrance/home/front/board/List294.do",
    base_url: "https://www.cup.ac.kr",
    list_item_selector: "tbody tr",
    link_selector: "a[onclick*='fn_View'], a[href]",
    notes_suffix: " | fn_View→View294.do (student board)",
  },
  ou_2266_univ_001: {
    adapter: "duksung_bbs_ajax",
    list_item_selector: "",
    link_selector: "",
    title_selector: "",
    date_selector: "",
    notes_suffix: " | adapter=duksung_bbs_ajax",
  },
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim()));
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const raw = fs.readFileSync(CSV_PATH, "utf8").replace(/^\uFEFF/, "");
const table = parseCsv(raw);
const header = table[0];
const index = Object.fromEntries(header.map((name, i) => [name, i]));
let changed = 0;

for (let r = 1; r < table.length; r += 1) {
  const row = table[r];
  const sid = row[index.source_id];
  const isBaseline = baselineIds.has(sid);
  const prevPattern = row[index.notice_url_pattern] || "";
  if (prevPattern || isBaseline) {
    if (row[index.notice_url_pattern] !== EXPANDED_PATTERN) {
      row[index.notice_url_pattern] = EXPANDED_PATTERN;
      changed += 1;
    }
  }
  const fix = SOURCE_FIXES[sid];
  if (!fix) continue;
  for (const [key, value] of Object.entries(fix)) {
    if (key === "notes_suffix") continue;
    if (!(key in index)) continue;
    if (row[index[key]] !== value) {
      row[index[key]] = value;
      changed += 1;
    }
  }
  if (fix.notes_suffix && index.notes != null) {
    const notes = row[index.notes] || "";
    if (!notes.includes(fix.notes_suffix.trim())) {
      row[index.notes] = `${notes}${fix.notes_suffix}`.trim();
      changed += 1;
    }
  }
}

const out = `${table.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
fs.writeFileSync(CSV_PATH, out, "utf8");

// refresh unresolved-51 subset csv
const subset = [header, ...table.slice(1).filter((row) => baselineIds.has(row[index.source_id]))];
fs.writeFileSync(
  "reports/university-beta/notice-sources-unresolved-51.csv",
  `${subset.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`,
  "utf8",
);

console.log(
  JSON.stringify(
    {
      csv: CSV_PATH,
      baseline: baselineIds.size,
      field_changes: changed,
      source_fixes: Object.keys(SOURCE_FIXES).length,
      pattern: EXPANDED_PATTERN,
    },
    null,
    2,
  ),
);
