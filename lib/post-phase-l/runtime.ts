import {
  POST_PHASE_L_TARGET_PROJECT_REF,
  extractSupabaseProjectRef,
} from "./target-guard.mjs";

export function isPostPhaseLEnvironment() {
  return (
    extractSupabaseProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL) ===
    POST_PHASE_L_TARGET_PROJECT_REF
  );
}

export function getPostPhaseLRuntimeState() {
  const active = isPostPhaseLEnvironment();
  return {
    active,
    targetProjectRef: active ? POST_PHASE_L_TARGET_PROJECT_REF : null,
    automaticPublicPublishEnabled: false,
    externalLlmEnabled: false,
  };
}
