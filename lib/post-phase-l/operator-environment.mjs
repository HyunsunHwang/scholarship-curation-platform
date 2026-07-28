import process from "node:process";
import {
  assertPostPhaseLTarget,
  POST_PHASE_L_TARGET_PROJECT_REF,
} from "./target-guard.mjs";

const PERMISSIONS = {
  read: "POST_PHASE_L_ALLOW_DB_READ",
  write: "POST_PHASE_L_ALLOW_DB_WRITE",
  liveProvider: "POST_PHASE_L_ALLOW_LIVE_PROVIDER",
};

function enabled(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

export function assertExplicitOperatorEnvironment(
  env = process.env,
  { requireApply = false, permissions = [], requireServiceRole = false } = {},
) {
  const guard = assertPostPhaseLTarget(env, { requireApply });
  const missing = permissions
    .filter((permission) => !enabled(env[PERMISSIONS[permission]]))
    .map((permission) => `operator_permission_missing:${permission}`);
  if (requireServiceRole && !String(env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()) {
    missing.push("service_role_key_missing");
  }
  if (missing.length) throw new Error(`operator_environment_blocked:${missing.join(",")}`);
  return {
    ...guard,
    permissions: Object.fromEntries(
      Object.entries(PERMISSIONS).map(([name, key]) => [name, enabled(env[key])]),
    ),
    service_role_present: Boolean(String(env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()),
    secrets_printed: false,
  };
}

export function assertOperatorCliFlags(
  options,
  { read = false, write = false, liveProvider = false } = {},
) {
  const required = [
    read && "allow-nonproduction-db-read",
    write && "allow-nonproduction-db-write",
    liveProvider && "allow-live-provider",
  ].filter(Boolean);
  const missing = required.filter((flag) => !options[flag]);
  if (missing.length) throw new Error(`operator_cli_flag_missing:${missing.join(",")}`);
  return true;
}

export function assertLiveProviderDoubleGate(
  options,
  env = process.env,
  { live = false } = {},
) {
  if (!live) return { live: false, cli_allowed: false, environment_allowed: false };
  assertOperatorCliFlags(options, { liveProvider: true });
  if (!enabled(env[PERMISSIONS.liveProvider])) {
    throw new Error("operator_environment_blocked:operator_permission_missing:liveProvider");
  }
  return { live: true, cli_allowed: true, environment_allowed: true };
}

export function operatorEnvironmentSummary(guard) {
  return {
    target_project_ref: guard.target_project_ref,
    target_project_ref_match:
      guard.target_project_ref === POST_PHASE_L_TARGET_PROJECT_REF,
    production_ref_detected: guard.production_ref_detected,
    apply_enabled: guard.apply_enabled,
    permissions: guard.permissions,
    service_role_present: guard.service_role_present,
    secrets_printed: false,
  };
}
