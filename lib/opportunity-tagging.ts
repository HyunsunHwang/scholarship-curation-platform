import {
  INTEREST_CONTEST_MAX,
  isInterestJobId,
  type InterestJobId,
} from "@/lib/interestCategories";
import {
  isInterestIndustryId,
  type InterestIndustryId,
} from "@/lib/interestIndustries";

export const OPPORTUNITY_TAGGING_VERSION = "2026-07-29.4";
export const INTEREST_INDUSTRY_CONTEST_MAX = 5;

export type OpportunityTaggingInput = {
  title?: string | null;
  organization?: string | null;
  organizationType?: string | null;
  body?: string | null;
  note?: string | null;
  benefits?: readonly string[] | null;
  sourceCategories?: readonly string[] | null;
  sourceInterests?: readonly string[] | null;
  contentKind?: "contest" | "education" | "activity" | null;
};

export type OpportunityTagEvidence = {
  tag: string;
  score: number;
  matched: string[];
};

export type OpportunityTaggingResult = {
  jobs: InterestJobId[];
  industries: InterestIndustryId[];
  confidence: number;
  status: "auto_tagged" | "needs_review" | "not_applicable";
  evidence: {
    jobs: OpportunityTagEvidence[];
    industries: OpportunityTagEvidence[];
  };
  version: string;
};

type Rule<T extends string> = {
  id: T;
  patterns: RegExp[];
  sourceLabels?: RegExp[];
  minScore?: number;
  /** Body match score override. Use 0 to ignore body-only noise. Default 3. */
  bodyScore?: number;
  /** Organization match score override. Default 3. */
  orgScore?: number;
};

