/**
 * KOSAF 학자금 지원정보 통합검색(대학생) 공개 페이지 PoC
 *
 * - 비로그인(ignoreSession=Y) 목록 1페이지 파싱
 * - 첫 건(또는 --code=) 상세 1건 추출
 * - DB 적재 없음. JSON + CSV를 exports/kosaf/ 에 저장
 *
 * 사용:
 *   node scripts/poc-kosaf-public-search.mjs
 *   node scripts/poc-kosaf-public-search.mjs --code=0568001
 *   node scripts/poc-kosaf-public-search.mjs --page=1 --limit=10
 *
 * 주의:
 *   공개 검색 페이지 기준 PoC입니다. 대량·상용 수집 전 약관/법무 확인 권장.
 *   요청 간격을 두고, 서버에 부하를 주지 마세요.
 */

import fs from "node:fs";
import path from "node:path";
import { load as loadHtml } from "cheerio";

const ORIGIN = "https://portal.kosaf.go.kr";
const LIST_PATH = "/CO/jspAction.do";
const ACTION_SAFE = "/CO/jspActionSafe.do";
const UA =
  process.env.CRAWL_USER_AGENT ??
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 ScholarshipCurationPoC/0.1";
const TIMEOUT_MS = Number(process.env.KOSAF_POC_TIMEOUT_MS ?? 45_000);
const DELAY_MS = Number(process.env.KOSAF_POC_DELAY_MS ?? 800);

const LIST_PARAMS = {
  forwardOnlyFlag: "N",
  forwardPage: "pt/sm/cstmdsgngoods/PTSMCstmDsgnGoods_10M",
  beanName: "PTSMCstmDsgnGoodsSVC",
  methodName: "getItgnSrchCstmDsgnGoodsList",
  inputVOName:
    "kr.go.kosaf.portal.pt.sm.cstmdsgngoods.svc.PTSMCstmDsgnGoodsSVO",
  ignoreSession: "Y",
  lgclMenuClssCd: "ss02",
  smclMenuClssCd: "ss0201",
  naviParam: "MK,01,01,01",
};

function parseArgs(argv) {
  const out = { page: 1, limit: 1, code: null };
  for (const arg of argv) {
    if (arg.startsWith("--page=")) out.page = Math.max(1, Number(arg.slice(7)) || 1);
    else if (arg.startsWith("--limit="))
      out.limit = Math.max(0, Number(arg.slice(8)) || 0);
    else if (arg.startsWith("--code=")) out.code = arg.slice(7).trim() || null;
  }
  return out;
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows, columns) {
  const header = columns.map(csvEscape).join(",");
  const lines = rows.map((row) =>
    columns.map((col) => csvEscape(row[col])).join(","),
  );
  // UTF-8 BOM so Excel opens Korean correctly
  return `\uFEFF${[header, ...lines].join("\r\n")}\r\n`;
}

const LIST_CSV_COLUMNS = [
  "goodsCode",
  "no",
  "organization",
  "title",
  "institutionType",
  "productType",
  "contact",
  "applyDeadline",
  "homepageUrl",
];

const DETAIL_CSV_COLUMNS = [
  ...LIST_CSV_COLUMNS,
  "supportAmount",
  "applyPeriod",
  "detailHomepageUrl",
  "국적",
  "대학구분",
  "학년구분",
  "학과구분",
  "성적기준",
  "소득기준",
  "특정자격",
  "지역거주구분",
  "선발방법",
  "선발인원",
  "자격제한",
  "추천필요여부",
  "제출처 및 제출서류",
  "문의처",
  "error",
];

