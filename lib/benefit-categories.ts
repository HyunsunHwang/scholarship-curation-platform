/**
 * 상세 페이지 상단 하이라이트용 혜택 키워드 체계.
 * - id: 내부 고정 식별자 (매핑·아이콘)
 * - label: 화면에 짧게 보여주는 키워드 (에어비앤비 amenities 스타일)
 */

export const BENEFIT_CATEGORIES = [
  { id: "prize", label: "상금" },
  { id: "activity_fee", label: "활동비" },
  { id: "tuition", label: "등록금" },
  { id: "living", label: "생활비" },
  { id: "academic", label: "학업장려금" },
  { id: "research", label: "연구비" },
  { id: "overseas_fee", label: "해외연수비" },
  { id: "award", label: "상장" },
  { id: "certificate", label: "수료증" },
  { id: "internship", label: "인턴십" },
  { id: "hiring", label: "채용연계" },
  { id: "hiring_bonus", label: "입사 가산점" },
  { id: "overseas", label: "해외연수" },
  { id: "exhibition", label: "전시·발표" },
  { id: "commercialization", label: "상용화" },
  { id: "mentoring", label: "멘토링" },
  { id: "goods", label: "현물" },
  { id: "salary", label: "급여" },
  { id: "other", label: "기타" },
] as const;

export type BenefitCategoryId = (typeof BENEFIT_CATEGORIES)[number]["id"];

export type BenefitHighlight = {
  id: BenefitCategoryId;
  label: string;
};

const BY_ID = Object.fromEntries(
  BENEFIT_CATEGORIES.map((c) => [c.id, c])
) as Record<BenefitCategoryId, (typeof BENEFIT_CATEGORIES)[number]>;

/** Heroicons outline paths (24×24) — BenefitHighlights 아이콘용 */
export const BENEFIT_ICON_PATHS: Record<BenefitCategoryId, string> = {
  prize:
    "M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z",
  activity_fee:
    "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z",
  tuition:
    "M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.608-.332 48.627 48.627 0 00-2.608-.332m20.698 0a50.571 50.571 0 012.608-.332 48.627 48.627 0 012.608-.332m-20.698 0A48.667 48.667 0 0112 10.5c2.648 0 5.195.429 7.577 1.22M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5",
  living:
    "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  academic:
    "M12 6.042A8.967 8.967 0 006 3.75c-1.06 0-2.078.198-3 .552v15.192A8.967 8.967 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.06 0 2.078.198 3 .552v15.192A8.967 8.967 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25",
  research:
    "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.169.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.325-1.131 3.692A19.94 19.94 0 0112 21c-2.928 0-5.714-.63-8.221-1.756-1.781-.367-2.363-2.46-1.131-3.692L5 14.5",
  overseas_fee:
    "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5",
  award:
    "M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-4.5A3.375 3.375 0 0012.75 11.25h-1.5A3.375 3.375 0 007.5 14.25v4.5m9-11.25h.008v.008H16.5V7.5zm-9 0h.008v.008H7.5V7.5zm9 3h.008v.008H16.5V10.5zm-9 0h.008v.008H7.5V10.5z",
  certificate:
    "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  internship:
    "M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42a2.203 2.203 0 01-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0",
  hiring:
    "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
  hiring_bonus:
    "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z",
  overseas:
    "M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418",
  exhibition:
    "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
  commercialization:
    "M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25",
  mentoring:
    "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z",
  goods:
    "M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z",
  salary:
    "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z",
  other:
    "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z",
};

/** 장학금 support_types → 혜택 id */
const SUPPORT_TYPE_TO_BENEFIT: Record<string, BenefitCategoryId> = {
  등록금: "tuition",
  생활비: "living",
  학업장려금: "academic",
  연구비: "research",
  해외연수비: "overseas_fee",
  기타: "other",
};

