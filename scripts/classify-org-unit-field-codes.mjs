// org_units 노드에 계열 코드(field_code)를 키워드 규칙으로 부여한다.
// 표준 7대 계열: 인문 / 사회 / 교육 / 공학 / 자연 / 의약 / 예체능
//
// 사용법:
//   node scripts/classify-org-unit-field-codes.mjs           # dry-run (리포트만)
//   node scripts/classify-org-unit-field-codes.mjs --apply   # DB 반영
//
// 분류 대상: department / division / college 노드.
//   매칭 RPC가 "내 노드에서 가장 가까운 field_code 조상"을 쓰므로,
//   학과 이름으로 분류가 안 되어도 소속 단과대(공과대학→공학)로 커버된다.
// 이미 field_code 가 있는 노드는 건너뛴다 (수동 수정 보존).
//
// 필요 env: SUPABASE_URL(또는 NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply");

// 우선순위 순서대로 평가 (먼저 매칭된 계열 채택)
// 예: "수학교육과"는 교육이 자연보다 먼저라 교육으로, "화학공학과"는 공학이 자연보다 먼저라 공학으로.
const FIELD_RULES = [
  {
    code: "교육",
    keywords: ["교육", "사범", "유아교육", "특수교육"],
  },
  {
    code: "의약",
    keywords: [
      "의예", "의학", "의과", "치의", "치과", "한의", "간호", "약학", "제약",
      "보건", "수의", "재활", "물리치료", "작업치료", "임상", "치위생",
      "응급구조", "방사선", "의료", "한약", "바이오헬스",
    ],
  },
  {
    code: "예체능",
    keywords: [
      "음악", "미술", "디자인", "체육", "무용", "연극", "영화", "공연", "예술",
      "조소", "회화", "판화", "도예", "성악", "작곡", "기악", "국악", "관현악",
      "스포츠", "패션", "사진", "애니메이션", "만화", "뷰티", "실용음악",
      "조형", "공예", "연기", "모델", "영상디자인", "귀금속", "주얼리",
      "콘텐츠",
    ],
  },
  {
    code: "공학",
    keywords: [
      "공학", "컴퓨터", "소프트웨어", "전자", "전기", "기계", "건축", "토목",
      "신소재", "재료", "화공", "반도체", "항공", "조선", "자동차", "로봇",
      "정보통신", "데이터사이언스", "인공지능", "정보시스템", "시스템경영",
      "에너지", "금속", "세라믹", "섬유공학", "환경공", "도시공", "교통",
      "메카트로닉스", "융합전공", "스마트", "보안", "정보보호", "빅데이터",
      "게임", "IT", "ICT", "공과", "데이터과학", "배터리", "AI융합", "원자력",
      "디스플레이", "모빌리티", "디지털", "통신", "네트워크", "풀스택",
      "인프라", "정보대학",
    ],
  },
  {
    code: "자연",
    keywords: [
      "수학", "물리", "화학", "생물", "생명", "지구", "천문", "통계", "대기",
      "해양", "식품", "영양", "원예", "농", "축산", "임학", "산림", "자연",
      "지질", "환경", "의류", "주거", "소비자", "아동가족", "생활과학",
      "이과", "응용과학", "우주", "조경", "바이오", "인지과학", "뇌",
    ],
  },
  {
    code: "사회",
    keywords: [
      "경영", "경제", "무역", "회계", "금융", "세무", "법", "행정", "정치",
      "외교", "사회", "심리", "언론", "미디어", "광고", "홍보", "관광", "호텔",
      "부동산", "물류", "국제", "글로벌", "복지", "문헌정보", "커뮤니케이션",
      "지리", "군사", "경찰", "소방", "항공서비스", "비서", "조리", "외식",
      "도시행정", "정책", "정경", "상경", "창업", "비즈니스", "범죄",
    ],
  },
  {
    code: "인문",
    keywords: [
      "국어국문", "영어영문", "문학", "사학", "역사", "철학", "신학", "종교",
      "언어", "일어", "일본", "중어", "중국", "불어", "프랑스", "독어", "독일",
      "노어", "러시아", "서반아", "스페인", "아랍", "한문", "문예", "인문",
      "영문", "국문", "문화", "번역", "통역", "고고", "민속",
      "문과", "신과", "외국어", "어문", "한국어", "동양학", "불교",
    ],
  },
];

function loadEnv(envPath) {
  const out = {};
  let text;
  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    return out;
  }
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let value = t.slice(i + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function classify(name) {
  const n = String(name ?? "").replace(/\s+/g, "");
  if (!n) return null;
  for (const rule of FIELD_RULES) {
    if (rule.keywords.some((k) => n.includes(k))) return rule.code;
  }
  return null;
}

async function loadAllRows(supabase, table, columns) {
  const out = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

async function run() {
  const env = { ...loadEnv(path.join(root, ".env.local")), ...process.env };
  const url = (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/rest\/v1\/?$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env.local)");
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const units = await loadAllRows(
    supabase,
    "org_units",
    "id,parent_id,unit_type,name,path_ids,field_code",
  );
  const byId = new Map(units.map((u) => [u.id, u]));

  const updates = [];
  const report = {
    mode: APPLY ? "apply" : "dry-run",
    totals: { candidates: 0, classified: 0, skippedExisting: 0, unclassified: 0 },
    byCode: {},
    unclassified: [],
  };

  const targets = units.filter((u) => u.unit_type !== "university");

  for (const unit of targets) {
    report.totals.candidates += 1;
    if (unit.field_code) {
      report.totals.skippedExisting += 1;
      continue;
    }
    const code = classify(unit.name);
    if (code) {
      updates.push({ id: unit.id, code });
      report.totals.classified += 1;
      report.byCode[code] = (report.byCode[code] ?? 0) + 1;
    } else {
      report.totals.unclassified += 1;
      // 조상 중 분류 가능한 노드가 있으면 매칭 RPC가 커버하므로 effectiveCover 표시
      const ancestorCode = unit.path_ids
        .slice(0, -1)
        .reverse()
        .map((id) => {
          const a = byId.get(id);
          return a ? a.field_code ?? classify(a.name) : null;
        })
        .find(Boolean);
      report.unclassified.push({
        id: unit.id,
        name: unit.name,
        type: unit.unit_type,
        university: byId.get(unit.path_ids[0])?.name ?? null,
        coveredByAncestor: ancestorCode ?? null,
      });
    }
  }

  report.totals.notCoveredAtAll = report.unclassified.filter((u) => !u.coveredByAncestor).length;

  if (APPLY && updates.length > 0) {
    // 코드별로 묶어 in() 일괄 업데이트
    const byCode = new Map();
    for (const u of updates) {
      if (!byCode.has(u.code)) byCode.set(u.code, []);
      byCode.get(u.code).push(u.id);
    }
    for (const [code, ids] of byCode) {
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { error } = await supabase
          .from("org_units")
          .update({ field_code: code })
          .in("id", chunk);
        if (error) throw error;
      }
    }
  }

  const reportPath = path.join(root, "exports", "org-unit-field-code-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ ...report.totals, byCode: report.byCode }));
  console.log(`report: ${path.relative(root, reportPath)}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
