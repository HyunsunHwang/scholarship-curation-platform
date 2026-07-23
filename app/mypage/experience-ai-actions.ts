"use server";

import { createClient } from "@/lib/supabase/server";
import { callLlm } from "@/lib/notice-extraction";
import {
  experienceKindLabel,
  isExperienceType,
  isSpecItemType,
} from "@/lib/profile-spec";

// ─────────────────────────────────────────────────────────────────
// 경험(STAR) 입력을 담당자 카드용 문장으로 정리하는 AI 액션.
// 사실을 새로 지어내지 않고, 사용자가 쓴 내용만 간결하게 다듬는다.
// ─────────────────────────────────────────────────────────────────

const INPUT_MAX = 1200;

export type ExperiencePolishInput = {
  item_type: string;
  title: string;
  organization?: string;
  period?: string;
  star_role: string;
  star_action?: string;
  star_result?: string;
};

export type ExperienceCard = {
  /** 담당자 카드 상단 한 줄 요약 */
  headline: string;
  star_role: string;
  star_action: string;
  star_result: string;
};

const SYSTEM_PROMPT = `너는 장학금·대외활동 지원서를 검토해 본 담당자 관점에서, 학생의 경험을 STAR 기법으로 정리해 주는 에디터다.

규칙:
- 사용자가 입력한 사실만 사용한다. 숫자·기간·성과를 절대 지어내지 않는다. 없는 정보는 비워 두거나 입력된 표현을 그대로 유지한다.
- 한국어 명사형 종결(~함, ~달성)로 간결하게 쓴다. 과장 표현(열정적으로, 최선을 다해 등)은 제거한다.
- headline: 담당자가 카드에서 가장 먼저 읽는 한 줄 (40자 이내). 역할과 성과가 드러나게.
- star_role: 팀 규모·포지션이 드러나는 한 문장 (80자 이내).
- star_action: 무엇을 어떻게 했는지 1~2문장 (200자 이내).
- star_result: 숫자·순위가 있으면 반드시 앞세운 한 문장 (100자 이내). 입력에 결과가 없으면 빈 문자열.

반드시 아래 JSON 객체 형식으로만 답한다:
{"headline": "...", "star_role": "...", "star_action": "...", "star_result": "..."}`;

function clip(value: string | undefined, max = INPUT_MAX): string {
  return (value ?? "").trim().slice(0, max);
}

export async function polishExperience(
  input: ExperiencePolishInput
): Promise<{ ok: true; card: ExperienceCard } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  if (!isSpecItemType(input.item_type) || !isExperienceType(input.item_type)) {
    return { error: "알 수 없는 경험 종류입니다." };
  }
  const title = clip(input.title, 120);
  const role = clip(input.star_role, 300);
  if (!title || !role) {
    return { error: "제목과 내가 맡은 역할을 먼저 입력해 주세요." };
  }

  const userPrompt = [
    `종류: ${experienceKindLabel(input.item_type)}`,
    `제목: ${title}`,
    input.organization ? `어디서: ${clip(input.organization, 120)}` : null,
    input.period ? `기간: ${clip(input.period, 40)}` : null,
    `내가 맡은 역할: ${role}`,
    input.star_action ? `구체적으로 한 일: ${clip(input.star_action)}` : null,
    input.star_result ? `결과: ${clip(input.star_result, 300)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { content, error } = await callLlm({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    jsonObject: true,
    maxTokens: 1024,
  });
  if (error || !content) {
    console.error("[polishExperience] LLM error:", error);
    return { error: "AI 정리에 실패했어요. 잠시 후 다시 시도해 주세요." };
  }

  let parsed: unknown;
  try {
    // 코드펜스로 감싸 응답하는 모델 대비
    const jsonText = content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(jsonText);
  } catch {
    console.error("[polishExperience] JSON parse 실패:", content.slice(0, 200));
    return { error: "AI 응답을 해석하지 못했어요. 다시 시도해 주세요." };
  }

  const record = parsed as Partial<Record<keyof ExperienceCard, unknown>>;
  const asText = (v: unknown, max: number) =>
    typeof v === "string" ? v.trim().slice(0, max) : "";

  const card: ExperienceCard = {
    headline: asText(record.headline, 60),
    star_role: asText(record.star_role, 200) || role,
    star_action: asText(record.star_action, 1000),
    star_result: asText(record.star_result, 300),
  };
  if (!card.headline) {
    return { error: "AI 응답이 비어 있어요. 다시 시도해 주세요." };
  }
  return { ok: true, card };
}