const JOB_RULES: readonly Rule<InterestJobId>[] = [
  { id: "backend", patterns: [/백\s*엔드|서버\s*(개발|엔지니어)|backend|spring\s*boot|node\.?js|django|fastapi/i] },
  { id: "frontend", patterns: [/프론트\s*엔드|frontend|react(?:\.?js)?|vue(?:\.?js)?|웹\s*퍼블리셔가 아닌 웹\s*개발/i] },
  { id: "mobile", patterns: [/\bi\s*os\b|android|안드로이드|모바일\s*앱\s*개발|flutter|react\s*native/i] },
  { id: "game_dev", patterns: [/게임\s*(클라이언트|서버|프로그래밍|개발)|unity|unreal\s*engine|언리얼\s*엔진/i] },
  { id: "embedded", patterns: [/임베디드|펌웨어|firmware|\bmcu\b|freertos|autosar/i] },
  { id: "devops", patterns: [/devops|\bsre\b|클라우드\s*인프라|kubernetes|docker|terraform|시스템\s*엔지니어/i] },
  { id: "qa", patterns: [/소프트웨어\s*(테스트|품질)|\bqa\b|테스트\s*엔지니어|품질\s*보증/i] },
  { id: "security", patterns: [/정보\s*보안|사이버\s*보안|침해\s*대응|모의\s*해킹|security\s*engineer/i] },
  { id: "data_analyst", patterns: [/데이터\s*분석(?:가|직무|과정)?|data\s*analyst|비즈니스\s*인텔리전스|\bbi\s*분석/i] },
  { id: "data_engineer", patterns: [/데이터\s*엔지니어|data\s*engineer|\betl\b|데이터\s*파이프라인|data\s*warehouse/i] },
  { id: "data_scientist", patterns: [/데이터\s*사이언티스트|data\s*scientist|데이터\s*과학/i] },
  { id: "ml_engineer", patterns: [/머신\s*러닝|machine\s*learning|딥\s*러닝|deep\s*learning|ai\/?ml|인공지능\s*(개발|엔지니어|모델)|\bllm\b|\brag\b/i] },
  { id: "service_pm", patterns: [/서비스\s*기획|프로덕트\s*(매니저|기획)|product\s*(manager|owner)|\bpm\/po\b|\bpo\b\s*직무/i] },
  { id: "biz_strategy", patterns: [/사업\s*기획|경영\s*기획|사업\s*전략|전략\s*컨설팅|전략\s*기획(?!서)/i] },
  { id: "bd", patterns: [/사업\s*개발|\bbd\b|biz(?:ness)?\s*dev|제휴\s*(기획|사업|담당)/i] },
  { id: "game_planning", patterns: [/게임\s*기획|레벨\s*디자인|게임\s*시스템\s*기획/i] },
  { id: "consultant_jr", patterns: [/컨설턴트|컨설팅\s*(직무|프로젝트|인턴)/i] },
  {
    id: "brand_marketing",
    patterns: [
      /브랜드\s*마케팅|브랜딩\s*캠페인|brand\s*marketing|브랜드\s*(과제|문제)|광고\s*캠페인/i,
      /광고마케팅|광고\s*마케팅|광고[·\/]\s*마케팅|광고\s*[&＆]\s*마케팅|부동산마케팅/i,
      /디지털\s*[&＆]?\s*마케팅|디지털\s*마케터|사회공헌\s*마케팅|관광\s*마케팅|글로벌\s*마케팅/i,
      /\bimc\b|마케팅\s*(인턴|공모|실무|프로젝트|서포터즈|팀|직군|파트너|일경험|과정|기획|직무|퍼포먼스)/i,
      /[(\[]마케팅[)\]]|[-–—]\s*마케팅(?:\s|$)|[·ㆍ]\s*마케팅(?:\s*[·ㆍ]|$)|마케팅\s*서포터즈|(?:^|[\s\]\)])마케팅$/i,
    ],
  },
  {
    id: "performance",
    patterns: [
      /퍼포먼스\s*마케팅|마케팅\s*퍼포먼스|광고\s*운영|미디어\s*바잉|검색\s*광고|performance\s*marketing|성과\s*측정/i,
    ],
  },
  {
    id: "content_sns",
    patterns: [
      /콘텐츠\s*마케팅|sns\s*운영|소셜\s*미디어\s*(운영|마케팅)|인스타그램\s*(운영|협찬)|블로그\s*협찬/i,
    ],
  },
  { id: "crm", patterns: [/\bcrm\b|고객\s*관계\s*관리|리텐션\s*마케팅/i] },
  { id: "growth", patterns: [/그로스\s*마케팅|growth\s*(marketing|hacking)|그로스\s*해킹/i] },
  {
    id: "ae",
    patterns: [
      /광고\s*(의\s*)?기획|광고기획|광고\s*상품|광고\s*(공모|캠페인|아이디어|산업|사업화)|광고\s*크리에이티브|광고인/i,
      /공익\s*광고|광고제|디지털\s*광고|\bae\b(?:\s*직무|\s*인턴|\s*채용)|account\s*executive/i,
    ],
  },
  { id: "pr", patterns: [/홍보\s*(직무|담당|인턴|기획)|언론\s*홍보|public\s*relations|\bpr\b(?:\s*직무|\s*인턴|\s*담당)|슬로건|인식\s*개선\s*메시지/i] },
  { id: "md", patterns: [/상품\s*기획|머천다이저|\bmd\b(?:\s*직무|\s*인턴|\s*채용)|기념품\s*공모/i] },
  { id: "ux_ui", patterns: [/ux\/ui|ui\/ux|사용자\s*경험\s*디자인|프로덕트\s*디자이너|ux\s*디자인|ui\s*디자인/i] },
  { id: "graphic", patterns: [/그래픽\s*디자인|시각\s*디자인|비주얼\s*디자인|편집\s*디자인|포스터|일러스트|로고\s*(및|&)?\s*ci|ci\s*(디자인|공모)|그림\s*(공모|부문)|디자인\s*(부문|분야|공모)/i] },
  { id: "motion", patterns: [/모션\s*(그래픽|디자인)|영상\s*디자인|after\s*effects/i] },
  { id: "product_design", patterns: [/제품\s*디자인|산업\s*디자인|industrial\s*design|보조\s*기기|3d\s*프린팅|맞춤형\s*보조/i] },
  { id: "bx", patterns: [/브랜드\s*디자인|\bbx\b(?:\s*디자인|\s*디자이너)|로고\s*(및|&)?\s*ci/i] },
  { id: "web_publishing", patterns: [/웹\s*디자인|웹\s*퍼블리싱|웹\s*퍼블리셔/i] },
  { id: "space", patterns: [/공간\s*디자인|전시\s*디자인|인테리어\s*디자인/i] },
  { id: "fashion", patterns: [/패션\s*디자인|의상\s*디자인|fashion\s*design/i] },
  { id: "domestic", patterns: [/국내\s*영업|지역\s*영업/i] },
  { id: "overseas", patterns: [/해외\s*영업|수출입\s*영업|무역\s*영업/i] },
  { id: "b2b", patterns: [/\bb2b\b\s*(영업|세일즈)|법인\s*영업|기업\s*영업/i] },
  { id: "tech_sales", patterns: [/기술\s*영업|솔루션\s*영업|세일즈\s*엔지니어/i] },
  { id: "sales_ops", patterns: [/영업\s*관리|영업\s*지원|sales\s*operations/i] },
  { id: "finance_sales", patterns: [/금융\s*영업|보험\s*영업|증권\s*영업|자산\s*관리사/i] },
  { id: "hr", patterns: [/인사\s*(담당|직무|인턴|채용)|\bhr\b(?:\s*직무|\s*담당|\s*인턴)|채용\s*담당/i] },
  { id: "hrd", patterns: [/\bhrd\b|인재\s*개발|사내\s*교육|교육\s*운영/i] },
  { id: "general_affairs", patterns: [/총무\s*(직무|담당|인턴|업무)/i] },
  { id: "office_support", patterns: [/경영\s*지원|사무\s*지원|행정\s*사무|경영지원\s*직무/i] },
  { id: "legal_jr", patterns: [/법무\s*(직무|담당|인턴)|법률\s*사무|컴플라이언스/i] },
  { id: "secretary", patterns: [/비서\s*(직무|채용|업무)|사무\s*보조/i] },
  { id: "accounting", patterns: [/회계\s*(직무|실무|담당|과정)|전산\s*회계|경리\s*(직무|실무)/i] },
  { id: "tax", patterns: [/세무\s*(직무|실무|회계|과정)|전산\s*세무/i] },
  { id: "treasury", patterns: [/재무\s*(직무|담당|분석|회계)|자금\s*(관리|운용)/i] },
  { id: "finance_ops", patterns: [/금융\s*사무|은행\s*사무|증권\s*사무|보험\s*사무/i] },
  { id: "production_mgmt", patterns: [/생산\s*관리|제조\s*운영/i] },
  { id: "process_eng", patterns: [/공정\s*기술|공정\s*엔지니어|공정\s*개발/i] },
  { id: "qc", patterns: [/품질\s*관리|\bqc\b(?:\s*직무|\s*교육)|품질\s*검사/i] },
  { id: "production_tech", patterns: [/생산\s*기술|제조\s*기술/i] },
  { id: "equipment", patterns: [/설비\s*(기술|엔지니어|관리|보전)|장비\s*엔지니어/i] },
  { id: "ehs", patterns: [/\behs\b|안전\s*환경|산업\s*안전|환경\s*안전/i] },
  { id: "mechanical", patterns: [/기계\s*설계|기구\s*설계|mechanical\s*design/i] },
  { id: "ee", patterns: [/전기\s*[·ㆍ\/]?\s*전자\s*(직무|공학|설계)|회로\s*설계|전자\s*공학/i] },
  { id: "semiconductor", patterns: [/반도체\s*(공정|설계|장비|직무|교육)|집적\s*회로|반도체/i] },
  { id: "chem_materials", patterns: [/화학\s*(공학|연구|소재)|신소재|재료\s*공학|소재\s*연구/i] },
  { id: "bio_pharma", patterns: [/바이오\s*(연구|산업|제약)|제약\s*(연구|개발|산업)|생명\s*과학|의료\s*연구/i] },
  { id: "rnd_general", patterns: [/\br&d\b|연구\s*개발|연구원\s*(직무|채용|인턴)/i] },
  {
    id: "civil_arch",
    patterns: [/건축\s*(설계|시공|공학)|토목\s*(설계|시공|공학)|시설\s*관리\s*(직무|인턴|채용|업무)/i],
  },
  { id: "cs", patterns: [/고객\s*상담|고객\s*센터|콜\s*센터|\bcs\b(?:\s*직무|\s*상담|\s*담당)/i] },
  { id: "platform_ops", patterns: [/서비스\s*운영|플랫폼\s*운영|오퍼레이션\s*매니저|\bcx\b\s*운영/i] },
  { id: "retail", patterns: [/매장\s*관리|리테일\s*운영|점포\s*관리/i] },
  { id: "scm", patterns: [/\bscm\b|물류\s*(관리|운영|기획)|공급망\s*관리/i] },
  { id: "procurement", patterns: [/구매\s*(직무|관리|담당)|자재\s*(관리|구매)|소싱\s*담당/i] },
  { id: "fnb", patterns: [/\bf&b\b|식음료\s*(산업|서비스|운영)|외식\s*(산업|경영|운영)/i] },
  {
    id: "content_prod",
    patterns: [
      /콘텐츠\s*(기획|제작|크리에이터)|디지털\s*콘텐츠|미디어\s*(부문|분야|공모)|사진\s*또는\s*영상|영상\s*컨텐츠|사진\s*(공모|부문|콘테스트)|미디어[,，]/i,
      /크리에이티브[를을]?\s*(제안|제작|아이디어)|영상\s*공모|숏폼\s*(공모|영상|콘텐츠)|유튜브\s*컨텐츠/i,
    ],
  },
  {
    id: "pd",
    patterns: [
      /영상\s*(기획|제작|컨텐츠|콘텐츠|공모)|\bpd\b(?:\s*직무|\s*채용|\s*교육)|프로듀서|숏폼\s*(영상|공모)|다큐(?:멘터리)?/i,
    ],
  },
  { id: "editor", patterns: [/기자단|기자\s*(직무|채용)|에디터|취재\s*기자/i] },
  { id: "broadcast_writer", patterns: [/방송\s*작가|구성\s*작가|시나리오\s*작가/i] },
  { id: "publishing", patterns: [/출판\s*(기획|편집|직무)|도서\s*편집|출판사\s*인턴/i] },
  { id: "mcn", patterns: [/\bmcn\b|크리에이터\s*(운영|매니지먼트)|인플루언서\s*마케팅/i] },
];

