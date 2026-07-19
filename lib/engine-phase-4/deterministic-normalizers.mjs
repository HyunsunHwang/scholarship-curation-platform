import { canonicalizeNoticeUrl } from "../post-phase-l/normalized-graph.mjs";
import { normalizeDocumentText } from "../crawler-engine/document-parsing/contract.mjs";

export const FIELD_VALUE_STATUSES = Object.freeze([
  "present", "not_found", "unknown", "not_applicable", "ambiguous", "conflicting",
]);

export function normalizeWhitespace(value) {
  return normalizeDocumentText(value).replace(/[ \t]+/g, " ").trim();
}

export function normalizeIdentityText(value) {
  return normalizeWhitespace(value).toLocaleLowerCase("ko-KR");
}

function padded(value) {
  return String(value).padStart(2, "0");
}

function validDateParts(year, month, day) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

function parseDateToken(token) {
  const match = String(token).match(
    /(?<year>20\d{2})\s*(?:년|[-./])\s*(?<month>\d{1,2})\s*(?:월|[-./])\s*(?<day>\d{1,2})\s*일?\.?\s*(?:(?<hour>[01]?\d|2[0-3])\s*[:시]\s*(?<minute>[0-5]\d)?\s*분?)?/u,
  );
  if (!match?.groups) return null;
  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  if (!validDateParts(year, month, day)) return null;
  const date = `${year}-${padded(month)}-${padded(day)}`;
  if (match.groups.hour !== undefined) {
    const hour = padded(Number(match.groups.hour));
    const minute = padded(Number(match.groups.minute ?? 0));
    return {
      raw: match[0].trim(),
      normalized: {
        kind: "exact_datetime",
        datetime: `${date}T${hour}:${minute}:00+09:00`,
        timezone: "Asia/Seoul",
        inferred: false,
      },
    };
  }
  return {
    raw: match[0].trim(),
    normalized: { kind: "exact_date", date, timezone: "Asia/Seoul", inferred: false },
  };
}

const DATE_ROLE_PATTERNS = Object.freeze({
  recommendation_deadline: /(?:학교\s*)?추천\s*(?:서류\s*)?(?:제출\s*)?마감/u,
  result_announcement_date: /(?:선발\s*)?(?:결과|합격자|장학생)\s*(?:발표|공지)(?:\s*일)?/u,
  application_start: /(?:신청|접수)\s*시작/u,
  application_deadline: /(?:(?:신청|접수|재단\s*제출)\s*(?:기간\s*)?(?:마감|종료))|(?:마감일)/u,
});

const DATE_RANGE_ROLE_PATTERN = /(?:신청|접수)\s*(?:기간|일정)/u;
const DATE_TOKEN_GLOBAL = /20\d{2}\s*(?:년|[-./])\s*\d{1,2}\s*(?:월|[-./])\s*\d{1,2}\s*일?\.?\s*(?:(?:[01]?\d|2[0-3])\s*[:시]\s*(?:[0-5]\d)?\s*분?)?/gu;
const YEARLESS_DATE = /(?:^|\D)\d{1,2}\s*(?:월|[./-])\s*\d{1,2}\s*일?(?:\D|$)/u;

export function extractDateCandidates(segments) {
  const output = [];
  const yearlessRoles = new Set();
  for (const segment of segments) {
    for (const line of String(segment.text ?? "").split(/\n+/u).map(normalizeWhitespace).filter(Boolean)) {
      const tokens = [...line.matchAll(DATE_TOKEN_GLOBAL)].map((match) => parseDateToken(match[0])).filter(Boolean);
      if (DATE_RANGE_ROLE_PATTERN.test(line) && tokens.length >= 2 && /[~～]|\s-\s/u.test(line)) {
        output.push({ role: "application_start", ...tokens[0], segment, line });
        output.push({ role: "application_deadline", ...tokens[1], segment, line });
        continue;
      }
      if (DATE_RANGE_ROLE_PATTERN.test(line) && tokens.length === 0 && YEARLESS_DATE.test(line)) {
        yearlessRoles.add("application_start");
        yearlessRoles.add("application_deadline");
        continue;
      }
      let role = null;
      for (const [candidateRole, pattern] of Object.entries(DATE_ROLE_PATTERNS)) {
        if (pattern.test(line)) {
          role = candidateRole;
          break;
        }
      }
      if (!role) continue;
      if (tokens.length === 1) output.push({ role, ...tokens[0], segment, line });
      else if (tokens.length > 1) {
        for (const token of tokens) output.push({ role, ...token, segment, line });
      } else if (YEARLESS_DATE.test(line)) yearlessRoles.add(role);
    }
  }
  return { candidates: output, yearlessRoles };
}

