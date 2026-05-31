import fs from "node:fs";
import path from "node:path";
import { load as loadHtml } from "cheerio";

const DEFAULT_KEYWORDS = [
  "장학",
  "장학금",
  "학자금",
  "등록금",
  "scholarship",
  "tuition",
  "financial aid",
];

const INPUT_CSV_PATH = process.argv[2] ?? "data/notice-sources.csv";
const OUTPUT_DIR = process.argv[3] ?? "exports/notices";
const STATE_FILE_PATH =
  process.argv[4] ?? ".crawler/scholarship-notice-state.json";
const REQUEST_TIMEOUT_MS = Number(process.env.CRAWL_TIMEOUT_MS ?? 15_000);
const DETAIL_FETCH_ENABLED = process.env.CRAWL_DETAIL_FETCH !== "false";
const LOOKBACK_DAYS = Number(process.env.CRAWL_LOOKBACK_DAYS ?? 31);
const ALLOW_UNDATED = process.env.CRAWL_ALLOW_UNDATED === "true";
const MAX_ITEMS_PER_SOURCE = Number(process.env.CRAWL_MAX_ITEMS_PER_SOURCE ?? 150);
const SOURCE_CONCURRENCY = Math.max(1, Number(process.env.CRAWL_SOURCE_CONCURRENCY ?? 1));
const IGNORE_SEEN = process.env.CRAWL_IGNORE_SEEN === "true";
const RUN_AT = new Date().toISOString();

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
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split("|")
    .map((piece) => piece.trim())
    .filter(Boolean);
}

function toBoolean(value, defaultValue = true) {
  if (!value) return defaultValue;
  const lowered = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(lowered)) return true;
  if (["false", "0", "no", "n"].includes(lowered)) return false;
  return defaultValue;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function extractDateLikeText(text) {
  const cleaned = cleanText(text);
  if (!cleaned) return "";

  const patterns = [
    /(\d{4}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{1,2})/,
    /(\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일)/,
    /(\d{2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{1,2})/,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) return cleanText(match[1]);
  }

  return "";
}

function extractListDateText(itemRoot, dateSelector) {
  const candidates = [];
  const seen = new Set();

  const pushCandidate = (value) => {
    const text = cleanText(value);
    if (!text || seen.has(text)) return;
    seen.add(text);
    candidates.push(text);
  };

  if (dateSelector) {
    itemRoot.find(dateSelector).each((_, node) => {
      pushCandidate(itemRoot.find(node).text());
    });
  }

  itemRoot.find("time, td, span, div").each((index, node) => {
    if (index > 40) return false;
    pushCandidate(itemRoot.find(node).text());
    return undefined;
  });

  for (const candidate of candidates) {
    const dateLike = extractDateLikeText(candidate);
    if (dateLike) return dateLike;
  }

  return "";
}

function readSourceConfig(csvPath) {
  const raw = fs.readFileSync(path.resolve(csvPath), "utf8").replace(/^\uFEFF/, "");
  const table = parseCsv(raw);
  if (table.length === 0) {
    throw new Error("Source CSV is empty.");
  }

  const [header, ...body] = table;
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const required = ["source_id", "source_name", "list_url"];
  for (const column of required) {
    if (!(column in index)) {
      throw new Error(`Missing required CSV column: ${column}`);
    }
  }

  return body
    .filter((row) => row.some((cell) => cleanText(cell)))
    .map((row) => ({
      sourceId: cleanText(row[index.source_id]),
      sourceName: cleanText(row[index.source_name]),
      listUrl: cleanText(row[index.list_url]),
      baseUrl: cleanText(row[index.base_url]),
      listItemSelector: cleanText(row[index.list_item_selector]),
      linkSelector: cleanText(row[index.link_selector]),
      titleSelector: cleanText(row[index.title_selector]),
      dateSelector: cleanText(row[index.date_selector]),
      detailContentSelector: cleanText(row[index.detail_content_selector]),
      detailDateSelector: cleanText(row[index.detail_date_selector]),
      noticeUrlPattern: cleanText(row[index.notice_url_pattern]),
      keywords: parseList(row[index.keywords]),
      enabled: toBoolean(row[index.enabled], true),
    }))
    .filter((source) => source.sourceId && source.sourceName && source.listUrl && source.enabled);
}

