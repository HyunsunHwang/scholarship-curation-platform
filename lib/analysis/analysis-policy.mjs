export const ANALYSIS_PROVIDER = "anthropic";
export const ANALYSIS_MODEL_POLICY = "claude-sonnet-5";
export const ANALYSIS_PROMPT_VERSION = "scholarship-analysis-prompt-v1";
export const ANALYSIS_SCHEMA_VERSION = "scholarship-analysis-v1";

export function resolveAnalysisModel(env = process.env) {
  return String(env.ANTHROPIC_MODEL ?? env.LLM_MODEL ?? ANALYSIS_MODEL_POLICY).trim();
}
