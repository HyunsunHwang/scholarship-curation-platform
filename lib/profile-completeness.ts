import { isExperienceType, type SpecItem } from "@/lib/profile-spec";
import type { InterestJobId } from "@/lib/interestCategories";
import type { SkillName } from "@/lib/skills";

export type CompletenessItem = {
  id: string;
  label: string;
  done: boolean;
  href: string;
  group: "required" | "optional";
};

export type CompletenessResult = {
  required: CompletenessItem[];
  optional: CompletenessItem[];
  requiredDone: number;
  optionalDone: number;
  totalDone: number;
  total: number;
  percent: number;
};

export function computeProfileCompleteness(input: {
  headline: string | null;
  bio: string | null;
  interest_categories: InterestJobId[];
  skills?: SkillName[];
  items: SpecItem[];
}): CompletenessResult {
  const hasExperience = input.items.some((i) => isExperienceType(i.item_type));
  const hasCert = input.items.some((i) => i.item_type === "certification");
  const hasLang = input.items.some((i) => i.item_type === "language");
  const hasArtifact = input.items.some((i) => (i.artifacts?.length ?? 0) > 0);

  const required: CompletenessItem[] = [
    {
      id: "headline",
      label: "한 줄 소개",
      done: Boolean(input.headline?.trim()),
      href: "#profile-intro",
      group: "required",
    },
    {
      id: "bio",
      label: "소개",
      done: Boolean(input.bio?.trim()),
      href: "#profile-intro",
      group: "required",
    },
    {
      id: "interests",
      label: "관심 직무",
      done: input.interest_categories.length > 0,
      href: "#profile-intro",
      group: "required",
    },
  ];

  const optional: CompletenessItem[] = [
    {
      id: "skills",
      label: "보유 스킬",
      done: (input.skills?.length ?? 0) > 0,
      href: "#profile-intro",
      group: "optional",
    },
    {
      id: "experience",
      label: "경험",
      done: hasExperience,
      href: "#profile-experience",
      group: "optional",
    },
    {
      id: "certification",
      label: "자격증",
      done: hasCert,
      href: "#profile-certification",
      group: "optional",
    },
    {
      id: "language",
      label: "어학",
      done: hasLang,
      href: "#profile-language",
      group: "optional",
    },
    {
      id: "artifacts",
      label: "첨부 자료",
      done: hasArtifact,
      href: "#profile-experience",
      group: "optional",
    },
  ];

  const requiredDone = required.filter((i) => i.done).length;
  const optionalDone = optional.filter((i) => i.done).length;
  const totalDone = requiredDone + optionalDone;
  const total = required.length + optional.length;

  return {
    required,
    optional,
    requiredDone,
    optionalDone,
    totalDone,
    total,
    percent: Math.round((totalDone / total) * 100),
  };
}

export function matchingReadinessCopy(percent: number): string {
  if (percent >= 70) return "맞춤 장학금·공고 추천에 쓸 정보가 충분해요.";
  if (percent >= 40) return "조금만 더 채우면 추천이 더 정확해져요.";
  return "스펙을 채울수록 맞춤 추천이 정확해져요.";
}
