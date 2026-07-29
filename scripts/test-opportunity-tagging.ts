import assert from "node:assert/strict";
import { classifyOpportunityTags } from "../lib/opportunity-tagging";

const falsePositiveCases = [
  {
    title: "UN산업개발기구 GreenEnerTEC 2026 통역자원봉사자 모집",
    forbiddenJobs: ["backend"],
  },
  {
    title: "2026 D-Robotics Innovation Contest",
    forbiddenJobs: ["cs"],
  },
  {
    title: "Physical AI 활용 반도체 패키지 설계 및 CAE 해석 스쿨",
    forbiddenJobs: ["ae"],
  },
  {
    title: "2026 CHAI 대학생 AI 광고 공모전",
    organization: "차이커뮤니케이션",
    body: "브랜드 과제: 굽네, 우리은행, 청호나이스. 국내외 대학교 재학생",
    forbiddenIndustries: ["finance_fintech"],
  },
  {
    title: "[양천구시설관리공단] 1기 프로그램(광고마케팅)",
    organization: "양천구시설관리공단",
    forbiddenJobs: ["civil_arch"],
  },
  {
    title: "2026년 서울詩(시) 지하철 공모",
    forbiddenJobs: ["ae", "brand_marketing", "pd"],
  },
  {
    title: "2026년「부산지역인재 장학금」상반기 생활장학금 지원 신청 공고",
    forbiddenJobs: ["ae", "brand_marketing", "office_support"],
  },
] as const;

for (const testCase of falsePositiveCases) {
  const result = classifyOpportunityTags({
    title: testCase.title,
    organization: "organization" in testCase ? testCase.organization : undefined,
    body: "body" in testCase ? testCase.body : undefined,
  });
  if ("forbiddenJobs" in testCase) {
    for (const forbidden of testCase.forbiddenJobs) {
      assert.equal(
        result.jobs.includes(forbidden),
        false,
        `${testCase.title}: unexpected ${forbidden}`
      );
    }
  }
  if ("forbiddenIndustries" in testCase) {
    for (const forbidden of testCase.forbiddenIndustries) {
      assert.equal(
        result.industries.includes(forbidden),
        false,
        `${testCase.title}: unexpected ${forbidden}`
      );
    }
  }
}

const positiveCases = [
  {
    title: "React와 TypeScript로 배우는 프론트엔드 개발 부트캠프",
    jobs: ["frontend"],
    industries: ["it_software"],
  },
  {
    title: "반도체 공정 엔지니어 실무교육",
    jobs: ["process_eng", "semiconductor"],
    industries: ["semiconductor"],
  },
  {
    title: "제약·바이오 연구개발 인턴십",
    jobs: ["bio_pharma", "rnd_general"],
    industries: ["bio_pharma"],
  },
  {
    title: "퍼포먼스 마케팅 광고 운영 실무 과정",
    jobs: ["performance"],
    industries: [],
  },
  {
    title: "뇌성마비 인식개선 「슬로건, 디자인, 미디어, 보조기기」통합 공모전",
    body: "나. 공모분야 1 슬로건 인식 개선 메시지 2 디자인 로고 및 CI, 그림, 포스터, 일러스트 3 미디어 사진 또는 영상 컨텐츠 4 보조기기 3D 프린팅 맞춤형 보조기기 아이디어",
    jobs: ["pr", "graphic", "product_design"],
    industries: ["media_entertainment"],
  },
  {
    title: "2026 CHAI 대학생 AI 광고 공모전",
    organization: "차이커뮤니케이션",
    body: "미래 광고 산업을 이끌 차세대 광고인들이 AI를 활용해 브랜드 과제를 해결하는 대학생 광고 공모전. 광고의 기획부터 크리에이티브까지. 광고 캠페인 아이디어와 크리에이티브를 제안. 브랜드 과제: 굽네, 우리은행, 청호나이스",
    jobs: ["ae", "brand_marketing", "content_prod"],
    industries: ["marketing_agency"],
    forbiddenIndustries: ["finance_fintech"],
  },
  {
    title: "[한국방송광고진흥공사] 2026 대한민국 공익광고제 공모전",
    jobs: ["ae"],
    industries: ["marketing_agency"],
  },
  {
    title: "[콜랩코리아] 광고마케팅(CPS1 광고마케팅) 실전 직무 프로그램",
    jobs: ["brand_marketing"],
    industries: ["marketing_agency"],
  },
  {
    title: "[발렌라이프] 미래내일 일경험 - IMC 마케팅 인턴 채용",
    jobs: ["brand_marketing"],
    industries: ["marketing_agency"],
  },
  {
    title: "1350 고용노동부 고객상담센터 숏폼 영상 공모전",
    jobs: ["cs", "pd", "content_prod"],
    industries: [],
  },
  {
    title: "포스터·로고 CI 디자인 공모전",
    jobs: ["graphic", "bx"],
    industries: [],
  },
  {
    title: "생성형 AI 활용 마케팅",
    jobs: ["brand_marketing"],
    industries: ["marketing_agency"],
  },
] as const;

for (const testCase of positiveCases) {
  const result = classifyOpportunityTags({
    title: testCase.title,
    organization: "organization" in testCase ? testCase.organization : undefined,
    body: "body" in testCase ? testCase.body : undefined,
  });
  for (const job of testCase.jobs) {
    assert.equal(result.jobs.includes(job), true, `${testCase.title}: missing ${job}`);
  }
  for (const industry of testCase.industries) {
    assert.equal(
      result.industries.includes(industry),
      true,
      `${testCase.title}: missing ${industry}`
    );
  }
  if ("forbiddenIndustries" in testCase) {
    for (const industry of testCase.forbiddenIndustries) {
      assert.equal(
        result.industries.includes(industry),
        false,
        `${testCase.title}: unexpected ${industry}`
      );
    }
  }
}

const sourceAssisted = classifyOpportunityTags({
  title: "현직자와 함께하는 실무 과정",
  sourceCategories: ["백엔드 개발"],
  body: "서버 개발 실습을 진행합니다.",
});
assert.equal(sourceAssisted.jobs.includes("backend"), true);

const deterministicInput = {
  title: "데이터 분석가를 위한 금융 데이터 분석 프로젝트",
  organization: "핀테크 아카데미",
};
assert.deepEqual(
  classifyOpportunityTags(deterministicInput),
  classifyOpportunityTags(deterministicInput)
);

console.log("opportunity-tagging tests passed");