function detailToCsvRow(entry) {
  const list = entry.list ?? {};
  const detail = entry.detail ?? {};
  const fields = detail.fields ?? {};
  return {
    goodsCode: list.goodsCode ?? entry.goodsCode ?? detail.goodsCode ?? "",
    no: list.no ?? "",
    organization: detail.organization ?? list.organization ?? "",
    title: detail.title ?? list.title ?? "",
    institutionType: list.institutionType ?? "",
    productType: detail.productType ?? list.productType ?? "",
    contact: list.contact ?? fields["문의처"] ?? "",
    applyDeadline: list.applyDeadline ?? "",
    homepageUrl: list.homepageUrl ?? "",
    supportAmount: detail.supportAmount ?? fields["지원금액"] ?? "",
    applyPeriod: detail.applyPeriod ?? fields["신청기간"] ?? "",
    detailHomepageUrl: detail.homepageUrl ?? fields["홈페이지주소"] ?? "",
    국적: fields["국적"] ?? "",
    대학구분: fields["대학구분"] ?? "",
    학년구분: fields["학년구분"] ?? "",
    학과구분: fields["학과구분"] ?? "",
    성적기준: fields["성적기준"] ?? "",
    소득기준: fields["소득기준"] ?? "",
    특정자격: fields["특정자격"] ?? "",
    지역거주구분: fields["지역거주구분"] ?? "",
    선발방법: fields["선발방법"] ?? "",
    선발인원: fields["선발인원"] ?? "",
    자격제한: fields["자격제한"] ?? "",
    추천필요여부: fields["추천필요여부"] ?? "",
    "제출처 및 제출서류": fields["제출처 및 제출서류"] ?? "",
    문의처: fields["문의처"] ?? list.contact ?? "",
    error: entry.error ?? "",
  };
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractCsrf(html) {
  const m =
    html.match(/csrfTokenPortal\.value\s*=\s*"([a-f0-9]+)"/i) ||
    html.match(/name=["']csrfTokenPortal["'][^>]*value=["']([a-f0-9]+)["']/i) ||
    html.match(/csrfTokenPortal['"]\s*:\s*['"]([a-f0-9]+)['"]/i);
  return m?.[1] ?? null;
}

function extractLastPage(html) {
  const matches = [...html.matchAll(/fn_page\('(\d+)'\)/g)].map((m) =>
    Number(m[1]),
  );
  return matches.length ? Math.max(...matches) : null;
}

async function fetchText(url, { method = "GET", body, cookie } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers = {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    };
    if (cookie) headers.Cookie = cookie;
    if (method === "POST") {
      headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
    }

    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
      redirect: "follow",
    });

    const setCookie = res.headers.getSetCookie?.() ?? [];
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      text,
      setCookie,
      finalUrl: res.url,
    };
  } finally {
    clearTimeout(timer);
  }
}

