export const POST_PHASE_L_TARGET_PROJECT_REF = "hrayfvdggbhfmmzfblly";
export const POST_PHASE_L_TARGET_PROJECT_URL =
  "https://hrayfvdggbhfmmzfblly.supabase.co";
export const POST_PHASE_L_FORBIDDEN_PROJECT_REF = "synwudnxdkybwihwmtak";
export const POST_PHASE_L_APPLY_TOKEN =
  `APPLY_POST_PHASE_L_${POST_PHASE_L_TARGET_PROJECT_REF}`;

function clean(value) {
  return String(value ?? "").trim();
}

export function extractSupabaseProjectRef(value) {
  const input = clean(value);
  if (!input) return "";
  try {
    const hostname = new URL(input).hostname.toLowerCase();
    const suffix = ".supabase.co";
    return hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : "";
  } catch {
    return "";
  }
}

export function inspectPostPhaseLTarget(
  env = process.env,
  { requireApply = false, additionalInputs = [] } = {},
) {
  const projectUrl = clean(
    env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL,
  );
  const explicitRef = clean(env.POST_PHASE_L_TARGET_PROJECT_REF);
  const urlRef = extractSupabaseProjectRef(projectUrl);
  const applyEnabled = clean(env.POST_PHASE_L_APPLY).toLowerCase() === "true";
  const confirmation = clean(env.POST_PHASE_L_APPLY_CONFIRMATION);
  const inspectedValues = [
    explicitRef,
    projectUrl,
    urlRef,
    confirmation,
    ...additionalInputs.map(clean),
  ];
  const productionRefDetected = inspectedValues.some((value) =>
    value.includes(POST_PHASE_L_FORBIDDEN_PROJECT_REF),
  );

  const errors = [];
  if (!explicitRef) errors.push("target_project_ref_missing");
  if (explicitRef && explicitRef !== POST_PHASE_L_TARGET_PROJECT_REF) {
    errors.push("target_project_ref_mismatch");
  }
  if (!projectUrl) errors.push("target_project_url_missing");
  if (projectUrl && !urlRef) errors.push("target_project_url_invalid");
  if (urlRef && urlRef !== explicitRef) errors.push("target_url_ref_mismatch");
  if (projectUrl && projectUrl !== POST_PHASE_L_TARGET_PROJECT_URL) {
    errors.push("target_project_url_mismatch");
  }
  if (productionRefDetected) errors.push("forbidden_production_ref_detected");
  if (requireApply && !applyEnabled) errors.push("explicit_apply_flag_missing");
  if (requireApply && confirmation !== POST_PHASE_L_APPLY_TOKEN) {
    errors.push("apply_confirmation_token_mismatch");
  }

  return {
    safe: errors.length === 0,
    errors,
    target_project_ref: explicitRef,
    target_project_url: projectUrl,
    target_url_ref: urlRef,
    target_project_ref_match:
      explicitRef === POST_PHASE_L_TARGET_PROJECT_REF && urlRef === explicitRef,
    production_ref_detected: productionRefDetected,
    apply_enabled: applyEnabled,
    apply_confirmation_match: confirmation === POST_PHASE_L_APPLY_TOKEN,
    environment_values_printed: false,
  };
}

export function assertPostPhaseLTarget(env = process.env, options = {}) {
  const result = inspectPostPhaseLTarget(env, options);
  if (!result.safe) {
    throw new Error(`Post-Phase L target guard blocked: ${result.errors.join(", ")}`);
  }
  return result;
}
