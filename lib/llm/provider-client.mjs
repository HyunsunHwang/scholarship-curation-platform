const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

function resolveLlmConfig() {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return { error: "LLM_API_KEY 환경변수가 설정되지 않았습니다." };
  const providerFromEnv = (process.env.LLM_PROVIDER ?? "").trim().toLowerCase();
  const base = (process.env.LLM_API_BASE
    ?? (providerFromEnv === "anthropic" || apiKey.startsWith("sk-ant-") ? DEFAULT_ANTHROPIC_BASE : DEFAULT_OPENAI_BASE))
    .replace(/\/$/, "");
  const model = process.env.LLM_MODEL ?? DEFAULT_MODEL;
  const provider = providerFromEnv === "anthropic" || base.includes("anthropic.com") || apiKey.startsWith("sk-ant-")
    ? "anthropic"
    : "openai";
  return { apiKey, base, model, provider };
}

export function getConfiguredLlmMetadata() {
  const config = resolveLlmConfig();
  if ("error" in config) {
    return { credential_available: false, provider: null, model: null };
  }
  return { credential_available: true, provider: config.provider, model: config.model };
}

async function fetchWithTemperatureFallback(url, headers, buildBody) {
  const attempt = async (includeTemperature) => {
    try {
      return {
        response: await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(buildBody(includeTemperature)),
          signal: AbortSignal.timeout(55_000),
        }),
      };
    } catch (error) {
      return { error: `LLM 요청 실패: ${error instanceof Error ? error.message : error}` };
    }
  };
  const first = await attempt(true);
  if (first.error || !first.response || first.response.ok) return { ...first, retryCount: 0 };
  const text = await first.response.text().catch(() => "");
  const retryable = first.response.status === 400
    && /temperature|top_p|top_k/i.test(text)
    && /deprecat|not support|unsupported/i.test(text);
  if (!retryable) return { error: `LLM 오류 ${first.response.status}: ${text.slice(0, 300)}`, retryCount: 0 };
  const retry = await attempt(false);
  if (retry.error || !retry.response) return { ...retry, retryCount: 1 };
  if (!retry.response.ok) {
    const retryText = await retry.response.text().catch(() => "");
    return { error: `LLM 오류 ${retry.response.status}: ${retryText.slice(0, 300)}`, retryCount: 1 };
  }
  return { response: retry.response, retryCount: 1 };
}

function usageFromPayload(payload, provider) {
  if (provider === "anthropic") {
    const usage = payload?.usage;
    return usage ? { input_tokens: usage.input_tokens ?? null, output_tokens: usage.output_tokens ?? null } : null;
  }
  const usage = payload?.usage;
  return usage ? {
    input_tokens: usage.prompt_tokens ?? null,
    output_tokens: usage.completion_tokens ?? null,
    total_tokens: usage.total_tokens ?? null,
  } : null;
}

function anthropicText(payload) {
  if (!Array.isArray(payload?.content)) return null;
  const texts = payload.content
    .filter((block) => block && typeof block === "object" && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text);
  return texts.length > 0 ? texts.join("\n").trim() : null;
}

export async function callConfiguredLlm({ systemPrompt, userPrompt, jsonObject = false, maxTokens = 4096 }) {
  const config = resolveLlmConfig();
  if ("error" in config) return { error: config.error };
  const startedAt = Date.now();
  const anthropic = config.provider === "anthropic";
  const request = await fetchWithTemperatureFallback(
    `${config.base}/${anthropic ? "messages" : "chat/completions"}`,
    anthropic
      ? { "content-type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" }
      : { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    (includeTemperature) => anthropic
      ? {
        model: config.model,
        max_tokens: maxTokens,
        ...(includeTemperature ? { temperature: 0 } : {}),
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }
      : {
        model: config.model,
        ...(includeTemperature ? { temperature: 0 } : {}),
        ...(jsonObject ? { response_format: { type: "json_object" } } : {}),
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      },
  );
  const metadata = {
    provider: config.provider,
    model: config.model,
    latency_ms: Date.now() - startedAt,
    retry_count: request.retryCount ?? 0,
    token_usage: null,
  };
  if (request.error || !request.response) return { error: request.error, metadata };
  let payload;
  try {
    payload = await request.response.json();
  } catch {
    return { error: "LLM 응답을 JSON으로 파싱하지 못했습니다.", metadata };
  }
  metadata.token_usage = usageFromPayload(payload, config.provider);
  const content = anthropic ? anthropicText(payload) : payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content) {
    const suffix = anthropic && payload?.stop_reason ? ` (stop_reason=${payload.stop_reason})` : "";
    return { error: anthropic ? `Anthropic 응답에 text content가 없습니다.${suffix}` : "LLM 응답에 content가 없습니다.", metadata };
  }
  return { content, metadata };
}