function amountMultiplier(unit) {
  if (unit.startsWith("백만")) return 1_000_000;
  if (unit.startsWith("만")) return 10_000;
  return 1;
}

function numericAmount(value, unit) {
  return Number(String(value).replaceAll(",", "")) * amountMultiplier(unit);
}

function amountPeriod(text) {
  if (/월(?:\s*|별|당)/u.test(text)) return "month";
  if (/학기(?:\s*|별|당)/u.test(text)) return "semester";
  if (/연(?:\s*|간|별|당)|년(?:\s*|간|별|당)/u.test(text)) return "year";
  if (/프로그램|과정/u.test(text)) return "program";
  return "one_time";
}

export function extractAmountCandidates(segments) {
  const output = [];
  for (const segment of segments) {
    for (const line of String(segment.text ?? "").split(/\n+/u).map(normalizeWhitespace).filter(Boolean)) {
      if (!/(?:지원|장학|혜택|금액|등록금|기숙사|멘토링|생활비)/u.test(line)) continue;
      const period = amountPeriod(line);
      const range = line.match(/(?<min>\d[\d,]*(?:\.\d+)?)\s*(?<minUnit>백만(?:원)?|만(?:원)?|원)\s*[~～-]\s*(?<max>\d[\d,]*(?:\.\d+)?)\s*(?<maxUnit>백만(?:원)?|만(?:원)?|원)/u);
      if (range?.groups) {
        output.push({
          raw: range[0],
          normalized: {
            kind: "range",
            currency: "KRW",
            minimum: numericAmount(range.groups.min, range.groups.minUnit),
            maximum: numericAmount(range.groups.max, range.groups.maxUnit),
            period,
            description: null,
          },
          segment,
          line,
        });
      }
      if (/등록금\s*전액/u.test(line)) {
        output.push({ raw: "등록금 전액", normalized: { kind: "full_tuition", currency: "KRW", period: "semester", description: "등록금 전액" }, segment, line });
      } else {
        const partial = line.match(/등록금\s*(?:일부|\d{1,3}%|감면)/u);
        if (partial) output.push({ raw: partial[0], normalized: { kind: "partial_tuition", currency: "KRW", period: "semester", description: partial[0] }, segment, line });
      }
      if (/(?:기숙사|멘토링|교육|교재|노트북)\s*(?:및|과|,)?\s*(?:지원|제공)|(?:기숙사|멘토링)\s*(?:및|과)/u.test(line)) {
        const description = line.slice(0, 180);
        output.push({ raw: description, normalized: { kind: "non_cash", currency: null, period: "not_applicable", description }, segment, line });
      }
      if (!range) {
        const exact = line.match(/(?<value>\d[\d,]*(?:\.\d+)?)\s*(?<unit>백만(?:원)?|만(?:원)?|원)/u);
        if (exact?.groups && !/등록금\s*\d{1,3}%/u.test(line)) {
          output.push({
            raw: exact[0],
            normalized: {
              kind: "exact",
              currency: "KRW",
              amount: numericAmount(exact.groups.value, exact.groups.unit),
              period,
              description: null,
            },
            segment,
            line,
          });
        }
      }
    }
  }
  const unique = new Map();
  for (const candidate of output) {
    const key = JSON.stringify(candidate.normalized);
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()];
}

export function extractExplicitValue(segments, labels) {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`(?:${escaped})\\s*[:：]\\s*([^\\n|]{2,100})`, "u");
  for (const segment of segments) {
    const match = String(segment.text ?? "").match(pattern);
    if (match) return { raw: normalizeWhitespace(match[1]), segment, line: normalizeWhitespace(match[0]) };
  }
  return null;
}

export function extractCycleLabel(segments) {
  const explicit = extractExplicitValue(segments, ["모집회차", "모집 회차", "학기"]);
  if (explicit) return explicit;
  const pattern = /20\d{2}년?\s*(?:(?:1|2)학기|상반기|하반기|봄|가을|제\s*\d+\s*차)/u;
  for (const segment of segments) {
    const match = String(segment.text ?? "").match(pattern);
    if (match) return { raw: normalizeWhitespace(match[0]), segment, line: normalizeWhitespace(match[0]) };
  }
  return null;
}