const INDUSTRY_RULES: readonly Rule<InterestIndustryId>[] = [
  { id: "it_software", patterns: [/소프트웨어|\bsw\b|정보\s*보안|클라우드|saas|플랫폼\s*기업|인터넷\s*서비스|it\s*(기업|산업)/i] },
  { id: "semiconductor", patterns: [/반도체|디스플레이|파운드리|팹리스|소부장/i] },
  { id: "electronics", patterns: [/전자\s*(산업|부품|기기)|전기\s*(산업|장비)|하드웨어|로봇|가전/i] },
  { id: "game", patterns: [/게임\s*(산업|회사|개발|기획)|e스포츠|이스포츠/i] },
  // bare "은행" matches client brands in ad briefs (e.g. 우리은행); require finance context
  {
    id: "finance_fintech",
    patterns: [/금융|핀테크|증권|보험|카드사|자산\s*운용|은행\s*(업|원|업무|공모|채용|인턴|교육|산업)/i],
  },
  { id: "manufacturing_chem", patterns: [/제조|자동차|모빌리티|조선|철강|석유\s*화학|기계\s*산업|화학\s*산업/i] },
  { id: "battery_energy", patterns: [/이차\s*전지|배터리|신재생\s*에너지|태양광|풍력|수소\s*에너지|친환경\s*에너지/i] },
  { id: "bio_pharma", patterns: [/바이오|제약|헬스\s*케어|의료\s*기기|디지털\s*헬스|병원/i] },
  { id: "commerce_logistics", patterns: [/이커머스|커머스|유통|리테일|물류|배송|무역/i] },
  { id: "media_entertainment", patterns: [/미디어|콘텐츠\s*산업|엔터테인먼트|방송\s*(사|국|산업|콘텐츠|프로그램)|방송국|영화|음악|웹툰|출판/i] },
  {
    id: "marketing_agency",
    patterns: [
      /광고\s*(대행|공모|캠페인|회사|에이전시|산업)|광고제|공익\s*광고|광고마케팅|광고\s*마케팅/i,
      /마케팅\s*에이전시|(?:광고|마케팅)\s*커뮤니케이션|디자인\s*스튜디오|홍보\s*대행|\bpr\s*에이전시|\bimc\b/i,
    ],
  },
  { id: "consumer_goods", patterns: [/소비재|식품|식음료|뷰티|화장품|패션|생활\s*용품|외식/i] },
  // Eligibility text often mentions 대학교/재단; prefer title/org signals.
  {
    id: "public_edu_npo",
    patterns: [/공공\s*기관|공기업|정부|지자체|교육\s*기관|대학교|학교|비영리|협회|재단|공단|ngo/i],
    bodyScore: 0,
    orgScore: 5,
    minScore: 5,
  },
];

