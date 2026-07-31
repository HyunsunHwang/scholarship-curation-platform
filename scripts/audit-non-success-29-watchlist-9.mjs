/**
 * Read-only, bounded audit for current non-success sources and coverage-zero
 * watchlist sources. It never invokes the crawler, provider, or database.
 * Usage: node scripts/audit-non-success-29-watchlist-9.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { load as loadHtml } from "cheerio";

const OUT = "reports/university-beta";
const EVIDENCE = path.join(OUT, "non-success-29-watchlist-9-evidence");
const NON_SUCCESS = new Set(["network_error", "timeout", "http_error", "partial", "failed"]);
const DETAIL = /(?:artclView|bbsView|boardView|view\.do|mode=view|articleNo=|ntt(?:Id|No|Sn)=|wr_id=|(?:idx|seq|no)=\d+|artclNo=|boardSeq=|b_idx=|detail)/iu;
const LOGIN = /로그인|log\s*in|sign\s*in|sso|인증이\s*필요|회원만|통합로그인/iu;
const EMPTY = /등록된\s*게시물이\s*없습니다|게시물이\s*없습니다|검색결과가\s*없습니다|no\s*data|결과가\s*없습니다/iu;
const DATE = /(?:20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2})/gu;
const NOW = new Date();

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function writeJson(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function clean(value) { return String(value ?? "").replace(/\s+/gu, " ").trim(); }
function esc(value) { return String(value ?? "").replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;"); }

function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quote = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') { if (quote && text[i + 1] === '"') { cell += ch; i += 1; } else quote = !quote; }
    else if (ch === "," && !quote) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quote) { if (ch === "\r" && text[i + 1] === "\n") i += 1; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (row.length || cell) { row.push(cell); rows.push(row); }
  const [headers, ...data] = rows;
  return data.map((values) => Object.fromEntries(headers.map((key, index) => [key, values[index] ?? ""])));
}

function toCsv(rows) {
  const headers = Object.keys(rows[0] ?? {});
  const value = (input) => { const raw = typeof input === "object" && input !== null ? JSON.stringify(input) : String(input ?? ""); return /[",\n\r]/u.test(raw) ? `"${raw.replace(/"/gu, '""')}"` : raw; };
  return `${headers.join(",")}\n${rows.map((row) => headers.map((key) => value(row[key])).join(",")).join("\n")}\n`;
}

function parseDate(value) {
  const match = clean(value).match(/(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/u);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function decode(buffer, contentType) {
  const charset = /charset\s*=\s*([^;\s]+)/iu.exec(contentType ?? "")?.[1]?.replace(/["']/gu, "") ?? "utf-8";
  try { return { charset, text: new TextDecoder(charset).decode(buffer) }; } catch { return { charset: "utf-8-fallback", text: new TextDecoder().decode(buffer) }; }
}

async function requestTrace(startUrl, { timeoutMs = 15000, maxRedirects = 8 } = {}) {
  const chain = []; let url = startUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const started = Date.now();
    try {
      const response = await fetch(url, {
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ScholarshipSourceAudit/1.0; +https://janghakssam.com)", Accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const location = response.headers.get("location");
      chain.push({ url, status: response.status, location });
      if ([301, 302, 303, 307, 308].includes(response.status) && location && hop < maxRedirects) { url = new URL(location, url).href; continue; }
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") ?? "";
      const decoded = decode(buffer, contentType);
      return { ok: true, start_url: startUrl, final_url: response.url || url, status: response.status, headers: Object.fromEntries(response.headers.entries()), content_type: contentType, charset: decoded.charset, response_size: buffer.length, response_time_ms: Date.now() - started, redirect_chain: chain, text: decoded.text };
    } catch (error) {
      return { ok: false, start_url: startUrl, final_url: url, status: null, headers: {}, content_type: null, charset: null, response_size: 0, response_time_ms: Date.now() - started, redirect_chain: chain, error: clean(error?.name || error?.message || error), text: "" };
    }
  }
  return { ok: false, start_url: startUrl, final_url: url, status: null, headers: {}, content_type: null, charset: null, response_size: 0, response_time_ms: 0, redirect_chain: chain, error: "redirect_limit", text: "" };
}

function pageObservation(trace, source) {
  const html = trace.text ?? ""; const $ = loadHtml(html);
  const anchors = []; const onclicks = []; const data = []; const samples = [];
  $("a[href], a[onclick], [data-id], [data-url], [data-href]").each((_, element) => {
    const el = $(element); const href = clean(el.attr("href")); const onclick = clean(el.attr("onclick"));
    const title = clean(el.text()); const datum = clean(el.attr("data-id") || el.attr("data-url") || el.attr("data-href"));
    if (href) anchors.push({ href, title }); if (onclick) onclicks.push(onclick); if (datum) data.push(datum);
    if ((DETAIL.test(href) || /(?:goDetail|goView|fnView|jf_view|detail)/iu.test(onclick)) && samples.length < 5) samples.push({ href, onclick, data: datum, title });
  });
  const text = clean($.text());
  const rows = $("tbody tr, .board-list li, .board_list li, .notice-list li, .list-wrap li").length;
  const scripts = $("script").map((_, el) => $(el).html() || "").get().join(" ");
  const dates = [...text.matchAll(DATE)].map((match) => ({ raw: match[0], value: parseDate(match[0]) })).filter((item) => item.value);
  const host = (() => { try { return new URL(trace.final_url || source.listUrl).hostname; } catch { return ""; } })();
  const baseHost = (() => { try { return new URL(source.baseUrl || source.listUrl).hostname; } catch { return ""; } })();
  const title = clean($("title").first().text());
  return {
    official_university_domain: Boolean(host && baseHost && (host === baseHost || host.endsWith(`.${baseHost}`) || baseHost.endsWith(`.${host}`))),
    official_central_board: /장학|scholarship|학생지원|학생처/iu.test(`${source.sourceName} ${title} ${text.slice(0, 4000)}`),
    page_title: title || null,
    visible_notice_list: samples.length > 0 || rows > 0,
    visible_notice_count_sample: Math.min(Math.max(samples.length, rows), 99),
    visible_recent_notice_sample: samples[0]?.title || null,
    empty_board_message: EMPTY.test(text),
    login_required: LOGIN.test(text),
    captcha_or_waf: /captcha|cloudflare|access denied|웹방화벽|waf/iu.test(text),
    iframe_present: $("iframe").length > 0,
    iframe_src: clean($("iframe").first().attr("src")) || null,
    javascript_rendered: /__NEXT_DATA__|__NUXT__|react|vue|webpack/iu.test(scripts),
    list_rows_detected: rows,
    selector_matches: source.listItemSelector ? (() => { try { return $(source.listItemSelector).length; } catch { return -1; } })() : null,
    anchor_candidates: anchors.filter((item) => DETAIL.test(item.href)).length,
    onclick_candidates: onclicks.filter((item) => /(?:goDetail|goView|fnView|jf_view|detail)/iu.test(item)).length,
    data_attribute_candidates: data.length,
    hidden_form_present: $("form input[type=hidden], form[method=post]").length > 0,
    xhr_endpoint_found: /(?:ajax|fetch\(|xmlhttprequest|api\/|\.json)/iu.test(scripts),
    post_request_required: /method=["']?post|\.post\(|ajax\([^)]*type\s*:\s*["']POST/iu.test(`${html} ${scripts}`),
    sample_notice_title: samples[0]?.title || null,
    sample_notice_url_or_event: samples[0]?.href || samples[0]?.onclick || samples[0]?.data || null,
    candidate: samples[0] || null,
    dates,
  };
}

async function detailObservation(listTrace, observation) {
  const href = observation.candidate?.href;
  if (!href || /^(?:javascript:|#)/iu.test(href)) return { sample_detail_url: null, sample_detail_title: null, title_detail_identity_verified: false, detail_trace: null };
  let url; try { url = new URL(href, listTrace.final_url).href; } catch { return { sample_detail_url: null, sample_detail_title: null, title_detail_identity_verified: false, detail_trace: null }; }
  const trace = await requestTrace(url, { timeoutMs: 15000 });
  const title = trace.ok ? clean(loadHtml(trace.text)("title").first().text()) : null;
  const identity = Boolean(observation.sample_notice_title && trace.ok && clean(trace.text).includes(observation.sample_notice_title));
  return { sample_detail_url: trace.final_url || url, sample_detail_title: title || null, title_detail_identity_verified: identity, detail_trace: trace };
}

function stageFor(trace, page, detail) {
  if (!trace.ok) return /timeout/iu.test(trace.error) ? "request_timeout" : /dns|enotfound/iu.test(trace.error) ? "dns_resolution" : "connection_reset";
  if (trace.status === 429) return "rate_limit_429";
  if (trace.status === 403) return "http_403";
  if (trace.status === 401 || page.login_required) return "login_or_auth";
  if (trace.status === 404) return "wrong_or_stale_source_url";
  if (page.iframe_present && !page.visible_notice_list) return "iframe_resolution";
  if (page.post_request_required || page.xhr_endpoint_found) return "xhr_or_post_required";
  if (page.onclick_candidates && !detail.title_detail_identity_verified) return "javascript_event_resolution";
  if (page.visible_notice_list && !page.anchor_candidates && !page.onclick_candidates) return "link_extraction";
  if (page.anchor_candidates && !detail.title_detail_identity_verified) return "detail_fetch";
  if (page.empty_board_message) return "actual_empty_board";
  return "unknown";
}

function rootCause(trace, page, detail) {
  if (!trace.ok) return /timeout/iu.test(trace.error) ? "temporary_timeout_or_connection_failure" : "temporary_dns_or_tls_failure";
  if (trace.status === 429) return "confirmed_rate_limit";
  if (trace.status === 403) return "confirmed_http_403";
  if (trace.status === 401 || page.login_required) return "confirmed_login_required";
  if (page.captcha_or_waf) return "confirmed_waf_or_captcha";
  if (trace.status === 404) return "wrong_or_stale_list_url";
  if (page.iframe_present && !page.visible_notice_list) return "iframe_source_resolution_required";
  if (page.post_request_required || page.xhr_endpoint_found) return "public_xhr_or_post_adapter_required";
  if (page.onclick_candidates && !detail.title_detail_identity_verified) return "recoverable_shared_adapter_gap";
  if (page.visible_notice_list && page.anchor_candidates && !detail.title_detail_identity_verified) return "recoverable_shared_parser_gap";
  if (page.visible_notice_list && detail.title_detail_identity_verified) return "recoverable_config_error";
  if (page.empty_board_message) return "actual_empty_board";
  return "unknown_requires_manual_browser_review";
}

function strategy(root) {
  const map = {
    recoverable_config_error: ["P0", "S", "목록과 상세가 공개되어 있으므로 selector 또는 URL pattern을 현재 구조에 맞춘다.", "crawler source config", "높음"],
    recoverable_shared_parser_gap: ["P0", "S", "공개 href 패턴을 generic parser의 detail URL 허용 규칙에 추가한다.", "shared parser URL-pattern rule", "높음"],
    recoverable_shared_adapter_gap: ["P1", "M", "목록의 공개 JavaScript event에서 게시글 식별자를 추출하는 공용 URL builder를 보완한다.", "shared crawler adapter", "중간"],
    public_xhr_or_post_adapter_required: ["P1", "M", "공개 목록 XHR 또는 POST 요청을 재현하는 제한된 adapter를 만든다.", "shared XHR/POST adapter", "중간"],
    iframe_source_resolution_required: ["P1", "S", "공개 iframe의 실제 목록 URL을 registry source로 분리한다.", "source config / iframe resolver", "중간"],
    wrong_or_stale_list_url: ["P2", "S", "공식 대학 사이트에서 중앙 장학 게시판의 replacement URL을 확인한 뒤 교체한다.", "source registry", "중간"],
    replacement_source_found: ["P2", "S", "확인된 공식 replacement URL로 source registry를 교체한다.", "source registry", "높음"],
    replacement_source_not_found: ["P2", "M", "공식 사이트 탐색을 추가로 수행하고 확인 전까지 beta 활성화를 보류한다.", "manual source research", "낮음"],
    confirmed_http_403: ["P3", "External", "차단 우회를 하지 않고 공식 공개 대체 게시판만 조사한다.", "external university policy", "낮음"],
    confirmed_login_required: ["P3", "External", "로그인 자동화 없이 공개 대체 장학 게시판을 찾고 없으면 beta에서 제외한다.", "external university policy", "낮음"],
    confirmed_waf_or_captcha: ["P3", "External", "CAPTCHA/WAF 우회 없이 학교에 공개 경로가 있는지 확인한다.", "external university policy", "낮음"],
    confirmed_rate_limit: ["P3", "External", "저빈도 재시도와 source별 backoff를 적용하고 다음 운영 주기에 재확인한다.", "transport policy", "중간"],
    temporary_dns_or_tls_failure: ["P3", "External", "출처별 재시도 큐에 남기고 정상 응답이 확인될 때만 활성화한다.", "transport retry policy", "낮음"],
    temporary_timeout_or_connection_failure: ["P3", "External", "출처별 저빈도 재시도 후 결과를 비교한다.", "transport retry policy", "중간"],
    actual_empty_board: ["P3", "S", "현재는 정상 0건으로 기록하고 다음 수집 주기에 다시 확인한다.", "monitoring only", "높음"],
    unknown_requires_manual_browser_review: ["P2", "L", "사람이 공식 페이지에서 목록과 상세 클릭 동작을 확인한 뒤 source별 adapter 여부를 결정한다.", "manual browser review", "낮음"],
  };
  const [priority, effort, action, target, probability] = map[root] ?? map.unknown_requires_manual_browser_review;
  return { priority, effort, recommended_action: action, exact_implementation_target: target, expected_recovery_probability: probability, fallback_strategy: priority === "P3" ? "beta 제외 후 다음 운영 주기 재확인" : "검증 실패 시 beta 활성화를 보류하고 수동 확인" };
}

function explain(source, root, page, detail) {
  const pageState = page.visible_notice_list ? "공지 목록 표본이 보입니다" : page.empty_board_message ? "빈 게시판 메시지가 보입니다" : "목록 표본을 확인하지 못했습니다";
  const detailState = detail.title_detail_identity_verified ? "표본 제목과 상세 페이지의 일치도 확인했습니다" : "상세 제목 일치는 아직 확인되지 않았습니다";
  const rootText = {
    recoverable_config_error: "학교 사이트 차단이 아니라 현재 crawler 설정이 페이지 구조를 충분히 반영하지 못한 경우입니다.",
    recoverable_shared_parser_gap: "공개 href는 있으나 현재 공통 URL pattern이 이를 후보 상세 URL로 받아들이지 못한 경우입니다.",
    recoverable_shared_adapter_gap: "제목 클릭이 JavaScript event에 의존해 공용 URL builder 보완이 필요합니다.",
    public_xhr_or_post_adapter_required: "공개 목록이 XHR 또는 POST로 생성되는 흔적이 있어 일반 HTML 추출만으로는 부족합니다.",
    confirmed_http_403: "일반 HTTP 접근도 403으로 거절되어 차단 우회 없이 공개 대체 경로를 찾아야 합니다.",
    confirmed_login_required: "목록 접근에 로그인 또는 인증이 요구되는 신호가 있어 beta 공개 source로 바로 쓰기 어렵습니다.",
    confirmed_rate_limit: "서버가 429로 응답해 URL이나 selector 문제가 아닌 요청 제한 상태입니다.",
    temporary_dns_or_tls_failure: "여러 저빈도 접근에서 HTTP 응답 이전 네트워크/TLS 문제가 반복됐습니다.",
    temporary_timeout_or_connection_failure: "응답 시간이 초과되거나 연결이 끊겨 현재는 안정적으로 수집할 수 없습니다.",
    wrong_or_stale_list_url: "현재 URL이 404 또는 오래된 경로여서 중앙 게시판 부재로 단정할 수 없습니다.",
    actual_empty_board: "현재 공개 페이지는 실제 빈 게시판으로 보이며, 다음 운영 주기에 다시 확인하는 것이 안전합니다.",
    unknown_requires_manual_browser_review: "페이지 구조만으로 제목 클릭 규칙을 확정하지 못해 사람이 브라우저에서 확인해야 합니다.",
  }[root] ?? "현재 관측만으로 원인을 확정할 수 없습니다.";
  return `${source.universityName}의 공식 URL을 저빈도로 재확인했습니다. ${pageState}. ${detailState} ${rootText}`;
}

function compactTrace(trace) { return { status: trace.status, final_url: trace.final_url, response_time_ms: trace.response_time_ms, response_size: trace.response_size, error: trace.error ?? null, redirect_chain: trace.redirect_chain }; }

async function probeSource(source, attemptCount) {
  const retries = [];
  for (let attempt = 0; attempt < attemptCount; attempt += 1) retries.push(await requestTrace(source.listUrl));
  const successful = retries.filter((item) => item.ok).sort((a, b) => (b.status ?? 0) - (a.status ?? 0));
  const trace = successful.find((item) => item.status >= 200 && item.status < 400) ?? successful[0] ?? retries[retries.length - 1];
  const page = pageObservation(trace, source); const detail = await detailObservation(trace, page);
  const root = rootCause(trace, page, detail); const plan = strategy(root); const stage = stageFor(trace, page, detail);
  return {
    source_id: source.sourceId, university_name: source.universityName, source_name: source.sourceName, list_url: source.listUrl, base_url: source.baseUrl,
    previous_outcome: source.previousOutcome, coherent_final_status: source.finalStatus, coherent_reason_code: source.reasonCode,
    dns_resolved: trace.ok || !/dns|enotfound/iu.test(trace.error ?? ""), tls_success: trace.ok || !/tls|certificate/iu.test(trace.error ?? ""),
    http_status: trace.status, redirect_chain: trace.redirect_chain, final_url: trace.final_url, content_type: trace.content_type, charset: trace.charset, response_size: trace.response_size, response_time_ms: trace.response_time_ms,
    retry_results: retries.map(compactTrace), browser_accessible: trace.ok && trace.status >= 200 && trace.status < 400, browser_result_summary: "브라우저와 같은 비인증 공개 HTTP 접근으로 관측; 최종 사람 브라우저 체크는 HTML에서 수행", browser_vs_crawler_difference: trace.ok && trace.status >= 200 && trace.status < 400 && source.finalStatus !== "success" ? "public_http_accessible_but_coherent_crawler_non_success" : "not_observed",
    ...page, sample_detail_url: detail.sample_detail_url, sample_detail_title: detail.sample_detail_title, title_detail_identity_verified: detail.title_detail_identity_verified,
    crawler_failure_stage: stage, root_cause: root, root_cause_confidence: root.startsWith("confirmed_") ? "high" : root.startsWith("recoverable_") ? "medium" : "low",
    human_explanation_ko: explain(source, root, page, detail), code_recoverable: /^recoverable_|iframe_|public_xhr/iu.test(root), config_only_fix: root === "recoverable_config_error" || root === "wrong_or_stale_list_url", shared_adapter_candidate: ["recoverable_shared_adapter_gap", "public_xhr_or_post_adapter_required"].includes(root), source_specific_adapter_required: root === "unknown_requires_manual_browser_review", browser_runtime_required: root === "unknown_requires_manual_browser_review", replacement_url_required: root === "wrong_or_stale_list_url", external_dependency: /^(confirmed_|temporary_)/u.test(root), beta_exclusion_recommended: plan.priority === "P3", ...plan,
    verification_method: "공식 목록에서 표본 제목과 생성/실제 상세 URL의 제목 일치 확인", analysis_fix_applied: false,
  };
}

function watchAnalysis(source, diagnostic) {
  const dates = diagnostic.dates ?? []; const ago120 = new Date(NOW); ago120.setUTCDate(ago120.getUTCDate() - 120); const ago365 = new Date(NOW); ago365.setUTCDate(ago365.getUTCDate() - 365);
  const sample = diagnostic.sample_notice_title; const known = dates.length; const look120 = dates.filter((item) => item.value >= ago120).length; const look365 = dates.filter((item) => item.value >= ago365).length;
  let zero = "still_uncertain"; let regression = false;
  if (diagnostic.empty_board_message || (diagnostic.visible_notice_count_sample === 0 && !sample)) zero = "true_empty_board";
  else if (known > 0 && look365 === 0) zero = "no_recent_posts";
  else if (diagnostic.visible_notice_list && known === 0) { zero = "undated_posts_filtered"; regression = true; }
  else if (diagnostic.visible_notice_list && look120 > 0) { zero = "current_false_zero"; regression = true; }
  else if (!diagnostic.browser_accessible) zero = "intermittent_server_response";
  return { source_id: source.sourceId, university_name: source.universityName, source_name: source.sourceName, list_url: source.listUrl, previous_observed: source.previousObserved, current_observed: source.currentObserved, live_visible_items: diagnostic.visible_notice_count_sample, latest_visible_notice_date: dates.sort((a, b) => b.value - a.value)[0]?.raw ?? null, latest_visible_notice_title: sample, lookback_120_count: look120, lookback_365_count: look365, allow_undated_count: look365 + Math.max(0, diagnostic.visible_notice_count_sample - known), zero_reason: zero, coverage_regression: regression, recommended_action: regression ? "날짜 필터·undated 처리·selector 결과를 source 단위로 재검증" : "다음 수집 주기에 정상 zero 여부를 다시 확인", human_explanation_ko: regression ? "현재 공개 목록에 항목 또는 최근 날짜 신호가 남아 있어 success-zero를 정상으로 보기 어렵습니다." : "현재 관측에서는 최근 장학 게시물이 없거나 빈 게시판 신호가 있어 정상 zero 가능성이 있습니다." };
}

function buildHtml(rows, summary) {
  const data = JSON.stringify(rows).replace(/</gu, "\\u003c");
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>대학 본부 장학공지 29+2+9 사람 검토</title><style>body{font-family:system-ui,sans-serif;background:#f6f7fb;color:#182230;margin:0}main{max-width:1240px;margin:auto;padding:24px}.summary,.card{background:#fff;border:1px solid #dce1eb;border-radius:12px;padding:16px;margin:12px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.metric{padding:10px;background:#f3f6fb;border-radius:8px}.filters{display:flex;gap:8px;flex-wrap:wrap}.filters button{border:1px solid #b8c2d3;background:#fff;border-radius:16px;padding:7px 10px}.card h2{font-size:17px;margin:0}.meta{color:#536174;font-size:13px;word-break:break-all}.tag{display:inline-block;background:#e9efff;padding:3px 7px;border-radius:10px;font-size:12px;margin:4px 4px 0 0}.warn{background:#fff0df}.check{display:flex;gap:12px;flex-wrap:wrap;font-size:13px;margin-top:12px}details{margin-top:10px}a{color:#2457b2}</style><main><h1>전국 대학 본부 장학공지 — hard non-success 29 + partial/degraded 2 + coverage watchlist 9</h1><p>세 cohort는 서로 다른 운영 상태입니다. 체크 항목은 이 브라우저의 localStorage에 저장되며 서버로 전송되지 않습니다.</p><section class="summary"><div class="grid">${Object.entries(summary).map(([k,v])=>`<div class="metric"><b>${esc(k)}</b><br>${esc(v)}</div>`).join("")}</div></section><section class="filters"><button data-filter="all">전체 40개</button><button data-filter="hard_non_success">Hard non-success</button><button data-filter="partial_degraded">Partial/degraded</button><button data-filter="coverage_watchlist">Coverage watchlist</button><button data-filter="P0">P0</button><button data-filter="P1">P1</button><button data-filter="P2">P2</button><button data-filter="P3">P3</button><button data-filter="recoverable">코드 복구 가능</button><button data-filter="external">외부 문제</button><button data-filter="manual">수동 확인 필요</button></section><section id="cards"></section></main><script>const rows=${data};const cards=document.querySelector('#cards');function key(id,n){return 'non-success-29-partial-2-watchlist-9:'+id+':'+n}function render(filter='all'){cards.innerHTML='';rows.filter(r=>filter==='all'||r.group===filter||r.priority===filter||(filter==='recoverable'&&r.code_recoverable)||(filter==='external'&&r.external_dependency)||(filter==='manual'&&r.browser_runtime_required)).forEach(r=>{const e=document.createElement('article');e.className='card';e.innerHTML='<h2>'+r.university_name+' <span class="tag">'+r.group+'</span></h2><p class="meta">'+r.source_id+' · '+r.current_status+'<br><a target="_blank" rel="noreferrer" href="'+r.list_url+'">공식 URL 열기</a></p><div><span class="tag">'+r.root_cause+'</span><span class="tag">'+r.priority+'</span><span class="tag">'+r.effort+'</span><span class="tag '+(r.beta_exclusion_recommended?'warn':'')+'">'+(r.beta_exclusion_recommended?'beta 제외 후보':'복구 검토')+'</span></div><p>'+r.human_explanation_ko+'</p><p><b>해결 전략:</b> '+r.recommended_action+'</p><p><b>최종 검증:</b> '+r.verification_method+'</p><div class="check">'+['공식 대학 본부 게시판이 맞음','목록이 실제로 보임','상세 글이 열림','원인 설명에 동의','해결 전략에 동의','추가 확인 필요'].map((label,i)=>'<label><input type="checkbox" data-id="'+r.source_id+'" data-n="'+i+'"> '+label+'</label>').join('')+'</div><details><summary>관측 증거</summary><pre>'+JSON.stringify(r.evidence,null,2)+'</pre></details>';cards.appendChild(e)});document.querySelectorAll('input[type=checkbox]').forEach(x=>{x.checked=localStorage.getItem(key(x.dataset.id,x.dataset.n))==='1';x.onchange=()=>localStorage.setItem(key(x.dataset.id,x.dataset.n),x.checked?'1':'0')})}document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>render(b.dataset.filter));render()</script></html>`;
}

function assert(condition, message) { if (!condition) throw new Error(message); }

async function main() {
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(EVIDENCE, { recursive: true });
  const final = readJson(path.join(OUT, "four-year-university-final.json")); const regression = readJson(path.join(OUT, "regression-rem1-vs-coherent.json"));
  const remRows = parseCsv(fs.readFileSync(path.join(OUT, "unresolved-51-remediation.csv"), "utf8"));
  const configRows = parseCsv(fs.readFileSync("data/notice-sources-four-year-univ.csv", "utf8"));
  const configById = new Map(configRows.map((row) => [row.source_id, row])); const previousById = new Map(remRows.map((row) => [row.source_id, row]));
  const current = final.perSource ?? []; assert(current.length === 188, `expected 188 coherent rows, got ${current.length}`);
  const normalize = (row) => { const config = configById.get(row.sourceId) ?? {}; const previous = previousById.get(row.sourceId) ?? {}; return { sourceId: row.sourceId, universityName: row.sourceName?.replace(/ 장학공지$/u, "") || config.source_name || row.sourceId, sourceName: row.sourceName || config.source_name || row.sourceId, listUrl: row.listUrl || config.list_url, baseUrl: config.base_url || row.listUrl, listItemSelector: config.list_item_selector || "", finalStatus: row.finalStatus, reasonCode: row.reasonCode || "", previousOutcome: previous.outcome || "", currentObserved: Number(row.crawledCount || 0), previousObserved: Number(previous.crawled_count || 0) }; };
  const operationalSuccess = (row) => ["success", "partial"].includes(row.finalStatus);
  const hardNonSuccess = current.filter((row) => row.enabled !== false && !operationalSuccess(row)).map(normalize); assert(hardNonSuccess.length === 29, `expected 29 hard non-success, got ${hardNonSuccess.length}`);
  const partialDegraded = current.filter((row) => row.enabled !== false && row.finalStatus === "partial").map(normalize); assert(partialDegraded.length === 2, `expected 2 partial/degraded, got ${partialDegraded.length}`);
  const watchRows = regression.groups?.with_items_to_zero_or_non_success?.rows ?? [];
  const currentById = new Map(current.map((row) => [row.sourceId, row]));
  const watch = watchRows.filter((row) => { const present = currentById.get(row.source_id); return row.previous_status === "success" && Number(row.previous_observed) > 0 && present?.finalStatus === "success" && Number(present.crawledCount) === 0; }).map((row) => ({ ...normalize(currentById.get(row.source_id)), previousObserved: Number(row.previous_observed), currentObserved: Number(row.current_observed) }));
  assert(watch.length === 9, `expected 9 watchlist rows, got ${watch.length}`); assert(!watch.some((item) => [...hardNonSuccess, ...partialDegraded].some((other) => other.sourceId === item.sourceId)), "baseline overlap detected");
  assert(!partialDegraded.some((item) => hardNonSuccess.some((other) => other.sourceId === item.sourceId)), "hard/partial overlap detected");
  const baselineRows = hardNonSuccess.map((item) => ({ source_id: item.sourceId, university_name: item.universityName, source_name: item.sourceName, list_url: item.listUrl, base_url: item.baseUrl, coherent_final_status: item.finalStatus, coherent_reason_code: item.reasonCode, previous_outcome: item.previousOutcome }));
  const partialRows = partialDegraded.map((item) => ({ source_id: item.sourceId, university_name: item.universityName, source_name: item.sourceName, list_url: item.listUrl, base_url: item.baseUrl, coherent_final_status: item.finalStatus, coherent_reason_code: item.reasonCode, current_observed: item.currentObserved }));
  const watchBaselineRows = watch.map((item) => ({ source_id: item.sourceId, university_name: item.universityName, source_name: item.sourceName, list_url: item.listUrl, previous_observed: item.previousObserved, current_observed: item.currentObserved, coherent_final_status: item.finalStatus }));
  fs.writeFileSync(path.join(OUT, "hard-non-success-29-baseline.csv"), toCsv(baselineRows)); writeJson(path.join(OUT, "hard-non-success-29-baseline.json"), { count: baselineRows.length, sources: baselineRows });
  fs.writeFileSync(path.join(OUT, "partial-degraded-2-baseline.csv"), toCsv(partialRows)); writeJson(path.join(OUT, "partial-degraded-2-baseline.json"), { count: partialRows.length, sources: partialRows });
  fs.writeFileSync(path.join(OUT, "with-items-to-zero-9-baseline.csv"), toCsv(watchBaselineRows)); writeJson(path.join(OUT, "with-items-to-zero-9-baseline.json"), { count: watchBaselineRows.length, sources: watchBaselineRows });
  const diagnostics = [];
  for (const [index, source] of [...hardNonSuccess, ...partialDegraded, ...watch].entries()) {
    const attempts = /timeout|network|429/iu.test(`${source.finalStatus} ${source.reasonCode}`) ? 3 : 2;
    console.error(`audit ${index + 1}/40 ${source.sourceId} attempts=${attempts}`);
    const diagnostic = await probeSource(source, attempts); diagnostics.push(diagnostic);
    const safe = { source_id: diagnostic.source_id, checked_at: new Date().toISOString(), transport: { http_status: diagnostic.http_status, final_url: diagnostic.final_url, redirect_chain: diagnostic.redirect_chain, response_time_ms: diagnostic.response_time_ms, response_size: diagnostic.response_size, retry_results: diagnostic.retry_results }, page: { page_title: diagnostic.page_title, visible_notice_list: diagnostic.visible_notice_list, empty_board_message: diagnostic.empty_board_message, login_required: diagnostic.login_required, captcha_or_waf: diagnostic.captcha_or_waf, iframe_present: diagnostic.iframe_present, javascript_rendered: diagnostic.javascript_rendered }, detail: { sample_notice_title: diagnostic.sample_notice_title, sample_detail_url: diagnostic.sample_detail_url, sample_detail_title: diagnostic.sample_detail_title, title_detail_identity_verified: diagnostic.title_detail_identity_verified }, note: "Screenshot omitted: read-only response summary is retained; no credentials or full HTML stored." };
    const dir = path.join(EVIDENCE, source.sourceId); fs.mkdirSync(dir, { recursive: true }); writeJson(path.join(dir, "response-summary.json"), safe);
  }
  const diagnosticsById = new Map(diagnostics.map((item) => [item.source_id, item])); const hardDiagnostics = hardNonSuccess.map((source) => diagnosticsById.get(source.sourceId)); const partialDiagnostics = partialDegraded.map((source) => diagnosticsById.get(source.sourceId)); const actionableDiagnostics = [...hardDiagnostics, ...partialDiagnostics]; const watchDiagnostics = watch.map((source) => diagnosticsById.get(source.sourceId)); const watchAnalysisRows = watch.map((source) => watchAnalysis(source, diagnosticsById.get(source.sourceId)));
  const compactDiagnostics = diagnostics.map(({ candidate, dates, ...row }) => row);
  fs.writeFileSync(path.join(OUT, "non-success-29-partial-2-watchlist-9-diagnostics.csv"), toCsv(compactDiagnostics)); writeJson(path.join(OUT, "non-success-29-partial-2-watchlist-9-diagnostics.json"), { count: compactDiagnostics.length, hard_non_success: hardDiagnostics, partial_degraded: partialDiagnostics, coverage_watchlist: watchDiagnostics });
  fs.writeFileSync(path.join(OUT, "with-items-to-zero-9-analysis.csv"), toCsv(watchAnalysisRows)); writeJson(path.join(OUT, "with-items-to-zero-9-analysis.json"), { count: watchAnalysisRows.length, sources: watchAnalysisRows });
  const strategies = actionableDiagnostics.map((row) => ({ source_id: row.source_id, university_name: row.university_name, cohort: partialDiagnostics.includes(row) ? "partial_degraded" : "hard_non_success", root_cause: row.root_cause, priority: row.priority, effort: row.effort, recommended_action: row.recommended_action, exact_implementation_target: row.exact_implementation_target, expected_recovery_probability: row.expected_recovery_probability, verification_method: row.verification_method, fallback_strategy: row.fallback_strategy, analysis_fix_applied: false }));
  fs.writeFileSync(path.join(OUT, "non-success-29-partial-2-solution-strategy.csv"), toCsv(strategies)); writeJson(path.join(OUT, "non-success-29-partial-2-solution-strategy.json"), { count: strategies.length, sources: strategies });
  const count = (rows, key) => Object.fromEntries([...new Set(rows.map((row) => row[key]))].sort().map((value) => [value, rows.filter((row) => row[key] === value).length]));
  const rootCounts = count(actionableDiagnostics, "root_cause"); const priorityCounts = count(actionableDiagnostics, "priority"); const zeroCounts = count(watchAnalysisRows, "zero_reason");
  const summary = `# Hard non-success 29, partial/degraded 2, and coverage-zero watchlist 9\n\nGenerated: ${new Date().toISOString()}\n\n## Root causes — hard non-success\n\n| Root cause | Count | Sources |\n|---|---:|---|\n${Object.entries(count(hardDiagnostics, "root_cause")).map(([key, value]) => `| ${key} | ${value} | ${hardDiagnostics.filter((row) => row.root_cause === key).map((row) => row.source_id).join(", ")} |`).join("\n")}\n\n## Root causes — partial/degraded\n\n| Root cause | Count | Sources |\n|---|---:|---|\n${Object.entries(count(partialDiagnostics, "root_cause")).map(([key, value]) => `| ${key} | ${value} | ${partialDiagnostics.filter((row) => row.root_cause === key).map((row) => row.source_id).join(", ")} |`).join("\n")}\n\n## Solution priority\n\n| Priority | Count | Sources |\n|---|---:|---|\n${Object.entries(priorityCounts).map(([key, value]) => `| ${key} | ${value} | ${actionableDiagnostics.filter((row) => row.priority === key).map((row) => row.source_id).join(", ")} |`).join("\n")}\n\n## Watchlist zero reasons\n\n| Reason | Count | Sources |\n|---|---:|---|\n${Object.entries(zeroCounts).map(([key, value]) => `| ${key} | ${value} | ${watchAnalysisRows.filter((row) => row.zero_reason === key).map((row) => row.source_id).join(", ")} |`).join("\n")}\n\n## Manual browser checks\n\n${actionableDiagnostics.filter((row) => row.browser_runtime_required).map((row) => `- ${row.source_id} ${row.university_name}: ${row.sample_notice_url_or_event || "event/url not resolved"}`).join("\n") || "- none"}\n`;
  fs.writeFileSync(path.join(OUT, "non-success-29-partial-2-watchlist-9-root-cause-summary.md"), summary);
  const toHtmlRow = (row, group) => ({ group, university_name: row.university_name, source_id: row.source_id, current_status: row.coherent_final_status, list_url: row.list_url, root_cause: row.root_cause, priority: row.priority, effort: row.effort, code_recoverable: row.code_recoverable, external_dependency: row.external_dependency, browser_runtime_required: row.browser_runtime_required, beta_exclusion_recommended: row.beta_exclusion_recommended, human_explanation_ko: row.human_explanation_ko, recommended_action: row.recommended_action, verification_method: row.verification_method, evidence: { http_status: row.http_status, final_url: row.final_url, page_title: row.page_title, list_visible: row.visible_notice_list, detail_verified: row.title_detail_identity_verified, crawler_failure_stage: row.crawler_failure_stage } });
  const htmlRows = [...hardDiagnostics.map((row) => toHtmlRow(row, "hard_non_success")), ...partialDiagnostics.map((row) => toHtmlRow(row, "partial_degraded")), ...watchAnalysisRows.map((row) => ({ group: "coverage_watchlist", university_name: row.university_name, source_id: row.source_id, current_status: "success_zero", list_url: row.list_url, root_cause: row.zero_reason, priority: row.coverage_regression ? "P0" : "P3", effort: "S", code_recoverable: row.coverage_regression, external_dependency: false, browser_runtime_required: row.zero_reason === "still_uncertain", beta_exclusion_recommended: false, human_explanation_ko: row.human_explanation_ko, recommended_action: row.recommended_action, verification_method: "최신 게시글 제목·날짜와 120/365일 lookback 결과 대조", evidence: { previous_observed: row.previous_observed, live_visible_items: row.live_visible_items, latest_visible_notice_date: row.latest_visible_notice_date, lookback_120_count: row.lookback_120_count, lookback_365_count: row.lookback_365_count, coverage_regression: row.coverage_regression } }))];
  const htmlSummary = { "Hard non-success: 현재 수집 실패": hardDiagnostics.length, "Partial/degraded: 일부 수집 성공, 완전성 미달": partialDiagnostics.length, "Coverage watchlist: 실행 성공, 기존보다 관측량 감소": watchAnalysisRows.length, "코드로 복구 가능": actionableDiagnostics.filter((row) => row.code_recoverable).length, "공용 adapter 필요": actionableDiagnostics.filter((row) => row.shared_adapter_candidate).length, "source 전용 adapter 필요": actionableDiagnostics.filter((row) => row.source_specific_adapter_required).length, "외부 차단·장애": actionableDiagnostics.filter((row) => row.external_dependency).length, "watchlist coverage regression": watchAnalysisRows.filter((row) => row.coverage_regression).length, "watchlist 정상 zero 후보": watchAnalysisRows.filter((row) => !row.coverage_regression).length };
  fs.writeFileSync(path.join(OUT, "non-success-29-partial-2-watchlist-9-human-review.html"), buildHtml(htmlRows, htmlSummary));
  assert(hardDiagnostics.length === 29, "hard diagnostics must be 29"); assert(partialDiagnostics.length === 2, "partial diagnostics must be 2"); assert(watchAnalysisRows.length === 9, "watch analysis must be 9"); assert(actionableDiagnostics.every((row) => row.human_explanation_ko && row.recommended_action && row.priority && row.effort), "actionable required field missing"); assert(watchAnalysisRows.every((row) => row.zero_reason), "watch zero reason missing");
  console.log(JSON.stringify({ hard_non_success: hardDiagnostics.length, partial_degraded: partialDiagnostics.length, watchlist: watchAnalysisRows.length, root_counts: rootCounts, priority_counts: priorityCounts, watch_counts: zeroCounts }, null, 2));
}

await main();
