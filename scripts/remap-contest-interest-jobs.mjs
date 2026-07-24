/**
 * Remap contests.interest_categories from major/legacy tags to InterestJobId
 * using name/organization/note/benefits keyword heuristics.
 *
 *   node scripts/remap-contest-interest-jobs.mjs           # dry-run
 *   node scripts/remap-contest-interest-jobs.mjs --apply   # write
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

const APPLY = process.argv.includes("--apply");
const MAX_TAGS = 8;

/** [jobId, keywords...] — longer/more specific patterns first where possible */
const RULES = [
  ["backend", ["백엔드", "backend", "서버 개발", "server"]],
  ["frontend", ["프론트엔드", "frontend", "리액트", "react", "vue"]],
  ["mobile", ["앱 개발", "ios", "android", "모바일 앱", "flutter", "react native"]],
  ["game_dev", ["게임 개발", "게임클라이언트", "게임서버", "unity", "언리얼"]],
  ["embedded", ["임베디드", "펌웨어", "firmware", "embedded"]],
  ["devops", ["devops", "인프라", "클라우드", "kubernetes", "docker", "sre"]],
  ["qa", ["소프트웨어 테스트", "qa", "품질보증", "테스트 엔지니어"]],
  ["security", ["정보보안", "사이버보안", "security", "해킹"]],
  ["data_analyst", ["데이터 분석", "데이터분석가", "data analyst"]],
  ["data_engineer", ["데이터 엔지니어", "data engineer", "etl", "데이터파이프"]],
  ["data_scientist", ["데이터 사이언", "data scientist"]],
  ["ml_engineer", ["머신러닝", "인공지능", "ai/ml", "딥러닝", "ml 엔지니어", "ai 엔지니어"]],
  ["service_pm", ["서비스 기획", "프로덕트 매니저", "product owner", "pm/po", "프로덕트 기획"]],
  ["biz_strategy", ["사업기획", "전략기획", "경영기획"]],
  ["bd", ["사업개발", "제휴", "bd ", "bizdev"]],
  ["game_planning", ["게임 기획", "게임기획"]],
  ["consultant_jr", ["컨설턴트", "컨설팅"]],
  ["brand_marketing", ["브랜드 마케팅", "브랜드마케팅"]],
  ["performance", ["퍼포먼스 마케팅", "광고 운영", "퍼포먼스광고", "매체 운영"]],
  ["content_sns", ["콘텐츠 마케팅", "sns 운영", "인스타그램", "소셜미디어"]],
  ["crm", ["crm", "고객관계"]],
  ["growth", ["그로스", "growth"]],
  ["ae", ["광고기획", "ae ", "광고 대행"]],
  ["pr", ["홍보", "pr ", "퍼블릭릴"]],
  ["md", ["상품기획", "md ", "머천다이저"]],
  ["ux_ui", ["ux/ui", "ui/ux", "ux디자인", "ui디자인", "ux ui", "프로덕트 디자인"]],
  ["graphic", ["그래픽 디자인", "시각 디자인", "비주얼 디자인"]],
  ["motion", ["모션 디자인", "모션그래픽", "영상 디자인"]],
  ["product_design", ["제품 디자인", "산업 디자인"]],
  ["bx", ["브랜드 디자인", "bx디자인"]],
  ["web_publishing", ["웹디자인", "퍼블리싱", "퍼블리셔"]],
  ["space", ["공간 디자인", "전시 디자인", "인테리어"]],
  ["fashion", ["패션 디자인", "패션디자인"]],
  ["domestic", ["국내영업"]],
  ["overseas", ["해외영업", "무역"]],
  ["b2b", ["b2b", "법인영업", "기업영업"]],
  ["tech_sales", ["기술영업", "세일즈 엔지니어"]],
  ["sales_ops", ["영업관리", "영업지원"]],
  ["finance_sales", ["금융영업", "보험설계", "증권영업"]],
  ["hr", ["인사(", "인사담당", "hr ", "채용 담당", "인사팀"]],
  ["hrd", ["hrd", "교육운영", "인재개발"]],
  ["general_affairs", ["총무"]],
  ["office_support", ["경영지원", "사무지원"]],
  ["legal_jr", ["법무", "법률"]],
  ["secretary", ["비서", "사무보조"]],
  ["accounting", ["회계", "경리"]],
  ["tax", ["세무"]],
  ["treasury", ["재무", "자금"]],
  ["finance_ops", ["금융사무", "은행 사무", "증권 사무"]],
  ["production_mgmt", ["생산관리"]],
  ["process_eng", ["공정기술", "공정 엔지니어"]],
  ["qc", ["품질관리", "qc ", "품질보증(qc)"]],
  ["production_tech", ["생산기술"]],
  ["equipment", ["설비", "장비 엔지니어"]],
  ["ehs", ["안전환경", "ehs", "산업안전"]],
  ["mechanical", ["기계 설계", "기계설계"]],
  ["ee", ["전기전자", "전기 · 전자", "전자공학"]],
  ["semiconductor", ["반도체"]],
  ["chem_materials", ["화학", "소재"]],
  ["bio_pharma", ["바이오", "제약"]],
  ["rnd_general", ["r&d", "연구개발"]],
  ["civil_arch", ["건축", "토목", "시설관리"]],
  ["cs", ["고객상담", "고객센터", "콜센터", "cs "]],
  ["platform_ops", ["서비스 운영", "플랫폼 운영", "오퍼레이션", "cx 운영"]],
  ["retail", ["매장", "리테일", "점포"]],
  ["scm", ["물류", "scm", "공급망"]],
  ["procurement", ["구매", "자재"]],
  ["fnb", ["식음", "외식", "f&b"]],
  ["content_prod", ["콘텐츠 기획", "콘텐츠 제작", "콘텐츠제작"]],
  ["pd", ["영상 제작", "pd ", "영상pd"]],
  ["editor", ["기자", "에디터"]],
  ["broadcast_writer", ["구성작가", "방송작가"]],
  ["publishing", ["출판", "편집"]],
  ["mcn", ["크리에이터", "mcn", "인플루언서"]],
  // broader fallbacks (lower priority — listed later but we collect all matches)
  ["ml_engineer", [" ai ", "인공지능", "머신 러닝"]],
  ["service_pm", ["기획", "아이디어"]],
  ["brand_marketing", ["마케팅", "광고"]],
  ["ux_ui", ["디자인"]],
  ["content_prod", ["콘텐츠", "영상"]],
  ["backend", ["개발", "코딩", "프로그래밍", "it ", "소프트웨어"]],
];

