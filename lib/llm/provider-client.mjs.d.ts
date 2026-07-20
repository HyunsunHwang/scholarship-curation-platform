export type LlmProviderMetadata = {
  provider: "openai" | "anthropic";
  model: string;
  latency_ms: number;
  retry_count: number;
  token_usage: null | {
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens?: number | null;
  };
};

export function getConfiguredLlmMetadata(): {
  credential_available: boolean;
  provider: "openai" | "anthropic" | null;
  model: string | null;
};

export function callConfiguredLlm(input: {
  systemPrompt: string;
  userPrompt: string;
  jsonObject?: boolean;
  maxTokens?: number;
}): Promise<{ content?: string; error?: string; metadata?: LlmProviderMetadata }>;