export function extractApplicationUrl(segments) {
  for (const segment of segments) {
    for (const line of String(segment.text ?? "").split(/\n+/u)) {
      if (!/(?:신청|접수|지원|온라인)/u.test(line)) continue;
      const match = line.match(/https?:\/\/[^\s<>"')\]]+/iu);
      const normalized = match ? canonicalizeNoticeUrl(match[0].replace(/[.,;:]$/u, "")) : null;
      if (normalized) return { raw: match[0], normalized, segment, line: normalizeWhitespace(line) };
    }
  }
  return null;
}

export function extractContacts(segments) {
  const contacts = [];
  const evidence = [];
  for (const segment of segments) {
    for (const line of String(segment.text ?? "").split(/\n+/u)) {
      if (!/(?:문의|연락|담당|contact)/iu.test(line)) continue;
      const emails = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu) ?? [];
      const phones = line.match(/(?:0\d{1,2})[- )]?\d{3,4}[- ]?\d{4}/gu) ?? [];
      for (const value of [...emails, ...phones]) {
        if (!contacts.includes(value)) contacts.push(value);
      }
      if (emails.length || phones.length) evidence.push({ segment, line: normalizeWhitespace(line) });
    }
  }
  return { contacts, evidence };
}

const DOCUMENT_PATTERNS = Object.freeze([
  ["application_form", /(?:지원서|신청서)/u],
  ["transcript", /성적증명서/u],
  ["enrollment_certificate", /재학증명서/u],
  ["recommendation_letter", /추천서/u],
  ["income_evidence", /(?:소득|가구)\s*(?:증빙|서류)/u],
]);

export function extractRequiredDocuments(segments) {
  const values = [];
  const evidence = [];
  for (const segment of segments) {
    for (const line of String(segment.text ?? "").split(/\n+/u)) {
      if (!/(?:제출\s*서류|필수\s*서류|구비\s*서류)/u.test(line)) continue;
      for (const [value, pattern] of DOCUMENT_PATTERNS) {
        if (pattern.test(line) && !values.includes(value)) values.push(value);
      }
      if (values.length) evidence.push({ segment, line: normalizeWhitespace(line) });
    }
  }
  return { values, evidence };
}

const METHOD_PATTERNS = Object.freeze([
  ["online", /온라인\s*(?:신청|접수|제출)/u],
  ["email", /(?:이메일|전자우편)\s*(?:신청|접수|제출)/u],
  ["institution_office", /(?:행정실|학생지원팀|장학팀)\s*(?:방문\s*)?제출/u],
  ["postal", /(?:우편|등기)\s*(?:신청|접수|제출)/u],
]);

export function extractApplicationMethods(segments) {
  const values = [];
  const evidence = [];
  for (const segment of segments) {
    for (const line of String(segment.text ?? "").split(/\n+/u)) {
      for (const [value, pattern] of METHOD_PATTERNS) {
        if (pattern.test(line) && !values.includes(value)) {
          values.push(value);
          evidence.push({ segment, line: normalizeWhitespace(line) });
        }
      }
    }
  }
  return { values, evidence };
}

export function extractEligibility(segments) {
  const conditions = [];
  const evidence = [];
  let complex = false;
  for (const segment of segments) {
    for (const line of String(segment.text ?? "").split(/\n+/u).map(normalizeWhitespace).filter(Boolean)) {
      if (!/(?:지원\s*자격|신청\s*자격|자격\s*요건|대상\s*:)/u.test(line)) continue;
      if (/(?:그리고|및).*(?:또는|중\s*하나)|(?:또는).*(?:그리고|및)|\(.+\).*(?:중\s*하나)/u.test(line)) complex = true;
      const add = (dimension, operator, values, rawExpression) => {
        conditions.push({ dimension, operator, values, inclusion: "include", scope: "applicant", raw_expression: rawExpression });
      };
      if (/재학생/u.test(line)) add("enrollment_status", "equals", ["enrolled"], "재학생");
      const grade = line.match(/([1-6])\s*학년/u);
      if (grade) add("grade_year", "equals", [Number(grade[1])], grade[0]);
      const gpa = line.match(/(?:GPA|평점)\s*([0-4](?:\.\d+)?)\s*이상/iu);
      if (gpa) add("gpa", "at_least", [Number(gpa[1])], gpa[0]);
      const income = line.match(/소득\s*([0-9]+)\s*구간\s*이하/u);
      if (income) add("income_decile", "at_most", [Number(income[1])], income[0]);
      if (/대한민국\s*국적/u.test(line)) add("nationality", "equals", ["KR"], "대한민국 국적");
      if (/서울(?:특별시)?\s*거주/u.test(line)) add("residency", "equals", ["서울"], "서울 거주");
      evidence.push({ segment, line });
    }
  }
  const unique = new Map(conditions.map((condition) => [JSON.stringify(condition), condition]));
  return { conditions: [...unique.values()], evidence, complex };
}

export function detectLanguage(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return null;
  const hangul = (normalized.match(/[가-힣]/gu) ?? []).length;
  const latin = (normalized.match(/[A-Za-z]/gu) ?? []).length;
  if (hangul > 0 && hangul >= latin * 0.2) return "ko";
  if (latin > 0) return "en";
  return null;
}

export function normalizedValueKey(value) {
  return JSON.stringify(value, Object.keys(value ?? {}).sort());
}
