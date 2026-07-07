// 경희대 notice-sources 정리 (일회성 스크립트)
//
// 1) org_units에서 이미 삭제된 구학과(한방생명공학과 1120, 식물환경신소재공학과 1122) 소스 제거
// 2) 죽거나 잘못된 게시판을 크롤링 중인 학과 소스 제거 (이미 올바른 단과대 소스가 존재)
// 3) 단과대 소스와 URL이 완전히 동일한 학과 소스 제거 (이화/한양 정리와 동일한 원칙)
// 4) 단과대 소스가 학과 소스보다 부정확한 게시판(장학 탭이 아닌 일반 탭)을 가리키는 경우,
//    단과대 소스를 학과 소스가 쓰던 정확한 URL로 교체한 뒤 학과 소스 제거
// 5) 이름 오탈자/구형 라벨 정리
//
// 대상 파일: data/notice-sources-khu.csv (실제 크롤링에 쓰이는 파일)
//            data/notice-sources.csv (org_units 조인용 마스터 파일, khu_ 행만 동기화)

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const DELETE_IDS = new Set([
  // org_units에서 이미 삭제된 구학과 (2025년 융합바이오·신소재공학과로 통합됨)
  "khu_028",
  "khu_032",
  // A. 죽거나 잘못된 게시판을 크롤링 중 (이미 올바른 단과대 소스가 존재)
  "khu_058",
  "khu_059",
  "khu_060",
  "khu_061",
  "khu_091",
  "khu_092",
  "khu_074",
  "khu_075",
  // B. 단과대 소스와 완전히 동일한 URL을 중복 등록
  "khu_001",
  "khu_015",
  "khu_016",
  "khu_017",
  "khu_023",
  "khu_024",
  "khu_025",
  "khu_039",
  "khu_040",
  "khu_041",
  "khu_066",
  "khu_067",
  "khu_086",
  "khu_087",
  "khu_088",
  "khu_089",
  "khu_090",
  "khu_093",
  "khu_094",
  "khu_095",
  "khu_096",
  "khu_097",
  "khu_098",
  "khu_099",
  "khu_100",
  "khu_101",
  "khu_104",
  // C. 단과대 소스를 정확한 URL로 교체 후 제거되는 학과 소스
  "khu_002",
  "khu_003",
  "khu_004",
  "khu_045",
  "khu_046",
  "khu_047",
  "khu_048",
  "khu_049",
]);

const URL_FIXES = {
  // 경영대학: 학과 소스가 쓰던 "장학안내" 탭(2374건)이 기존 college URL "공지사항" 탭(354건)보다 정확함
  khu_114: {
    from: "https://kbiz.khu.ac.kr/biz_kor/user/bbs/BMSR00040/list.do?menuNo=14500101",
    to: "https://kbiz.khu.ac.kr/biz_kor/user/bbs/BMSR00040/list.do?menuNo=14500161",
  },
  // 예술·디자인대학: 학과 소스가 쓰던 "장학" 탭(44건)이 기존 college URL "일반" 탭(1253건)보다 정확함
  khu_131: {
    from: "https://and.khu.ac.kr/and_kor/user/bbs/BMSR00040/list.do?menuNo=14900113",
    to: "https://and.khu.ac.kr/and_kor/user/bbs/BMSR00040/list.do?menuNo=14900111",
  },
};

const NAME_FIXES = {
  // 라이브 확인 결과 정상 작동하는 게시판으로 확인되어 "확인 필요" 라벨 제거
  "경희대 음악대학(구형 게시판, 확인 필요)": "경희대 음악대학",
  // org_units 명칭 수정(AI로봇공학전공 -> 지능로봇공학전공)과 동기화
  "경희대 AI로봇공학전공": "경희대 지능로봇공학전공",
  // 마스터 CSV의 department_name 컬럼 (source_name과 별도)
  "AI로봇공학전공": "지능로봇공학전공",
};

function splitCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function csvField(value) {
  if (value == null) return "";
  const needsQuote = /[",\n]/.test(value);
  if (!needsQuote) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function joinCsvLine(fields) {
  return fields.map(csvField).join(",");
}

function processFile(relPath, { sourceIdIdx, nameIdx, urlIdx, extraNameIdxs = [] }) {
  const fullPath = path.join(root, relPath);
  const raw = readFileSync(fullPath, "utf8");
  const lines = raw.split(/\r?\n/);
  const header = lines[0];
  const out = [header];

  let deleted = 0;
  let urlFixed = 0;
  let nameFixed = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const fields = splitCsvLine(line);
    const sourceId = fields[sourceIdIdx];

    if (DELETE_IDS.has(sourceId)) {
      deleted++;
      continue;
    }

    if (URL_FIXES[sourceId] && fields[urlIdx] === URL_FIXES[sourceId].from) {
      fields[urlIdx] = URL_FIXES[sourceId].to;
      urlFixed++;
    }

    if (NAME_FIXES[fields[nameIdx]]) {
      fields[nameIdx] = NAME_FIXES[fields[nameIdx]];
      nameFixed++;
    }
    for (const idx of extraNameIdxs) {
      if (NAME_FIXES[fields[idx]]) {
        fields[idx] = NAME_FIXES[fields[idx]];
        nameFixed++;
      }
    }

    out.push(joinCsvLine(fields));
  }

  writeFileSync(fullPath, out.join("\n") + "\n", "utf8");
  console.log(
    `${relPath}: deleted=${deleted} urlFixed=${urlFixed} nameFixed=${nameFixed} remainingRows=${out.length - 1}`
  );
}

// data/notice-sources-khu.csv: source_id,source_name,list_url,base_url,...
processFile("data/notice-sources-khu.csv", { sourceIdIdx: 0, nameIdx: 1, urlIdx: 2 });

// data/notice-sources.csv (master): source_id,university_slug,university_id,college_id,department_id,org_unit_id,college_name,department_name,source_level,source_name,list_url,...
processFile("data/notice-sources.csv", { sourceIdIdx: 0, nameIdx: 9, urlIdx: 10, extraNameIdxs: [7] });
