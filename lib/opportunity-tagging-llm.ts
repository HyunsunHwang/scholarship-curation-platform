import {
  INTEREST_CONTEST_MAX,
  INTEREST_SUBCATEGORIES,
  isInterestJobId,
} from "@/lib/interestCategories";
import {
  INTEREST_INDUSTRIES,
  isInterestIndustryId,
} from "@/lib/interestIndustries";
import {
  classifyOpportunityTags,
  INTEREST_INDUSTRY_CONTEST_MAX,
  type OpportunityTaggingInput,
  type OpportunityTaggingResult,
} from "@/lib/opportunity-tagging";

type LlmPayload = {
  jobs?: unknown;
  industries?: unknown;
  confidence?: unknown;
  reason?: unknown;
};

function parseJsonObject(text: string): LlmPayload {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("LLM 태깅 응답이 객체가 아닙니다.");
  }
  return parsed as LlmPayload;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

async function callTaggingLlm(system: string, user: string): Promise<string> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY 환경변수가 설정되지 않았습니다.");
  const providerFromEnv = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  const base = (
    process.env.LLM_API_BASE ??
    (providerFromEnv === "anthropic" || apiKey.startsWith("sk-ant-")
      ? "https://api.anthropic.com/v1"
      : "https://api.openai.com/v1")
  ).replace(/\/$/, "");
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
  const anthropic =
    providerFromEnv === "anthropic" ||
    base.includes("anthropic.com") ||
    apiKey.startsWith("sk-ant-");

  const response = await fetch(
    anthropic ? `${base}/messages` : `${base}/chat/completions`,
    {
      method: "POST",
      headers: anthropic
        ? {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          }
        : {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
      body: JSON.stringify(
        anthropic
          ? {
              model,
              max_tokens: 700,
              system,
              messages: [{ role: "user", content: user }],
            }
          : {
              model,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: system },
                { role: "user", content: user },
              ],
            }
      ),
      signal: AbortSignal.timeout(55_000),
    }
  );
  if (!response.ok) {
    throw new Error(`LLM 태깅 오류 ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    content?: { type?: string; text?: string }[];
  };
  const text = anthropic
    ? payload.content
        ?.filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("")
    : payload.choices?.[0]?.message?.content;
  if (!text) throw new Error("LLM 태깅 응답 본문이 없습니다.");
  return text;
}

/**
 * 결정 규칙이 불충분한 공고에만 사용하는 2차 분류기.
 * 호출자가 비용·외부 전송을 명시적으로 허용했을 때만 호출해야 한다.
 */
export async function classifyOpportunityTagsWithLlm(
  input: OpportunityTaggingInput
): Promise<OpportunityTaggingResult> {
  const deterministic = classifyOpportunityTags(input);
  if (deterministic.status === "auto_tagged") return deterministic;

  const jobTaxonomy = Object.values(INTEREST_SUBCATEGORIES)
    .flat()
    .map((item) => `${item.id}=${item.label}`)
    .join(", ");
  const industryTaxonomy = INTEREST_INDUSTRIES.map(
    (item) => `${item.id}=${item.label}`
  ).join(", ");
  const system = `대학생 대상 공고의 직무·산업 태그를 정밀 분류한다. 태그는 주제 키워드가 아니라 참가자가 실제로 수행하는 과제·학습 직무와 공고가 속한 산업을 뜻한다. 공모분야·부문에 슬로건/카피, 디자인(로고·CI·포스터·일러스트), 미디어(사진·영상), 제품·보조기기·3D프린팅 등이 있으면 인식개선·사회공헌 주제여도 해당 직무를 반드시 부여한다. 예: 슬로건→pr, 포스터/일러스트/로고·CI→graphic 또는 bx, 사진·영상 콘텐츠→content_prod 또는 pd, 보조기기·제품 아이디어→product_design. 광고 공모·공익광고제·광고마케팅(붙여쓰기)·IMC·마케팅 인턴/서포터즈는 ae/brand_marketing/performance/content_sns 등 마케팅 직무와 marketing_agency를 부여한다. 본문의 클라이언트 브랜드명(예: 우리은행)만으로 finance_fintech를 주지 말고, 자격요건의 대학교/재단 언급만으로 public_edu_npo를 과다 부여하지 않는다. 시·시낭송·순수 수상후보 모집·장학금·마라톤처럼 수행 직무가 없을 때만 jobs를 비운다. 제공된 ID만 사용한다. 직무 최대 3개, 산업 최대 ${INTEREST_INDUSTRY_CONTEST_MAX}개. confidence: 0.9=명시적, 0.8=강한 근거, 0.7=합리적 추론, 0.6 이하=모호. JSON만 반환: {"jobs":[],"industries":[],"confidence":0.0,"reason":"짧은 근거"}. 직무: ${jobTaxonomy}. 산업: ${industryTaxonomy}.`;
  const user = JSON.stringify({
    title: input.title ?? null,
    organization: input.organization ?? null,
    organization_type: input.organizationType ?? null,
    content_kind: input.contentKind ?? null,
    benefits: input.benefits ?? [],
    source_categories: input.sourceCategories ?? [],
    source_interests: input.sourceInterests ?? [],
    body: String(input.body ?? "").slice(0, 8_000),
    note: String(input.note ?? "").slice(0, 1_000),
    deterministic_jobs: deterministic.jobs,
    deterministic_industries: deterministic.industries,
  });
  const parsed = parseJsonObject(await callTaggingLlm(system, user));
  const jobs = stringArray(parsed.jobs)
    .filter(isInterestJobId)
    .slice(0, Math.min(3, INTEREST_CONTEST_MAX));
  const industries = stringArray(parsed.industries)
    .filter(isInterestIndustryId)
    .slice(0, INTEREST_INDUSTRY_CONTEST_MAX);
  const rawConfidence =
    typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
  const confidence = Math.max(0, Math.min(0.99, rawConfidence));
  const reason =
    typeof parsed.reason === "string" ? parsed.reason.slice(0, 500) : "LLM 분류";
  const finalJobs = [...jobs, ...deterministic.jobs]
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .slice(0, INTEREST_CONTEST_MAX);
  const finalIndustries = [...industries, ...deterministic.industries]
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .slice(0, INTEREST_INDUSTRY_CONTEST_MAX);

  const status =
    finalJobs.length === 0 &&
    finalIndustries.length === 0 &&
    confidence >= 0.8
      ? "not_applicable"
      : finalJobs.length > 0 &&
          finalIndustries.length > 0 &&
          confidence >= 0.7
        ? "auto_tagged"
        : "needs_review";

  return {
    jobs: finalJobs,
    industries: finalIndustries,
    confidence,
    status,
    evidence: {
      jobs: finalJobs.map((tag) => ({
        tag,
        score: Math.round(confidence * 10),
        matched: [`llm:${reason}`],
      })),
      industries: finalIndustries.map((tag) => ({
        tag,
        score: Math.round(confidence * 10),
        matched: [`llm:${reason}`],
      })),
    },
    version: `${deterministic.version}+llm`,
  };
}
