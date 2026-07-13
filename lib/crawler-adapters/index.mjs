function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function shouldUpgradeHttpToHttps(base) {
  try {
    // Keep http when the source itself is http-only (broken/mismatched TLS).
    return new URL(base).protocol === "https:";
  } catch {
    return true;
  }
}

function resolveUrlWithHttps(value, listUrl, baseUrl) {
  const input = cleanText(value).replace(/&amp;/gi, "&");
  if (!input) return "";
  if (/^javascript:/i.test(input)) return "";
  // Bare fragment placeholders (e.g. `#`, `#a`, `#none`) are used by many
  // onclick-driven boards as a dummy href with no real navigation target.
  // Resolving them would otherwise produce a truthy-but-useless URL (the
  // list page itself) that short-circuits the onclick/script-based
  // extraction fallbacks below.
  if (/^#/.test(input)) return "";
  try {
    const resolved = new URL(input, listUrl);
    if (resolved.protocol === "http:" && shouldUpgradeHttpToHttps(listUrl)) {
      resolved.protocol = "https:";
    }
    return resolved.toString();
  } catch {
    try {
      if (!baseUrl) return "";
      const resolved = new URL(input, baseUrl);
      if (resolved.protocol === "http:" && shouldUpgradeHttpToHttps(baseUrl)) {
        resolved.protocol = "https:";
      }
      return resolved.toString();
    } catch {
      return "";
    }
  }
}

function canonicalizeResolvedNoticeUrl(resolvedUrl, source) {
  if (!resolvedUrl) return "";
  try {
    const target = new URL(resolvedUrl);
    target.hash = "";
    for (const key of [...target.searchParams.keys()]) {
      if (/^(utm_[a-z]+|fbclid|gclid)$/i.test(key)) target.searchParams.delete(key);
    }
    target.pathname = target.pathname.replace(/\/{2,}/g, "/");
    const sourceId = cleanText(source?.sourceId).toLowerCase();

    // KBoard document URLs are only usable detail URLs when both the document
    // mode and numeric uid are present. Keep the canonical identity minimal.
    if (sourceId === "cau_010") {
      const uid = cleanText(target.searchParams.get("uid"));
      if (target.searchParams.get("mod") !== "document" || !/^\d+$/.test(uid)) return "";
      target.search = "";
      target.searchParams.set("uid", uid);
      target.searchParams.set("mod", "document");
    }

    // The mechanical-engineering board exposes list sorting links on the same
    // path. Only a numeric wr_id is a detail URL; rejecting the rest preserves
    // the existing fail-closed behavior.
    if (sourceId === "cau_011") {
      const board = cleanText(target.searchParams.get("bo_table"));
      const writeId = cleanText(target.searchParams.get("wr_id"));
      if (board !== "sub5_1" || !/^\d+$/.test(writeId)) return "";
      target.search = "";
      target.searchParams.set("bo_table", board);
      target.searchParams.set("wr_id", writeId);
    }
    return target.toString();
  } catch {
    return "";
  }
}

export function canonicalizeNoticeUrl(value, source) {
  return canonicalizeResolvedNoticeUrl(
    resolveUrlWithHttps(value, source?.listUrl, source?.baseUrl),
    source,
  );
}

function resolveNoticeUrl(value, source) {
  const resolved = resolveUrlWithHttps(value, source?.listUrl, source?.baseUrl);
  const sourceId = cleanText(source?.sourceId).toLowerCase();
  return sourceId === "cau_010" || sourceId === "cau_011"
    ? canonicalizeResolvedNoticeUrl(resolved, source)
    : resolved;
}

function buildNoticeUrlFromScript(scriptText, source) {
  const script = cleanText(scriptText);
  if (!script) return "";

  const absoluteUrlMatch = script.match(/https?:\/\/[^\s"'()<>]+/i);
  if (absoluteUrlMatch?.[0]) {
    return resolveNoticeUrl(absoluteUrlMatch[0], source);
  }

  const relativePathMatch = script.match(/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/);
  if (relativePathMatch?.[0]) {
    return resolveNoticeUrl(relativePathMatch[0], source);
  }

  const idMatch = script.match(
    /(?:articleNo|boardNo|nttNo|idx|no|wr_id|b_idx|seq|uid)\s*[:=,'"]+\s*['"]?(\d+)/i,
  );
  if (idMatch?.[1]) {
    const target = new URL(source.listUrl);
    target.searchParams.set("articleNo", idMatch[1]);
    return resolveNoticeUrl(target.toString(), source);
  }

  // Legacy boards often expose only a bare `javascript:view('123')`-style
  // handler with no named parameter. Fall back to the first numeric argument
  // of a single-arg `view(...)`/`goView(...)` call so the notice at least
  // links back to a stable, ID-qualified URL. Scoped to functions whose name
  // contains "view" to avoid misreading unrelated UI handlers (e.g.
  // `show_sub(1)`, `slide(2)`) as article links.
  const viewCallMatch = script.match(/\bview\w*\(\s*['"]?(\d+)['"]?\s*\)/i);
  if (viewCallMatch?.[1]) {
    const target = new URL(source.listUrl);
    target.searchParams.set("articleNo", viewCallMatch[1]);
    return resolveNoticeUrl(target.toString(), source);
  }

  return "";
}

function applySourceSpecificAdapter(source, activeLinkNode) {
  const sourceId = cleanText(source.sourceId).toLowerCase();
  const onclick = cleanText(activeLinkNode?.attr("onclick"));
  if (!onclick) return "";

  // 중앙대 계열 게시판의 goView(123) 패턴 대응
  if (sourceId.startsWith("cau_")) {
    const goViewMatch = onclick.match(/goView\s*\(\s*['"]?(\d+)['"]?\s*\)/i);
    if (goViewMatch?.[1]) {
      const target = new URL(source.listUrl);
      target.searchParams.set("no", goViewMatch[1]);
      return resolveNoticeUrl(target.toString(), source);
    }
  }

  // 이화여대 계열 board viewArticle(123) 패턴 대응
  if (sourceId.startsWith("ewha_")) {
    const viewArticleMatch = onclick.match(/viewArticle\s*\(\s*['"]?(\d+)['"]?\s*\)/i);
    if (viewArticleMatch?.[1]) {
      const target = new URL(source.listUrl);
      target.searchParams.set("articleNo", viewArticleMatch[1]);
      return resolveNoticeUrl(target.toString(), source);
    }
  }

  // 서울시립대 www.uos.ac.kr 계열 board fnView('sortRank','articleId') 패턴 대응.
  // 목록 페이지가 실제 href 없이 onclick 핸들러만 노출하므로, 두 번째 인자
  // (게시물 고유 id)를 view.do의 seq 파라미터로 사용해 상세 URL을 구성한다.
  if (sourceId.startsWith("uos_")) {
    const fnViewMatch = onclick.match(/fnView\s*\(\s*['"]?\d+['"]?\s*,\s*['"]?(\d+)['"]?\s*\)/i);
    if (fnViewMatch?.[1]) {
      const target = new URL(source.listUrl);
      target.pathname = target.pathname.replace(/allList\.do$/, "view.do");
      target.searchParams.set("seq", fnViewMatch[1]);
      return resolveNoticeUrl(target.toString(), source);
    }
  }

  return "";
}

// ─────────────────────────────────────────────────────────────────
// List adapters
//
// 일부 사이트는 목록을 정적 HTML이 아니라 별도 JSON API로 제공합니다.
// 이런 소스는 CSV의 `adapter` 컬럼으로 전용 수집기를 지정해, 기본
// (cheerio 기반) 목록 파싱 대신 아래 어댑터가 목록 아이템을 생성합니다.
//
// 어댑터는 이미 완성된 목록 아이템 배열을 반환합니다.
//   [{ sourceId, sourceName, listUrl, noticeUrl, title, dateText, content }]
// 상세 본문은 어댑터가 채우므로, 크롤러는 어댑터 소스에 대해 별도 상세
// 요청(detail fetch)을 하지 않습니다.
// ─────────────────────────────────────────────────────────────────

// 중앙대 본부 포털(www.cau.ac.kr)은 "...Bot" 형태의 User-Agent 요청을
// 연결 종료(socket close)로 차단합니다. 어댑터형 CMS 소스는 목록 API가
// 정상 응답하도록 일반 브라우저 UA를 사용합니다.
const DEFAULT_ADAPTER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

async function fetchWithRetry(fetchImpl, url, init, retries = 3, backoffMs = 1000) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetchImpl(url, init);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs * (attempt + 1)));
      }
    }
  }
  throw lastError ?? new Error("fetch failed");
}

function extractSendFormInputs(html) {
  const formMatch = String(html ?? "").match(
    /<form[^>]*id=["']sendForm["'][\s\S]*?<\/form>/i,
  );
  const scope = formMatch ? formMatch[0] : String(html ?? "");
  const inputs = scope.match(/<input\b[^>]*>/gi) ?? [];
  const values = {};
  for (const tag of inputs) {
    const name = tag.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!name) continue;
    const value = tag.match(/\bvalue\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
    values[name] = value;
  }
  return values;
}

function parseKstDateLoose(value) {
  const text = cleanText(value);
  const match = text.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!match) return null;
  const parsed = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * 중앙대 통합 CMS(FR_CON) 게시판 목록 어댑터.
 *
 * 목록 페이지(index.do)의 숨은 폼(#sendForm) 값을 읽어 그대로
 * `/ajax/FR_SVC/BBSViewList2.do`에 POST하여 JSON 목록을 페이지 단위로
 * 수집합니다. list_url이 어떤 탭(장학 등)이냐에 따라 폼 값이 카테고리를
 * 이미 한정하므로, 어댑터는 사이트 구조를 하드코딩하지 않습니다.
 */
export async function fetchCauPortalList(source, options = {}) {
  const {
    lookbackDays = 31,
    allowUndated = false,
    maxItems = 150,
    maxPages = 40,
    fetchImpl = fetch,
    now = new Date(),
  } = options;

  const headers = {
    "user-agent": DEFAULT_ADAPTER_USER_AGENT,
    accept: "text/html,application/xhtml+xml,application/json",
  };

  const pageRes = await fetchWithRetry(fetchImpl, source.listUrl, { headers });
  const pageHtml = await pageRes.text();
  const form = extractSendFormInputs(pageHtml);

  const origin = new URL(source.listUrl).origin;
  const apiUrl = `${origin}/ajax/FR_SVC/BBSViewList2.do`;
  const viewUrl = `${origin}/cms/FR_CON/BoardView.do`;
  const pagePerCnt = cleanText(form.pagePerCnt) || "15";
  const cutoff = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  const results = [];
  const seenBbsSeq = new Set();

  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    const body = new URLSearchParams({
      ...form,
      pageNo: String(pageNo),
      pagePerCnt,
    });

    const listRes = await fetchWithRetry(fetchImpl, apiUrl, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        referer: source.listUrl,
      },
      body: body.toString(),
    });

    const payload = await listRes.json();
    const list = Array.isArray(payload?.data?.list) ? payload.data.list : [];
    if (list.length === 0) break;

    let newestNonPinned = null;
    let addedThisPage = 0;

    for (const item of list) {
      const bbsSeq = cleanText(item.BBS_SEQ);
      if (!bbsSeq || seenBbsSeq.has(bbsSeq)) continue;

      const title = cleanText(item.SUBJECT);
      if (!title) continue;

      const dateText = cleanText(item.WRITE_DATE) || cleanText(item.WRITE_DT);
      const parsedDate = parseKstDateLoose(dateText);
      const isPinned = cleanText(item.NOTICE_YN).toUpperCase() === "Y";

      if (!isPinned && parsedDate && (!newestNonPinned || parsedDate > newestNonPinned)) {
        newestNonPinned = parsedDate;
      }

      const withinLookback = parsedDate
        ? parsedDate >= cutoff && parsedDate <= now
        : allowUndated;
      if (!withinLookback) continue;

      const linksOut = cleanText(item.LINK_URL_YN).toUpperCase() === "Y";
      const linkUrl = cleanText(item.LINK_URL);
      let noticeUrl = "";
      if (linksOut && linkUrl) {
        noticeUrl = resolveUrlWithHttps(linkUrl, source.listUrl, source.baseUrl);
      }
      if (!noticeUrl) {
        const target = new URL(viewUrl);
        if (form.MENU_ID) target.searchParams.set("MENU_ID", form.MENU_ID);
        if (form.SITE_NO) target.searchParams.set("SITE_NO", form.SITE_NO);
        if (form.BOARD_SEQ) target.searchParams.set("BOARD_SEQ", form.BOARD_SEQ);
        target.searchParams.set("BBS_SEQ", bbsSeq);
        noticeUrl = target.toString();
      }
      if (!noticeUrl) continue;

      seenBbsSeq.add(bbsSeq);

      const categoryLabel = [cleanText(item.CATEGORY_NM1), cleanText(item.CATEGORY_NM2)]
        .filter(Boolean)
        .join("/");
      const writer = cleanText(item.WRITER_NM);
      const content = [categoryLabel ? `[${categoryLabel}]` : "", writer]
        .filter(Boolean)
        .join(" ");

      results.push({
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        listUrl: source.listUrl,
        noticeUrl,
        title,
        dateText,
        detailDate: dateText,
        content,
      });
      addedThisPage += 1;

      if (results.length >= maxItems) break;
    }

    if (results.length >= maxItems) break;

    // 상단 고정 공지를 제외한 최신 글이 이미 lookback을 벗어났고, 이번
    // 페이지에서 새로 담은 글이 없으면 이후 페이지는 더 오래된 글이므로 중단.
    const pageIsStale =
      newestNonPinned !== null && newestNonPinned < cutoff && addedThisPage === 0;
    if (pageNo > 1 && pageIsStale) break;
    if (addedThisPage === 0 && pageNo > 1) break;
  }

  return results;
}

const LIST_ADAPTERS = {
  cau_portal: fetchCauPortalList,
};

export function getListAdapter(name) {
  const key = cleanText(name).toLowerCase();
  if (!key) return null;
  return LIST_ADAPTERS[key] ?? null;
}

export function extractNoticeUrlFromLinkNode(source, activeLinkNode) {
  const href = activeLinkNode?.attr("href") ?? "";
  const onclick = activeLinkNode?.attr("onclick") ?? "";
  const dataHref =
    activeLinkNode?.attr("data-href") ??
    activeLinkNode?.attr("data-url") ??
    activeLinkNode?.attr("data-link") ??
    "";

  const sourceId = cleanText(source?.sourceId).toLowerCase();
  if (sourceId === "cau_010" || sourceId === "cau_011") {
    return (
      canonicalizeNoticeUrl(href, source) ||
      canonicalizeNoticeUrl(dataHref, source) ||
      applySourceSpecificAdapter(source, activeLinkNode) ||
      buildNoticeUrlFromScript(onclick, source) ||
      buildNoticeUrlFromScript(href, source)
    );
  }

  return (
    resolveNoticeUrl(href, source) ||
    resolveNoticeUrl(dataHref, source) ||
    applySourceSpecificAdapter(source, activeLinkNode) ||
    buildNoticeUrlFromScript(onclick, source) ||
    buildNoticeUrlFromScript(href, source)
  );
}
