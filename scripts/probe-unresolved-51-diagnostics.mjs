/**
 * Deep-probe all unresolved-51 sources: HTTP, redirects, HTML structure,
 * selectors, onclick, iframe, JS signals. Writes unresolved-51-diagnostics.json
 *
 * Usage: node scripts/probe-unresolved-51-diagnostics.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { load as loadHtml } from "cheerio";

const OUT = "reports/university-beta";
const baseline = JSON.parse(
  fs.readFileSync(path.join(OUT, "unresolved-51-baseline.json"), "utf8")
).sources;

const DETAIL_HINT =
  /artclView\.do|bbsView\.do|boardView\.do|view\.do|mode=view|articleNo=|nttId=|nttNo=|wr_id=|uid=|[?&]idx=\d+|[?&]seq=\d+|b_idx=\d+|artclNo=/i;
const LOGIN_HINT = /로그인|login|sign\s*in|sso|인증이\s*필요|회원만/i;
const EMPTY_HINT =
  /등록된\s*게시물이\s*없습니다|게시물이\s*없습니다|검색결과가\s*없습니다|no\s*data|결과가\s*없습니다/i;
const JS_HINT = /__NEXT_DATA__|ng-app|vue\.js|react|webpack|window\.__NUXT__/i;

function detectCms(url, html) {
  const u = url.toLowerCase();
  const h = html.toLowerCase();
  if (u.includes("artcllist.do") || h.includes("jf_viewartcl")) return "jiniworks_artcl";
  if (u.includes("subview.do")) return "jiniworks_subview";
  if (u.includes("selectbbsnttlist.do") || u.includes("bbsno=")) return "egovframe_bbs";
  if (u.includes("boardcnts/list.do")) return "boardcnts";
  if (h.includes("wr_id=") || u.includes("gnuboard")) return "gnuboard";
  if (h.includes("mod=document")) return "kboard";
  if (u.includes(".mbz")) return "mbz_board";
  if (LOGIN_HINT.test(html)) return "portal_or_login";
  return "unknown";
}

function extractPatterns(hrefs) {
  const found = new Set();
  for (const href of hrefs) {
    if (/artclView\.do/i.test(href)) found.add("artclView.do");
    if (/view\.do/i.test(href)) found.add("view.do");
    if (/mode=view/i.test(href)) found.add("mode=view");
    if (/articleNo=/i.test(href)) found.add("articleNo=");
    if (/nttId=/i.test(href)) found.add("nttId=");
    if (/wr_id=/i.test(href)) found.add("wr_id=");
    if (/uid=/i.test(href)) found.add("uid=");
    if (/javascript:/i.test(href)) found.add("javascript:");
    if (href === "#" || /#$/.test(href)) found.add("hash_only");
  }
  return [...found];
}

function classify(p, existingPattern, listItemSelector) {
  if (p.http_status === null) {
    return {
      root_cause_category: "network_dns_or_tls_failure",
      root_cause_confidence: "high",
      root_cause_detail: p.fetch_error || "fetch threw before HTTP status",
      cluster: "tls_network_timeout",
      suggested_action: "temporarily_unavailable_or_browser_header_probe",
    };
  }
  if (p.http_status === 403) {
    return {
      root_cause_category: "http_403",
      root_cause_confidence: "confirmed",
      root_cause_detail: "HTTP 403",
      cluster: "http_403_waf",
      suggested_action: "verified_external_block",
    };
  }
  if (p.http_status === 401 || (p.has_login_signal && p.candidate_anchor_count === 0)) {
    return {
      root_cause_category: "login_required",
      root_cause_confidence: "confirmed",
      root_cause_detail: `HTTP ${p.http_status}; login signals=${p.has_login_signal}`,
      cluster: "http_403_waf",
      suggested_action: "verified_no_central_board_or_find_replacement",
    };
  }
  if (p.http_status >= 500) {
    return {
      root_cause_category: "intermittent_server_failure",
      root_cause_confidence: "confirmed",
      root_cause_detail: `HTTP ${p.http_status}`,
      cluster: "tls_network_timeout",
      suggested_action: "temporarily_unavailable",
    };
  }
  if (p.redirected_home) {
    return {
      root_cause_category: "redirected_to_homepage",
      root_cause_confidence: "confirmed",
      root_cause_detail: `final_url=${p.final_url}`,
      cluster: "invalid_list_url",
      suggested_action: "replace_official_central_scholarship_url",
    };
  }
  if (p.has_js_framework_signal && p.candidate_anchor_count === 0) {
    return {
      root_cause_category: "javascript_rendered_list",
      root_cause_confidence: "high",
      root_cause_detail: "JS framework markers; no detail anchors in raw HTML",
      cluster: "xhr_iframe_dynamic",
      suggested_action: "inspect_xhr_json_api",
    };
  }
  if (p.has_iframe && p.candidate_anchor_count === 0) {
    return {
      root_cause_category: "iframe_board",
      root_cause_confidence: "high",
      root_cause_detail: `iframe_src=${p.iframe_src || "unknown"}`,
      cluster: "xhr_iframe_dynamic",
      suggested_action: "use_iframe_src_as_list_url",
    };
  }
  if (p.has_empty_board_signal && p.candidate_anchor_count === 0) {
    return {
      root_cause_category: "valid_empty_board",
      root_cause_confidence: "confirmed",
      root_cause_detail: "empty board message present",
      cluster: "valid_empty_or_no_board",
      suggested_action: "verified_valid_zero",
    };
  }
  if (p.sample_onclicks.length > 0 && p.candidate_anchor_count === 0) {
    return {
      root_cause_category: "onclick_javascript",
      root_cause_confidence: "confirmed",
      root_cause_detail: `onclick=${p.sample_onclicks[0]}`,
      cluster: "onclick_post_event_url",
      suggested_action: "extend_javascript_function_url_builder",
    };
  }
  if (p.candidate_anchor_count > 0 && existingPattern && !/artclView/i.test(existingPattern)) {
    return {
      root_cause_category: "notice_url_pattern_too_narrow",
      root_cause_confidence: "confirmed",
      root_cause_detail: `candidates=${p.candidate_anchor_count}; patterns=${p.url_patterns_found.join("|")}`,
      cluster: "url_pattern_gap",
      suggested_action: "expand_notice_url_pattern",
    };
  }
  if (p.candidate_anchor_count > 0 && listItemSelector) {
    return {
      root_cause_category: "list_selector_mismatch",
      root_cause_confidence: "high",
      root_cause_detail: `candidates=${p.candidate_anchor_count} but crawler failed; selector=${listItemSelector}`,
      cluster: "selector_mismatch",
      suggested_action: "clear_or_retune_list_item_selector",
    };
  }
  if (p.candidate_anchor_count > 0) {
    return {
      root_cause_category: "detail_url_resolution_failed",
      root_cause_confidence: "high",
      root_cause_detail: `candidates=${p.candidate_anchor_count}; patterns=${p.url_patterns_found.join("|")}`,
      cluster: "onclick_post_event_url",
      suggested_action: "improve_url_resolution_or_pattern",
    };
  }
  if (p.http_status >= 200 && p.http_status < 400) {
    return {
      root_cause_category: "not_a_notice_list",
      root_cause_confidence: "medium",
      root_cause_detail: "HTTP OK but no detail-like anchors",
      cluster: "invalid_list_url",
      suggested_action: "replace_official_central_scholarship_url",
    };
  }
  return {
    root_cause_category: "unknown_requires_manual_review",
    root_cause_confidence: "unknown",
    root_cause_detail: "insufficient evidence after probe",
    cluster: "other",
    suggested_action: "manual_browser_network_inspection",
  };
}

async function probeOne(base) {
  const p = {
    source_id: base.source_id,
    source_name: base.source_name,
    university_name: base.university_name,
    original_list_url: base.list_url,
    final_list_url: base.list_url,
    latest_error_bucket: base.latest_error_bucket,
    http_status: null,
    final_url: null,
    content_type: null,
    charset: null,
    response_size: 0,
    redirect_count: 0,
    redirected_home: false,
    anchor_count: 0,
    candidate_anchor_count: 0,
    selector_match_count: 0,
    sample_titles: [],
    sample_hrefs: [],
    sample_onclicks: [],
    url_patterns_found: [],
    has_iframe: false,
    iframe_src: null,
    has_login_signal: false,
    has_empty_board_signal: false,
    has_js_framework_signal: false,
    cms_family: "unknown",
    fetch_error: null,
    evidence_summary: "",
    root_cause_category: "unknown_requires_manual_review",
    root_cause_confidence: "unknown",
    root_cause_detail: "",
    cluster: "other",
    suggested_action: "manual_review",
  };

  if (!base.list_url) {
    Object.assign(p, {
      root_cause_category: "invalid_list_url",
      root_cause_confidence: "confirmed",
      root_cause_detail: "empty list_url",
      cluster: "invalid_list_url",
      suggested_action: "find_official_central_scholarship_board",
      evidence_summary: "empty list_url",
    });
    return p;
  }

  try {
    const res = await fetch(base.list_url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const html = buf.toString("utf8");
    const $ = loadHtml(html);

    p.http_status = res.status;
    p.final_url = res.url;
    p.content_type = res.headers.get("content-type");
    p.charset = /charset=([^;]+)/i.exec(p.content_type || "")?.[1] || null;
    p.response_size = buf.length;
    p.redirect_count = res.redirected ? 1 : 0;
    p.has_iframe = $("iframe").length > 0;
    p.iframe_src = $("iframe").first().attr("src") || null;
    p.has_login_signal = LOGIN_HINT.test(html);
    p.has_empty_board_signal = EMPTY_HINT.test(html);
    p.has_js_framework_signal = JS_HINT.test(html);
    p.cms_family = detectCms(base.list_url, html);

    try {
      const fin = new URL(res.url);
      const orig = new URL(base.list_url);
      const homeLike =
        fin.pathname === "/" || /\/(index|main|home)\.?(html|do|php)?$/i.test(fin.pathname);
      p.redirected_home =
        homeLike &&
        fin.origin === orig.origin &&
        fin.href.replace(/\/$/, "") !== orig.href.replace(/\/$/, "");
    } catch {
      /* ignore */
    }

    if (base.existing_list_item_selector) {
      try {
        p.selector_match_count = $(base.existing_list_item_selector).length;
      } catch {
        p.selector_match_count = -1;
      }
    }

    const hrefs = [];
    $("a[href], a[onclick], a[data-href], a[data-url]").each((_, el) => {
      const a = $(el);
      const href = (a.attr("href") || "").trim();
      const onclick = (a.attr("onclick") || "").trim();
      const title = a.text().replace(/\s+/g, " ").trim();
      p.anchor_count += 1;
      if (href) hrefs.push(href);
      if (onclick && p.sample_onclicks.length < 5) p.sample_onclicks.push(onclick.slice(0, 200));
      const looksDetail =
        DETAIL_HINT.test(href) ||
        /jf_viewArtcl|goView|viewArticle|fnView|articleNo|nttId|wr_id|artclNo/i.test(onclick);
      if (looksDetail) {
        p.candidate_anchor_count += 1;
        if (title && p.sample_titles.length < 5) p.sample_titles.push(title.slice(0, 80));
        if (href && p.sample_hrefs.length < 5) p.sample_hrefs.push(href.slice(0, 180));
      }
    });
    p.url_patterns_found = extractPatterns(hrefs);

    const cls = classify(p, base.existing_notice_url_pattern, base.existing_list_item_selector);
    Object.assign(p, cls);
    p.evidence_summary = [
      `http=${p.http_status}`,
      `final_url=${p.final_url}`,
      `size=${p.response_size}`,
      `anchors=${p.anchor_count}`,
      `candidates=${p.candidate_anchor_count}`,
      `selector_matches=${p.selector_match_count}`,
      `patterns=${p.url_patterns_found.join("|") || "none"}`,
      `cms=${p.cms_family}`,
      `onclicks=${p.sample_onclicks.length}`,
      `iframe=${p.has_iframe}`,
      `js=${p.has_js_framework_signal}`,
      `login=${p.has_login_signal}`,
      `empty=${p.has_empty_board_signal}`,
    ].join("; ");
  } catch (e) {
    p.fetch_error = e instanceof Error ? e.message : String(e);
    const cls = classify(p, base.existing_notice_url_pattern, base.existing_list_item_selector);
    Object.assign(p, cls);
    p.evidence_summary = `fetch_error=${p.fetch_error}`;
  }

  return p;
}