function resolveUrl(value, listUrl, baseUrl) {
  const input = cleanText(value);
  if (!input) return "";
  if (/^javascript:/i.test(input)) return "";
  try {
    return new URL(input, listUrl).toString();
  } catch {
    try {
      if (baseUrl) return new URL(input, baseUrl).toString();
      return "";
    } catch {
      return "";
    }
  }
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; ScholarshipNoticeBot/1.0; +https://example.org/bot)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function extractFromList(source, html) {
  const $ = loadHtml(html);
  const results = [];
  const seen = new Set();

  const pushResult = (node, index) => {
    const itemRoot = node ? $(node) : null;
    const linkNode = itemRoot
      ? source.linkSelector
        ? itemRoot.find(source.linkSelector).first()
        : itemRoot.find("a[href]").first()
      : null;
    const fallbackLinkNode = !itemRoot ? $("a[href]").eq(index) : null;
    const activeLinkNode = linkNode && linkNode.length ? linkNode : fallbackLinkNode;

    const href = activeLinkNode?.attr("href") ?? "";
    const noticeUrl = resolveUrl(href, source.listUrl, source.baseUrl);
    if (!noticeUrl || seen.has(noticeUrl)) return;

    const titleRaw = itemRoot
      ? source.titleSelector
        ? itemRoot.find(source.titleSelector).first().text()
        : activeLinkNode?.text() ?? itemRoot.text()
      : activeLinkNode?.text() ?? "";
    const title = cleanText(titleRaw);
    if (!title) return;

    const dateText = itemRoot ? extractListDateText(itemRoot, source.dateSelector) : "";

    seen.add(noticeUrl);
    results.push({
      sourceId: source.sourceId,
      sourceName: source.sourceName,
      listUrl: source.listUrl,
      noticeUrl,
      title,
      dateText,
    });
  };

  if (source.listItemSelector) {
    $(source.listItemSelector).each((index, node) => pushResult(node, index));
  } else {
    $("a[href]").each((index) => pushResult(null, index));
  }

  if (source.noticeUrlPattern) {
    const pattern = new RegExp(source.noticeUrlPattern);
    return results.filter((item) => pattern.test(item.noticeUrl));
  }
  return results;
}

function containsScholarshipKeyword(text, keywords) {
  const normalized = cleanText(text).toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function trimItems(items, maxItems) {
  if (!Number.isFinite(maxItems) || maxItems <= 0) return items;
  return items.slice(0, maxItems);
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await mapper(items[current], current);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function parseNoticeDate(rawText) {
  const text = cleanText(rawText);
  if (!text) return null;

  const patterns = [
    /(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/,
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/,
    /(\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    let year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year < 100) year += 2000;
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      continue;
    }

    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(parsed.getTime())) continue;
    return parsed;
  }

  return null;
}

function isWithinLookback(parsedDate, days) {
  if (!parsedDate) return false;
  const now = new Date();
  const minDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return parsedDate >= minDate && parsedDate <= now;
}

async function enrichDetail(source, item) {
  if (!DETAIL_FETCH_ENABLED) return item;

  try {
    const detailHtml = await fetchHtml(item.noticeUrl);
    const $detail = loadHtml(detailHtml);
    const content = source.detailContentSelector
      ? cleanText($detail(source.detailContentSelector).first().text())
      : "";
    const detailDate = source.detailDateSelector
      ? cleanText($detail(source.detailDateSelector).first().text())
      : "";
    return {
      ...item,
      content,
      detailDate,
    };
  } catch (error) {
    return {
      ...item,
      detailFetchError: String(error?.message ?? error),
    };
  }
}

function loadState(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return { seen: {} };
  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || typeof parsed.seen !== "object") {
    return { seen: {} };
  }
  return parsed;
}

