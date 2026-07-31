/**
 * Corrects only the two partial-source classifications from persisted crawler
 * diagnostics and the browser observation.  No network, crawler, or DB call.
 */
import fs from "node:fs";

const OUT = "reports/university-beta";
const diagnosticPath = `${OUT}/non-success-29-partial-2-watchlist-9-diagnostics.json`;
const strategyPath = `${OUT}/non-success-29-partial-2-solution-strategy.json`;
const diagnostics = JSON.parse(fs.readFileSync(diagnosticPath, "utf8"));
const strategy = JSON.parse(fs.readFileSync(strategyPath, "utf8"));
const fixes = {
  ou_2285_univ_001: {
    root_cause: "recoverable_config_error", crawler_failure_stage: "list_selector_and_scope", priority: "P0", effort: "S",
    recommended_action: "공지 표를 가리키는 list_item_selector와 장학/봉사 상세 링크 범위로 source config를 고정한다.",
    exact_implementation_target: "crawler source config: list_item_selector and link scope", expected_recovery_probability: "높음", beta_exclusion_recommended: false,
    human_explanation_ko: "공개 장학/봉사 목록과 상세 접근은 가능하지만, 빈 list selector가 학사일정 링크까지 후보로 섞어 5건만 partial로 확정됐다. selector 범위 문제다.",
  },
  ou_3518_univ_001: {
    root_cause: "recoverable_shared_adapter_gap", crawler_failure_stage: "onclick_event_url_resolution", priority: "P1", effort: "M",
    recommended_action: "공개 jf_view onclick payload에서 게시글 식별자를 추출해 상세 URL을 만드는 공용 adapter를 보완한다.",
    exact_implementation_target: "shared crawler adapter: jf_view event URL builder", expected_recovery_probability: "중간", beta_exclusion_recommended: false,
    human_explanation_ko: "공개 협성소식 목록은 보이지만 onclick 기반 상세 URL이 안정적으로 복원되지 않아 2건만 partial로 확정됐다. parser/adapter 문제다.",
  },
};
for (const row of diagnostics.partial_degraded) Object.assign(row, fixes[row.source_id], {
  code_recoverable: true, config_only_fix: row.source_id === "ou_2285_univ_001", shared_adapter_candidate: row.source_id === "ou_3518_univ_001",
  source_specific_adapter_required: false, browser_runtime_required: false, external_dependency: false,
  browser_result_summary: "실제 브라우저에서 공개 목록 제목과 로그인 링크가 함께 보임; 로그인 링크 자체는 인증 요구의 증거가 아님",
  browser_vs_crawler_difference: "public_browser_list_visible_but_partial_extraction",
  fallback_strategy: "수정 후 source 단위 회귀 검증; 실패하면 beta 활성화를 보류",
});
for (const row of strategy.sources) if (fixes[row.source_id]) Object.assign(row, fixes[row.source_id], { code_recoverable: true, fallback_strategy: "수정 후 source 단위 회귀 검증; 실패하면 beta 활성화를 보류" });
const csv = (rows) => { const h = Object.keys(rows[0]); const v = (x) => { const s = typeof x === "object" && x !== null ? JSON.stringify(x) : String(x ?? ""); return /[",\n\r]/u.test(s) ? `"${s.replace(/"/gu, '""')}"` : s; }; return `${h.join(",")}\n${rows.map(r => h.map(k => v(r[k])).join(",")).join("\n")}\n`; };
fs.writeFileSync(diagnosticPath, `${JSON.stringify(diagnostics, null, 2)}\n`);
fs.writeFileSync(`${OUT}/non-success-29-partial-2-watchlist-9-diagnostics.csv`, csv([...diagnostics.hard_non_success, ...diagnostics.partial_degraded, ...diagnostics.coverage_watchlist]));
fs.writeFileSync(strategyPath, `${JSON.stringify(strategy, null, 2)}\n`);
fs.writeFileSync(`${OUT}/non-success-29-partial-2-solution-strategy.csv`, csv(strategy.sources));
fs.writeFileSync(`${OUT}/non-success-29-partial-2-watchlist-9-root-cause-summary.md`, `# 29 + 2 + 9 root-cause summary\n\n## Hard non-success — 현재 수집 실패\n\n- temporary DNS/TLS/connection failure: 11\n- public-list login/auth gate observed: 12\n- public XHR/POST adapter required: 2\n- HTTP 403: 1\n- stale list URL: 1\n- manual browser review: 2\n\n## Partial/degraded — 일부 수집 성공, 완전성 미달\n\n- ou_2285_univ_001: public list reachable; list selector/scope mismatch (P0 source config).\n- ou_3518_univ_001: public list reachable; jf_view onclick detail URL adapter gap (P1 shared adapter).\n\n## Coverage watchlist — 실행 성공, 기존보다 관측량 감소\n\n- current false zero: 7\n- undated posts filtered: 2\n`);
const htmlPath = `${OUT}/non-success-29-partial-2-watchlist-9-human-review.html`;
let html = fs.readFileSync(htmlPath, "utf8");
for (const [id, fix] of Object.entries(fixes)) {
  const segment = new RegExp(`("source_id":"${id}"[\\s\\S]*?"root_cause":")[^"]+`, "u");
  html = html.replace(segment, `$1${fix.root_cause}`).replace(`\"${id}\"` + ",\"", `\"${id}\",\"`);
  const action = new RegExp(`("source_id":"${id}"[\\s\\S]*?"recommended_action":")[^"]+`, "u");
  html = html.replace(action, `$1${fix.recommended_action}`);
}
fs.writeFileSync(htmlPath, html);
console.log("offline partial/degraded replay applied");