async function main() {
  if (baseline.length !== 51) throw new Error(`Expected 51 baseline rows, got ${baseline.length}`);

  const probes = [];
  let cursor = 0;
  const concurrency = 4;
  async function worker() {
    while (cursor < baseline.length) {
      const i = cursor;
      cursor += 1;
      const b = baseline[i];
      console.error(`probe ${i + 1}/51 ${b.source_id}`);
      probes[i] = await probeOne(b);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const clusters = {};
  for (const p of probes) {
    (clusters[p.cluster] ||= []).push(p.source_id);
  }

  const out = {
    created_at: new Date().toISOString(),
    probed: probes.length,
    clusters: Object.fromEntries(
      Object.entries(clusters).map(([k, v]) => [k, { count: v.length, source_ids: v }])
    ),
    pattern_counts: probes.reduce((acc, p) => {
      for (const pat of p.url_patterns_found) acc[pat] = (acc[pat] || 0) + 1;
      return acc;
    }, {}),
    root_cause_counts: probes.reduce((acc, p) => {
      acc[p.root_cause_category] = (acc[p.root_cause_category] || 0) + 1;
      return acc;
    }, {}),
    probes,
  };

  fs.writeFileSync(
    path.join(OUT, "unresolved-51-diagnostics.json"),
    JSON.stringify(out, null, 2),
    "utf8"
  );
  console.log(
    JSON.stringify(
      {
        probed: out.probed,
        clusters: Object.fromEntries(Object.entries(out.clusters).map(([k, v]) => [k, v.count])),
        root_cause_counts: out.root_cause_counts,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
