/**
 * 관심 산업(분야) 택소노미.
 * 1계층 · 13개 대분류 · 복수선택 · 선택(비필수).
 */

export const INTEREST_INDUSTRIES = [
  {
    id: "it_software",
    label: "IT·소프트웨어·인터넷",
    hint: "포털·플랫폼, SaaS·SI, 정보보안",
  },
  {
    id: "semiconductor",
    label: "반도체·디스플레이",
    hint: "삼성전자 DS·SK하이닉스, 소부장",
  },
  {
    id: "electronics",
    label: "전자·전기·하드웨어",
    hint: "가전, 전자부품, 로봇",
  },
  {
    id: "game",
    label: "게임",
    hint: "넥슨·엔씨·넷마블, 인디",
  },
  {
    id: "finance_fintech",
    label: "금융·핀테크",
    hint: "은행·증권·보험·카드, 토스·카카오페이",
  },
  {
    id: "manufacturing_chem",
    label: "제조·화학·소재",
    hint: "기계·자동차·조선·철강·석유화학",
  },
  {
    id: "battery_energy",
    label: "이차전지·에너지·친환경",
    hint: "배터리, 신재생, 환경",
  },
  {
    id: "bio_pharma",
    label: "바이오·제약·헬스케어",
    hint: "제약, 바이오, 의료기기, 디지털헬스",
  },
  {
    id: "commerce_logistics",
    label: "커머스·유통·물류",
    hint: "쿠팡, 이커머스, 리테일, 물류",
  },
  {
    id: "media_entertainment",
    label: "미디어·콘텐츠·엔터테인먼트",
    hint: "방송·영화·음악·웹툰·엔터",
  },
  {
    id: "marketing_agency",
    label: "마케팅·광고·디자인 서비스",
    hint: "광고대행사, 디자인 스튜디오, PR",
  },
  {
    id: "consumer_goods",
    label: "소비재·식품·뷰티·패션",
    hint: "식품, 화장품, 패션, 생활용품",
  },
  {
    id: "public_edu_npo",
    label: "공공·교육·비영리",
    hint: "공기업·정부, 학교·에듀테크, 협회·NGO",
  },
] as const;

export type InterestIndustryId = (typeof INTEREST_INDUSTRIES)[number]["id"];

export const INTEREST_INDUSTRY_IDS = INTEREST_INDUSTRIES.map((i) => i.id);

/** 프로필·온보딩 관심 산업 최대 선택 수 */
export const INTEREST_INDUSTRY_MAX = 5;

const ID_SET: ReadonlySet<string> = new Set(INTEREST_INDUSTRY_IDS);

export function isInterestIndustryId(
  value: string
): value is InterestIndustryId {
  return ID_SET.has(value);
}

export function interestIndustryLabel(id: InterestIndustryId): string {
  return INTEREST_INDUSTRIES.find((i) => i.id === id)?.label ?? id;
}

export function normalizeInterestIndustries(
  values: readonly string[] | null | undefined,
  max: number = INTEREST_INDUSTRY_MAX
): InterestIndustryId[] {
  if (!values?.length) return [];
  const seen = new Set<InterestIndustryId>();
  const out: InterestIndustryId[] = [];
  for (const raw of values) {
    if (!isInterestIndustryId(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
    if (out.length >= max) break;
  }
  return out;
}
