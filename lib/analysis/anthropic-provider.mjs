import { resolveAnalysisModel } from "./analysis-policy.mjs";

export async function callAnthropic({
  prompt,
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = resolveAnalysisModel(),
  timeoutMs = 45_000,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) throw Object.assign(new Error("ANTHROPIC_API_KEY is required"), {
    code: "provider_credentials_missing",
    retryable: false,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw Object.assign(new Error(`Anthropic request failed (${response.status})`), {
        code: "provider_transport_error",
        retryable: response.status === 429 || response.status >= 500,
      });
    }
    const text = payload?.content?.find((entry) => entry.type === "text")?.text;
    if (!text) {
      throw Object.assign(new Error("Anthropic response contained no text"), {
        code: "provider_empty_content",
        retryable: true,
      });
    }
    return {
      text,
      provider: "anthropic",
      model: payload.model ?? model,
      request_id: response.headers.get("request-id"),
      latency_ms: Date.now() - started,
      usage: {
        input_tokens: payload.usage?.input_tokens ?? null,
        output_tokens: payload.usage?.output_tokens ?? null,
        cached_input_tokens: payload.usage?.cache_read_input_tokens ?? null,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