function mergeCookies(existing, setCookieHeaders) {
  const jar = new Map();
  for (const part of String(existing ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
  for (const header of setCookieHeaders ?? []) {
    const first = header.split(";")[0];
    const eq = first.indexOf("=");
    if (eq > 0) jar.set(first.slice(0, eq), first.slice(eq + 1));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function buildListUrl(page) {
  const qs = new URLSearchParams({ ...LIST_PARAMS, no: String(page) });
  return `${ORIGIN}${LIST_PATH}?${qs.toString()}`;
}

function parseList(html) {
  const $ = loadHtml(html);
  const items = [];

  $("#tableList02 tbody tr").each((_, tr) => {
    const cells = $(tr)
      .find("td")
      .toArray()
      .map((td) => cleanText($(td).text()));
    if (cells.length < 5) return;

    const dtlHref =
      $(tr).find("a[href*='fn_goDtl']").attr("href") ??
      $(tr).find("a[onclick*='fn_goDtl']").attr("onclick") ??
      "";
    const homeHref =
      $(tr).find("a[href*='fn_goHome']").attr("href") ??
      $(tr).find("a[onclick*='fn_goHome']").attr("onclick") ??
      "";

    const codeMatch = dtlHref.match(/fn_goDtl\('([^']+)'\)/);
    const homeMatch = homeHref.match(/fn_goHome\('([^']+)'\)/);
    const code = codeMatch?.[1] ?? null;
    if (!code) return;

    // Columns (desktop): No, 기관명, 상품명, 기관구분, 상품구분, 문의처, 모집마감일, 상세/홈
    // Some columns may be hide_m; cheerio still sees them in DOM order.
    items.push({
      no: cells[0] || null,
      organization: cells[1] || null,
      title: cells[2] || null,
      institutionType: cells[3] || null,
      productType: cells[4] || null,
      contact: cells[5] || null,
      applyDeadline: cells[6] || null,
      goodsCode: code,
      homepageUrl: homeMatch?.[1] || null,
    });
  });

  return items;
}

function setField(fields, label, value) {
  const key = cleanText(label);
  const val = cleanText(value);
  if (!key || !val) return;
  if (key.length > 40) return;
  if (!fields[key]) fields[key] = val;
}

/** Known detail labels that start a label/value pair in mixed rows. */
const DETAIL_LABELS = new Set([
  "상품구분",
  "운영기관구분",
  "운영기관명",
  "국적",
  "홈페이지주소",
  "대학구분",
  "학년구분",
  "학과구분",
  "성적기준",
  "소득기준",
  "지원금액",
  "특정자격",
  "지역거주구분",
  "신청기간",
  "모집기간",
  "선발방법",
  "선발인원",
  "자격제한",
  "추천필요여부",
  "제출처 및 제출서류",
  "문의처",
  "선발공고문",
]);

function parseDetail(html, goodsCode) {
  const $ = loadHtml(html);
  const fields = {};

  // Detail tables mix:
  // 1) header row of <th>label</th><th>value</th> pairs
  // 2) body rows of <td>label</td><td>value</td> (sometimes multiple pairs)
  $("table tr").each((_, tr) => {
    const kids = $(tr)
      .children("th, td")
      .toArray()
      .map((el) => {
        const $el = $(el);
        let text = cleanText($el.text());
        // Prefer real href for homepage cells
        const href = $el.find("a[href]").attr("href");
        if (href && /^https?:\/\//i.test(href) && text.includes(href)) {
          text = href;
        } else if (href && /^https?:\/\//i.test(href) && !text) {
          text = href;
        }
        return {
          tag: el.tagName?.toLowerCase?.() ?? el.name,
          text,
        };
      })
      .filter((c) => c.text);

    if (kids.length < 2) return;

    // Walk cells: if current looks like a label, next is value.
    for (let i = 0; i < kids.length; ) {
      const cur = kids[i];
      const next = kids[i + 1];
      if (!next) break;
      const isLabel =
        DETAIL_LABELS.has(cur.text) ||
        (cur.tag === "th" && cur.text.length <= 20 && !DETAIL_LABELS.has(next.text));
      if (isLabel) {
        setField(fields, cur.text, next.text);
        i += 2;
      } else {
        i += 1;
      }
    }
  });

  return {
    goodsCode,
    title: fields["상품명"] || fields["학자금·장학금명"] || fields["장학금명"] || null,
    organization: fields["운영기관명"] || null,
    productType: fields["상품구분"] || null,
    supportAmount: fields["지원금액"] || null,
    applyPeriod: fields["신청기간"] || fields["모집기간"] || null,
    homepageUrl: fields["홈페이지주소"] || null,
    fields,
    fieldCount: Object.keys(fields).length,
  };
}

function looksLikeLoginWall(html) {
  // Nav/footer often mention login; treat as blocked only when content is missing.
  const hasList = html.includes("tableList02") || /fn_goDtl\s*\(/.test(html);
  const hasDetailSignals =
    html.includes("getCstmDsgnGoodsDtl") ||
    html.includes("신청기간") ||
    html.includes("지원금액") ||
    html.includes("운영기관");
  const hardBlock =
    html.includes("서비스 이용자 등록/로그인이 필요한 서비스 입니다") ||
    (html.includes("오류가 발생했습니다") && html.includes("오류페이지"));
  if (hasList || hasDetailSignals) return false;
  return hardBlock;
}

async function fetchDetail({ goodsCode, cookie, csrf }) {
  const body = new URLSearchParams({
    beanName: "PTSMCstmDsgnGoodsSVC",
    methodName: "getCstmDsgnGoodsDtl",
    inputVOName:
      "kr.go.kosaf.portal.pt.sm.cstmdsgngoods.svc.PTSMCstmDsgnGoodsDtlSVO",
    forwardPage: "pt/sm/cstmdsgngoods/PTSMCstmDsgnGoods_02M",
    forwardOnlyFlag: "N",
    ignoreSession: "Y",
    cstmDsgnGoodsCd: goodsCode,
  });
  if (csrf) body.set("csrfTokenPortal", csrf);

  const res = await fetchText(`${ORIGIN}${ACTION_SAFE}`, {
    method: "POST",
    body: body.toString(),
    cookie,
  });

  return res;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();

  console.log(`[kosaf-poc] list page=${args.page} limit=${args.limit}`);

  const listUrl = buildListUrl(args.page);
  const listRes = await fetchText(listUrl);
  if (!listRes.ok) {
    throw new Error(`List fetch failed: HTTP ${listRes.status}`);
  }
  if (looksLikeLoginWall(listRes.text)) {
    throw new Error("List page hit login/error wall unexpectedly");
  }

  let cookie = mergeCookies("", listRes.setCookie);
  const csrf = extractCsrf(listRes.text);
  const lastPage = extractLastPage(listRes.text);
  const listItems = parseList(listRes.text);

  console.log(
    `[kosaf-poc] list ok items=${listItems.length} lastPage=${lastPage ?? "?"} csrf=${csrf ? "yes" : "no"}`,
  );

  const targets = args.code
    ? [{ goodsCode: args.code, ...(listItems.find((i) => i.goodsCode === args.code) ?? {}) }]
    : listItems.slice(0, args.limit);

  const details = [];
  for (const item of targets) {
    if (!item.goodsCode) continue;
    await sleep(DELAY_MS);
    console.log(`[kosaf-poc] detail ${item.goodsCode} …`);
    const detailRes = await fetchDetail({
      goodsCode: item.goodsCode,
      cookie,
      csrf,
    });
    cookie = mergeCookies(cookie, detailRes.setCookie);

    if (!detailRes.ok) {
      details.push({
        goodsCode: item.goodsCode,
        error: `HTTP ${detailRes.status}`,
      });
      continue;
    }
    if (looksLikeLoginWall(detailRes.text)) {
      details.push({ goodsCode: item.goodsCode, error: "login_wall" });
      continue;
    }

    const parsed = parseDetail(detailRes.text, item.goodsCode);
    if (!parsed.title && item.title) parsed.title = item.title;
    if (!parsed.organization && item.organization) {
      parsed.organization = item.organization;
    }
    details.push({
      list: item,
      detail: parsed,
    });
    console.log(
      `[kosaf-poc] detail ok fields=${parsed.fieldCount} title=${parsed.title ?? "(none)"} amount=${parsed.supportAmount ?? "-"}`,
    );
  }

  const payload = {
    source: "kosaf-public-integrated-search-university",
    startedAt,
    finishedAt: new Date().toISOString(),
    listUrl,
    page: args.page,
    lastPage,
    listItemCount: listItems.length,
    listItems,
    details,
    notes: [
      "PoC only — no DB write",
      "Public ignoreSession=Y endpoints",
      "Prefer polite delays; do not mass-crawl without review",
    ],
  };

  const outDir = path.resolve("exports/kosaf");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `kosaf-poc-${stamp}.json`);
  const latestPath = path.join(outDir, "kosaf-poc-latest.json");
  const listCsvPath = path.join(outDir, `kosaf-list-page${args.page}-${stamp}.csv`);
  const listCsvLatest = path.join(outDir, "kosaf-list-latest.csv");
  const detailCsvPath = path.join(outDir, `kosaf-detail-page${args.page}-${stamp}.csv`);
  const detailCsvLatest = path.join(outDir, "kosaf-detail-latest.csv");

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(latestPath, JSON.stringify(payload, null, 2), "utf8");

  const listCsv = toCsv(listItems, LIST_CSV_COLUMNS);
  fs.writeFileSync(listCsvPath, listCsv, "utf8");
  fs.writeFileSync(listCsvLatest, listCsv, "utf8");

  const detailRows = details.map(detailToCsvRow);
  const detailCsv = toCsv(detailRows, DETAIL_CSV_COLUMNS);
  fs.writeFileSync(detailCsvPath, detailCsv, "utf8");
  fs.writeFileSync(detailCsvLatest, detailCsv, "utf8");

  console.log(`[kosaf-poc] wrote ${outPath}`);
  console.log(`[kosaf-poc] wrote ${latestPath}`);
  console.log(`[kosaf-poc] wrote ${listCsvPath}`);
  console.log(`[kosaf-poc] wrote ${listCsvLatest}`);
  console.log(`[kosaf-poc] wrote ${detailCsvPath}`);
  console.log(`[kosaf-poc] wrote ${detailCsvLatest}`);
  console.log(
    `[kosaf-poc] summary list=${listItems.length} details=${details.filter((d) => !d.error).length}`,
  );
}

main().catch((err) => {
  console.error("[kosaf-poc] failed:", err.message ?? err);
  process.exitCode = 1;
});