const SOURCE_JOB_MAP: Readonly<Record<string, readonly InterestJobId[]>> = {
  "프론트엔드 개발": ["frontend"],
  "백엔드 개발": ["backend"],
  "모바일 앱 개발": ["mobile"],
  "게임 개발": ["game_dev"],
  "devops/infra": ["devops"],
  "ai/ml": ["ml_engineer"],
  데이터분석: ["data_analyst"],
  데이터엔지니어링: ["data_engineer"],
  데이터사이언스: ["data_scientist"],
  임베디드: ["embedded"],
  반도체: ["semiconductor"],
  "pm/po/기획": ["service_pm"],
  브랜드마케팅: ["brand_marketing"],
  콘텐츠마케팅: ["content_sns"],
  인사: ["hr"],
  재무: ["treasury"],
  물류: ["scm"],
  구매: ["procurement"],
  생산: ["production_mgmt"],
  품질: ["qc"],
};

const JOB_DEFAULT_INDUSTRIES: Partial<
  Record<InterestJobId, readonly InterestIndustryId[]>
> = {
  backend: ["it_software"],
  frontend: ["it_software"],
  mobile: ["it_software"],
  devops: ["it_software"],
  qa: ["it_software"],
  security: ["it_software"],
  data_engineer: ["it_software"],
  data_scientist: ["it_software"],
  ml_engineer: ["it_software"],
  game_dev: ["game"],
  game_planning: ["game"],
  embedded: ["electronics"],
  semiconductor: ["semiconductor"],
  bio_pharma: ["bio_pharma"],
  finance_sales: ["finance_fintech"],
  finance_ops: ["finance_fintech"],
  fnb: ["consumer_goods"],
  ae: ["marketing_agency"],
  brand_marketing: ["marketing_agency"],
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: readonly string[] | null | undefined): string[] {
  return [...new Set((values ?? []).map(normalize).filter(Boolean))];
}