/** 링커리어 등 원문 혜택 라벨 → 하나 이상 키워드 */
const RAW_BENEFIT_ALIASES: { match: RegExp; ids: BenefitCategoryId[] }[] = [
  { match: /상장/, ids: ["award"] },
  { match: /수료|인증서|자격증/, ids: ["certificate"] },
  { match: /활동비|경비|체재비/, ids: ["activity_fee"] },
  { match: /상금|시상|포상금|장학금/, ids: ["prize"] },
  { match: /인턴/, ids: ["internship"] },
  { match: /입사\s*시?\s*가산|가산점/, ids: ["hiring_bonus"] },
  { match: /정규직|채용/, ids: ["hiring"] },
  { match: /해외연수|연수/, ids: ["overseas"] },
  { match: /전시|발표|상영/, ids: ["exhibition"] },
  { match: /상용화|제품화/, ids: ["commercialization"] },
  { match: /멘토/, ids: ["mentoring"] },
  { match: /현물|상품|기기|굿즈/, ids: ["goods"] },
  { match: /^기타$/, ids: ["other"] },
];

function toHighlight(id: BenefitCategoryId): BenefitHighlight {
  return { id, label: BY_ID[id].label };
}

function pushUnique(out: BenefitHighlight[], id: BenefitCategoryId) {
  if (out.some((b) => b.id === id)) return;
  out.push(toHighlight(id));
}

/** "0만원", 빈 값 등은 상금 키워드로 쓰지 않음 */
export function hasMeaningfulPrizeAmount(text?: string | null): boolean {
  const raw = text?.trim();
  if (!raw) return false;
  if (/기관\s*확인/.test(raw)) return false;
  const digits = raw.replace(/[^\d.]/g, "");
  if (!digits) return true; // "상품권 제공" 등 숫자 없는 표현은 의미 있는 혜택으로 본다
  const n = Number(digits);
  return Number.isFinite(n) && n > 0;
}

function mapRawBenefitLabel(raw: string): BenefitCategoryId[] {
  const text = raw.trim();
  if (!text) return [];

  // "해외연수, 전시기회"처럼 한 칸에 여러 혜택이 붙은 경우 분리
  const parts = text.split(/[,，/·|]/).map((p) => p.trim()).filter(Boolean);
  const chunks = parts.length > 1 ? parts : [text];

  const ids: BenefitCategoryId[] = [];
  for (const chunk of chunks) {
    let matched = false;
    for (const alias of RAW_BENEFIT_ALIASES) {
      if (alias.match.test(chunk)) {
        for (const id of alias.ids) {
          if (!ids.includes(id)) ids.push(id);
        }
        matched = true;
      }
    }
    if (!matched && !ids.includes("other")) {
      // 알 수 없는 짧은 키워드는 그대로 쓰기보다 기타로 묶음
      ids.push("other");
    }
  }
  return ids;
}

/**
 * 공모전·대외활동·교육: benefits[] + 시상 규모 텍스트로 상단 키워드 구성
 */
export function resolveContestBenefits(opts: {
  benefits?: string[] | null;
  supportAmountText?: string | null;
}): BenefitHighlight[] {
  const out: BenefitHighlight[] = [];

  if (hasMeaningfulPrizeAmount(opts.supportAmountText)) {
    pushUnique(out, "prize");
  }

  for (const raw of opts.benefits ?? []) {
    for (const id of mapRawBenefitLabel(raw)) {
      pushUnique(out, id);
    }
  }

  // 상금만 있고 benefits가 비어 있으면 상금만 노출. 완전 비면 빈 배열.
  return out;
}

/**
 * 장학금: support_types 키워드. 광고는 급여 키워드.
 */
export function resolveScholarshipBenefits(opts: {
  supportTypes?: string[] | null;
  supportAmountText?: string | null;
  isAdvertisement?: boolean;
}): BenefitHighlight[] {
  const out: BenefitHighlight[] = [];

  if (opts.isAdvertisement) {
    if (hasMeaningfulPrizeAmount(opts.supportAmountText) || opts.supportAmountText?.trim()) {
      pushUnique(out, "salary");
    }
    return out;
  }

  for (const t of opts.supportTypes ?? []) {
    const id = SUPPORT_TYPE_TO_BENEFIT[t];
    if (id) pushUnique(out, id);
  }

  return out;
}