function escapeCsvCell(value) {
  const text = cleanText(value ?? "");
  const escaped = text.replace(/"/g, "\"\"");
  if (/[",\n\r]/.test(escaped)) return `"${escaped}"`;
  return escaped;
}

function formatKstDate(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replace(/-/g, "");
}

async function run() {
  const sources = readSourceConfig(INPUT_CSV_PATH);
  const state = loadState(STATE_FILE_PATH);
  const seen = { ...state.seen };
  const crawled = [];
  const allMatched = [];
  const allNew = [];
  const stats = [];

  const processed = await mapLimit(sources, SOURCE_CONCURRENCY, async (source) => {
    try {
      const listHtml = await fetchHtml(source.listUrl);
      const listItems = trimItems(extractFromList(source, listHtml), MAX_ITEMS_PER_SOURCE);
      const detailItems = [];
      if (DETAIL_FETCH_ENABLED) {
        for (const item of listItems) {
          // Small pacing to reduce load on university websites.
          await new Promise((resolve) => setTimeout(resolve, 250));
          detailItems.push(await enrichDetail(source, item));
        }
      } else {
        detailItems.push(...listItems);
      }

      const keywords = source.keywords.length > 0 ? source.keywords : DEFAULT_KEYWORDS;
      const matched = detailItems
        .map((item) => {
          const parsedDate =
            parseNoticeDate(item.detailDate) ??
            parseNoticeDate(item.dateText) ??
            parseNoticeDate(item.title);
          return {
            ...item,
            parsedDate: parsedDate ? parsedDate.toISOString().slice(0, 10) : "",
          };
        })
        .filter((item) =>
          containsScholarshipKeyword(
            [item.title, item.dateText, item.detailDate, item.content].filter(Boolean).join(" "),
            keywords,
          ),
        )
        .filter((item) => {
          const parsed = item.parsedDate ? new Date(`${item.parsedDate}T00:00:00.000Z`) : null;
          if (!parsed && ALLOW_UNDATED) return true;
          return isWithinLookback(parsed, LOOKBACK_DAYS);
        });
      return {
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        detailItems,
        matched,
        error: "",
      };
    } catch (error) {
      return {
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        error: String(error?.message ?? error),
        detailItems: [],
        matched: [],
      };
    }
  });

  for (const result of processed) {
    if (result.error) {
      stats.push({
        sourceId: result.sourceId,
        sourceName: result.sourceName,
        crawledCount: 0,
        matchedCount: 0,
        newCount: 0,
        error: result.error,
      });
      console.log(`source=${result.sourceId} error=${result.error}`);
      continue;
    }

    const newlyDiscovered = IGNORE_SEEN
      ? result.matched
      : result.matched.filter((item) => !seen[item.noticeUrl]);
    if (!IGNORE_SEEN) {
      for (const notice of newlyDiscovered) {
        seen[notice.noticeUrl] = RUN_AT;
      }
    }

    crawled.push(...result.detailItems);
    allMatched.push(...result.matched);
    allNew.push(...newlyDiscovered);
    stats.push({
      sourceId: result.sourceId,
      sourceName: result.sourceName,
      crawledCount: result.detailItems.length,
      matchedCount: result.matched.length,
      newCount: newlyDiscovered.length,
    });
    console.log(
      `source=${result.sourceId} crawled=${result.detailItems.length} matched=${result.matched.length} new=${newlyDiscovered.length}`,
    );
  }

  const kstDate = formatKstDate();
  const resolvedOutputDir = path.resolve(OUTPUT_DIR);
  const resolvedStatePath = path.resolve(STATE_FILE_PATH);
  fs.mkdirSync(resolvedOutputDir, { recursive: true });
  fs.mkdirSync(path.dirname(resolvedStatePath), { recursive: true });

  const report = {
    runAt: RUN_AT,
    input: path.resolve(INPUT_CSV_PATH),
    totals: {
      sourceCount: sources.length,
      crawledCount: crawled.length,
      matchedCount: allMatched.length,
      newCount: allNew.length,
      knownCount: Object.keys(seen).length,
      lookbackDays: LOOKBACK_DAYS,
      allowUndated: ALLOW_UNDATED,
      sourceConcurrency: SOURCE_CONCURRENCY,
      ignoreSeen: IGNORE_SEEN,
    },
    perSource: stats,
    newNotices: allNew,
  };

  const jsonPath = path.join(resolvedOutputDir, `scholarship-notices-${kstDate}.json`);
  const latestJsonPath = path.join(resolvedOutputDir, "scholarship-notices-latest.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(latestJsonPath, JSON.stringify(report, null, 2), "utf8");

  const csvHeader = [
    "run_at",
    "source_id",
    "source_name",
    "title",
    "notice_url",
    "date_text",
    "detail_date",
    "parsed_date",
  ];
  const csvLines = [
    csvHeader.join(","),
    ...allNew.map((row) =>
      [
        RUN_AT,
        row.sourceId,
        row.sourceName,
        row.title,
        row.noticeUrl,
        row.dateText ?? "",
        row.detailDate ?? "",
        row.parsedDate ?? "",
      ]
        .map((cell) => escapeCsvCell(cell))
        .join(","),
    ),
  ];
  const csvPath = path.join(resolvedOutputDir, `scholarship-notices-new-${kstDate}.csv`);
  fs.writeFileSync(csvPath, `\uFEFF${csvLines.join("\r\n")}`, "utf8");

  fs.writeFileSync(
    resolvedStatePath,
    JSON.stringify(
      {
        updatedAt: RUN_AT,
        seen,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`sources=${sources.length}`);
  console.log(`crawled=${crawled.length}`);
  console.log(`matched=${allMatched.length}`);
  console.log(`new=${allNew.length}`);
  console.log(`json=${jsonPath}`);
  console.log(`csv=${csvPath}`);
  console.log(`state=${resolvedStatePath}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