function scoreRules<T extends string>(
  rules: readonly Rule<T>[],
  fields: { title: string; source: string; organization: string; body: string },
  max: number
): { ids: T[]; evidence: OpportunityTagEvidence[] } {
  const scored: OpportunityTagEvidence[] = [];
  for (const rule of rules) {
    let score = 0;
    const matched: string[] = [];
    const orgScore = rule.orgScore ?? 3;
    const bodyScore = rule.bodyScore ?? 3;
    for (const pattern of rule.patterns) {
      if (pattern.test(fields.title)) {
        score += 5;
        matched.push(`title:${pattern.source}`);
      } else if (pattern.test(fields.organization)) {
        score += orgScore;
        matched.push(`organization:${pattern.source}`);
      } else if (pattern.test(fields.source)) {
        score += 4;
        matched.push(`source:${pattern.source}`);
      } else if (bodyScore > 0 && pattern.test(fields.body)) {
        score += bodyScore;
        matched.push(`body:${pattern.source}`);
      }
    }
    if (score >= (rule.minScore ?? 3)) scored.push({ tag: rule.id, score, matched });
  }
  scored.sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));
  return { ids: scored.slice(0, max).map((row) => row.tag as T), evidence: scored.slice(0, max) };
}

export function classifyOpportunityTags(
  input: OpportunityTaggingInput
): OpportunityTaggingResult {
  const sourceLabels = uniqueStrings([
    ...(input.sourceCategories ?? []),
    ...(input.sourceInterests ?? []),
  ]);
  const title = normalize(input.title);
  const organization = normalize(input.organization);
  const source = sourceLabels.join(" ");
  const body = uniqueStrings([
    input.organizationType ?? "",
    input.note ?? "",
    ...(input.benefits ?? []),
    input.body ?? "",
  ]).join(" ");

  const jobScores = scoreRules(
    JOB_RULES,
    { title, source, organization, body },
    INTEREST_CONTEST_MAX
  );

  const sourceJobs: InterestJobId[] = [];
  for (const label of sourceLabels) {
    for (const [raw, ids] of Object.entries(SOURCE_JOB_MAP)) {
      if (normalize(label).toLowerCase() !== raw.toLowerCase()) continue;
      for (const id of ids) if (!sourceJobs.includes(id)) sourceJobs.push(id);
    }
  }
  const jobs = [...sourceJobs, ...jobScores.ids]
    .filter((id, index, all) => isInterestJobId(id) && all.indexOf(id) === index)
    .slice(0, INTEREST_CONTEST_MAX);

  const industryScores = scoreRules(
    INDUSTRY_RULES,
    { title, source, organization, body },
    INTEREST_INDUSTRY_CONTEST_MAX
  );
  const derivedIndustries = jobs.flatMap((job) => JOB_DEFAULT_INDUSTRIES[job] ?? []);
  const industries = [...industryScores.ids, ...derivedIndustries]
    .filter((id, index, all) => isInterestIndustryId(id) && all.indexOf(id) === index)
    .slice(0, INTEREST_INDUSTRY_CONTEST_MAX);

  const strongest = Math.max(
    jobScores.evidence[0]?.score ?? 0,
    industryScores.evidence[0]?.score ?? 0,
    sourceJobs.length ? 4 : 0
  );
  const confidence = Math.min(0.99, strongest >= 8 ? 0.95 : strongest >= 5 ? 0.88 : strongest >= 3 ? 0.75 : 0.35);
  const status = jobs.length > 0 && industries.length > 0 && confidence >= 0.75
    ? "auto_tagged"
    : "needs_review";

  return {
    jobs,
    industries,
    confidence,
    status,
    evidence: {
      jobs: jobScores.evidence,
      industries: industryScores.evidence,
    },
    version: OPPORTUNITY_TAGGING_VERSION,
  };
}
