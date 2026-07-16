export const APPROVED_NONPRODUCTION_PROJECT_REF = "hrayfvdggbhfmmzfblly";
export const APPROVED_NONPRODUCTION_PROJECT_URL =
  "https://hrayfvdggbhfmmzfblly.supabase.co";
export const PRODUCTION_PROJECT_REF = "synwudnxdkybwihwmtak";
export const PRODUCTION_READ_CONFIRMATION =
  `READ_ONLY_PRODUCTION_FINGERPRINT_${PRODUCTION_PROJECT_REF}`;
export const NONPRODUCTION_PROJECTOR_CONFIRMATION =
  `PROJECT_REVIEWED_SCHOLARSHIP_${APPROVED_NONPRODUCTION_PROJECT_REF}`;

function clean(value) {
  return String(value ?? "").trim();
}

export function extractSupabaseProjectRef(value) {
  const input = clean(value);
  if (!input) return "";
  try {
    const hostname = new URL(input).hostname.toLowerCase();
    const suffix = ".supabase.co";
    const databaseMatch = hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
    if (databaseMatch) return databaseMatch[1];
    return hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : "";
  } catch {
    const databaseMatch = input.match(/db\.([a-z0-9]+)\.supabase\.co/i);
    return databaseMatch?.[1] ?? "";
  }
}

export function inspectApprovedNonproductionTarget(env = process.env) {
  const projectUrl = clean(env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL);
  const explicitRef = clean(
    env.POST_PHASE_N_TARGET_PROJECT_REF ??
      env.POST_PHASE_L_TARGET_PROJECT_REF,
  );
  const urlRef = extractSupabaseProjectRef(projectUrl);
  const errors = [];

  if (explicitRef !== APPROVED_NONPRODUCTION_PROJECT_REF) {
    errors.push("approved_nonproduction_project_ref_mismatch");
  }
  if (urlRef !== APPROVED_NONPRODUCTION_PROJECT_REF) {
    errors.push("approved_nonproduction_project_url_mismatch");
  }
  if (
    [explicitRef, projectUrl, urlRef].some((value) =>
      value.includes(PRODUCTION_PROJECT_REF),
    )
  ) {
    errors.push("production_target_detected");
  }

  return {
    safe: errors.length === 0,
    errors,
    target_project_ref_match:
      explicitRef === APPROVED_NONPRODUCTION_PROJECT_REF,
    target_url_ref_match: urlRef === APPROVED_NONPRODUCTION_PROJECT_REF,
    production_ref_detected: errors.includes("production_target_detected"),
    secrets_printed: false,
  };
}

export function assertApprovedNonproductionTarget(env = process.env) {
  const result = inspectApprovedNonproductionTarget(env);
  if (!result.safe) {
    throw new Error(
      `Post-Phase N-Q non-production guard blocked: ${result.errors.join(", ")}`,
    );
  }
  return result;
}

export function inspectNonproductionProjectorGate(env = process.env) {
  const target = inspectApprovedNonproductionTarget(env);
  const enabled =
    clean(env.POST_PHASE_O_EXPLICIT_PROJECTOR).toLowerCase() === "true";
  const confirmation = clean(env.POST_PHASE_O_PROJECTOR_CONFIRMATION);
  const errors = [...target.errors];
  if (!enabled) errors.push("explicit_projector_flag_missing");
  if (confirmation !== NONPRODUCTION_PROJECTOR_CONFIRMATION) {
    errors.push("explicit_projector_confirmation_mismatch");
  }
  return {
    ...target,
    safe: errors.length === 0,
    errors,
    projector_enabled: enabled,
    confirmation_match:
      confirmation === NONPRODUCTION_PROJECTOR_CONFIRMATION,
    automatic_public_publish_enabled: false,
  };
}

export function assertNonproductionProjectorGate(env = process.env) {
  const result = inspectNonproductionProjectorGate(env);
  if (!result.safe) {
    throw new Error(
      `Post-Phase O explicit projector guard blocked: ${result.errors.join(", ")}`,
    );
  }
  return result;
}

export function inspectProductionReadGate(env = process.env) {
  const enabled = clean(env.POST_PHASE_N_PRODUCTION_READ).toLowerCase() === "true";
  const projectRef = clean(env.POST_PHASE_N_PRODUCTION_PROJECT_REF);
  const confirmation = clean(env.POST_PHASE_N_PRODUCTION_READ_CONFIRMATION);
  const databaseUrl = clean(env.POST_PHASE_N_PRODUCTION_DATABASE_URL);
  const databaseRef = extractSupabaseProjectRef(databaseUrl);
  const errors = [];

  if (!enabled) errors.push("production_read_flag_missing");
  if (projectRef !== PRODUCTION_PROJECT_REF) {
    errors.push("production_project_ref_mismatch");
  }
  if (confirmation !== PRODUCTION_READ_CONFIRMATION) {
    errors.push("production_read_confirmation_mismatch");
  }
  if (!databaseUrl) errors.push("production_database_url_missing");
  if (databaseUrl && databaseRef !== PRODUCTION_PROJECT_REF) {
    errors.push("production_database_url_ref_mismatch");
  }

  return {
    safe: errors.length === 0,
    errors,
    read_enabled: enabled,
    project_ref_match: projectRef === PRODUCTION_PROJECT_REF,
    confirmation_match: confirmation === PRODUCTION_READ_CONFIRMATION,
    database_ref_match: databaseRef === PRODUCTION_PROJECT_REF,
    database_url_present: Boolean(databaseUrl),
    secrets_printed: false,
  };
}

export function assertProductionReadGate(env = process.env) {
  const result = inspectProductionReadGate(env);
  if (!result.safe) {
    throw new Error(
      `Post-Phase N production read gate blocked: ${result.errors.join(", ")}`,
    );
  }
  return result;
}
