import fs from "node:fs";
import path from "node:path";

// ─────────────────────────────────────────────────────────────────
// The Dream(thedreamkorea.com) 장학금 데이터 수집기
//
// 더드림은 Next.js(App Router) + Supabase 구조로, 클라이언트가 공개 anon
// 키로 `scholarships` 테이블을 직접 조회합니다. 이 스크립트는 사이트의
// 클라이언트 번들에서 Supabase URL/anon 키를 런타임에 탐지한 뒤, 공개
// REST API(/rest/v1/scholarships)를 페이지네이션으로 전량 수집합니다.
//
// 운영/법적 주의:
// - 대상은 "원천"이 아니라 타사가 큐레이션한 결과물입니다. robots.txt는
//   일반 UA에 /scholarships를 허용하지만 Content-Signal은 ai-train=no이며,
//   AI 봇(GPTBot/ClaudeBot 등)은 전면 Disallow입니다.
// - 상업적 재배포/재게시 전에는 이용약관·저작권법상 DB제작자 권리를
//   반드시 확인하세요. 본 스크립트는 분석/비교 목적의 로컬 수집 용도입니다.
// ─────────────────────────────────────────────────────────────────

const SITE_ORIGIN = process.env.THEDREAM_ORIGIN ?? "https://www.thedreamkorea.com";
const ENTRY_PATH = process.env.THEDREAM_ENTRY_PATH ?? "/scholarships?tab=all";
const TABLE = process.env.THEDREAM_TABLE ?? "scholarships";
const PAGE_SIZE = Number(process.env.THEDREAM_PAGE_SIZE ?? 1000);
const REQUEST_DELAY_MS = Number(process.env.THEDREAM_DELAY_MS ?? 400);

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const outDir = process.argv[3] ?? "exports/thedream";
const jsonOut = path.resolve(outDir, `thedream-scholarships-${stamp}.json`);
const jsonLatest = path.resolve(outDir, "thedream-scholarships-latest.json");
const csvOut = path.resolve(outDir, `thedream-scholarships-${stamp}.csv`);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { "user-agent": BROWSER_UA, ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

/**
 * 사이트 진입 페이지 HTML에서 클라이언트 청크 URL을 모아 다운로드한 뒤,
 * Supabase 프로젝트 URL과 anon 키를 정규식으로 추출합니다. 키가 교체돼도
 * 하드코딩 없이 최신 값을 사용하도록 런타임에 탐지합니다.
 */
async function discoverCredentials() {
  const overrideUrl = process.env.THEDREAM_SUPABASE_URL;
  const overrideKey = process.env.THEDREAM_SUPABASE_ANON_KEY;
  if (overrideUrl && overrideKey) {
    return { supabaseUrl: overrideUrl.replace(/\/$/, ""), anonKey: overrideKey };
  }

  const html = await fetchText(`${SITE_ORIGIN}${ENTRY_PATH}`);
  const chunkPaths = Array.from(
    new Set(
      (html.match(/\/_next\/static\/chunks\/[^"']+?\.js(?:\?[^"']*)?/g) ?? []).map((p) => p),
    ),
  );
  if (chunkPaths.length === 0) {
    throw new Error("No client chunks found on entry page.");
  }

  let supabaseUrl = "";
  let anonKey = "";
  for (const chunkPath of chunkPaths) {
    let js = "";
    try {
      js = await fetchText(`${SITE_ORIGIN}${chunkPath}`);
    } catch {
      continue;
    }
    if (!supabaseUrl) {
      supabaseUrl = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/i)?.[0] ?? "";
    }
    if (!anonKey) {
      // JWT (header.payload.signature) 형태의 anon 키
      const jwt = js.match(
        /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      );
      if (jwt?.length) {
        // role":"anon" 을 포함하는 키를 우선 선택
        anonKey =
          jwt.find((token) => {
            try {
              const payload = JSON.parse(
                Buffer.from(token.split(".")[1], "base64").toString("utf8"),
              );
              return payload.role === "anon";
            } catch {
              return false;
            }
          }) ?? jwt[0];
      }
    }
    if (supabaseUrl && anonKey) break;
  }

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Failed to discover Supabase credentials from client bundle.",
    );
  }
  return { supabaseUrl, anonKey };
}

async function fetchAllRows({ supabaseUrl, anonKey }) {
  const headers = {
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`,
    accept: "application/json",
  };
  const all = [];
  let from = 0;
  let total = null;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const url = `${supabaseUrl}/rest/v1/${TABLE}?select=*&order=created_at.desc`;
    const res = await fetch(url, {
      headers: {
        ...headers,
        "user-agent": BROWSER_UA,
        range: `${from}-${to}`,
        "range-unit": "items",
        prefer: "count=exact",
      },
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`REST ${TABLE} -> HTTP ${res.status}`);
    }
    const contentRange = res.headers.get("content-range");
    if (contentRange && total === null) {
      total = Number(contentRange.split("/")[1]);
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    console.log(`  fetched ${all.length}${total ? `/${total}` : ""}`);
    if (batch.length < PAGE_SIZE) break;
    if (total !== null && all.length >= total) break;
    from += PAGE_SIZE;
    await sleep(REQUEST_DELAY_MS);
  }

  return { rows: all, total: total ?? all.length };
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  let stringValue;
  if (Array.isArray(value) || typeof value === "object") {
    stringValue = JSON.stringify(value);
  } else {
    stringValue = String(value);
  }
  const escaped = stringValue.replace(/"/g, '""');
  if (/[",\n\r]/.test(escaped)) return `"${escaped}"`;
  return escaped;
}

function writeCsv(rows, outputPath) {
  const headerSet = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) headerSet.add(key);
  }
  const headers = Array.from(headerSet);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsv(row[h])).join(","));
  }
  fs.writeFileSync(outputPath, `\uFEFF${lines.join("\r\n")}`, "utf8");
}

async function main() {
  console.log("Discovering Supabase credentials from site bundle...");
  const creds = await discoverCredentials();
  console.log(`  supabaseUrl=${creds.supabaseUrl}`);
  console.log(`  anonKey=${creds.anonKey.slice(0, 12)}...(${creds.anonKey.length} chars)`);

  console.log(`Fetching '${TABLE}' rows...`);
  const { rows, total } = await fetchAllRows(creds);

  fs.mkdirSync(path.resolve(outDir), { recursive: true });
  const payload = {
    source: `${SITE_ORIGIN}${ENTRY_PATH}`,
    table: TABLE,
    fetchedAt: new Date().toISOString(),
    reportedTotal: total,
    count: rows.length,
    rows,
  };
  fs.writeFileSync(jsonOut, JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(jsonLatest, JSON.stringify(payload, null, 2), "utf8");
  writeCsv(rows, csvOut);

  console.log("");
  console.log(`rows=${rows.length} (reported total=${total})`);
  console.log(`json=${jsonOut}`);
  console.log(`json_latest=${jsonLatest}`);
  console.log(`csv=${csvOut}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
