import type { SpecialInfoType } from "@/lib/database.types";

export const SPECIAL_INFO_OPTIONS: SpecialInfoType[] = [
  "다문화가정",
  "기초생활수급자",
  "차상위계층",
  "장애인(본인)",
  "장애인(가정)",
  "농어촌자녀",
  "보훈대상자",
  "조부모가정",
  "다자녀",
  "한부모가정",
  "학생가장",
  "북한이탈주민",
  "자립준비청년",
  "독립유공자후손",
  "공상자",
  "산재근로자 가정",
  "순직자유자녀",
];

export function splitSpecialInfoValues(values: string[]): {
  matched: SpecialInfoType[];
  extra: string[];
} {
  const matched: SpecialInfoType[] = [];
  const extra: string[] = [];
  for (const raw of values) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (trimmed === "새터민") {
      matched.push("북한이탈주민");
      continue;
    }

    // Legacy "장애인" was used for both self/family cases.
    if (trimmed === "장애인") {
      matched.push("장애인(본인)", "장애인(가정)");
      continue;
    }

    const value = trimmed;
    if (!value) continue;
    if ((SPECIAL_INFO_OPTIONS as string[]).includes(value)) {
      matched.push(value as SpecialInfoType);
    } else {
      extra.push(value);
    }
  }
  return {
    matched: Array.from(new Set(matched)),
    extra: Array.from(new Set(extra)),
  };
}