function matchJobs(text) {
  const hay = ` ${String(text || "").toLowerCase()} `;
  const found = [];
  const seen = new Set();
  for (const [jobId, keywords] of RULES) {
    if (seen.has(jobId)) continue;
    for (const kw of keywords) {
      if (hay.includes(kw.toLowerCase())) {
        seen.add(jobId);
        found.push(jobId);
        break;
      }
    }
    if (found.length >= MAX_TAGS) break;
  }
  return found;
}

function buildCorpus(row) {
  const benefits = Array.isArray(row.benefits) ? row.benefits.join(" ") : "";
  return [row.name, row.organization, row.note, benefits].filter(Boolean).join(" \n ");
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const pageSize = 1000;
  let from = 0;
  /** @type {any[]} */
  const data = [];
  for (;;) {
    const { data: page, error } = await supabase
      .from("contests")
      .select("id, name, organization, note, benefits, interest_categories")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    if (!page?.length) break;
    data.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  let changed = 0;
  let cleared = 0;
  let unchanged = 0;

  for (const row of data) {
    const next = matchJobs(buildCorpus(row));
    const prev = Array.isArray(row.interest_categories)
      ? row.interest_categories
      : [];
    const same =
      prev.length === next.length && prev.every((v, i) => v === next[i]);

    if (same) {
      unchanged += 1;
      continue;
    }

    changed += 1;
    if (next.length === 0) cleared += 1;

    console.log(
      `${same ? "=" : "*"} ${row.name?.slice(0, 48) ?? row.id}\n  was: [${prev.join(", ")}]\n  now: [${next.join(", ")}]`
    );

    if (APPLY) {
      const { error: upErr } = await supabase
        .from("contests")
        .update({ interest_categories: next.length ? next : null })
        .eq("id", row.id);
      if (upErr) {
        console.error(`  update failed: ${upErr.message}`);
      }
    }
  }

  console.log(
    `\n${APPLY ? "APPLIED" : "DRY-RUN"} total=${data?.length ?? 0} changed=${changed} cleared=${cleared} unchanged=${unchanged}`
  );
  if (!APPLY) {
    console.log("Re-run with --apply to write changes.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
