import fs from "node:fs";
import path from "node:path";
import {
  assertPostPhaseLTarget,
} from "../lib/post-phase-l/target-guard.mjs";

function loadLocalEnvironment() {
  if (typeof process.loadEnvFile !== "function") return;
  const envPath = path.resolve(".env.local");
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

async function main() {
  if (!process.argv.includes("--apply")) {
    throw new Error("Test-admin bootstrap is apply-only and requires --apply");
  }
  loadLocalEnvironment();
  const guard = assertPostPhaseLTarget(process.env, {
    requireApply: true,
    additionalInputs: process.argv.slice(2),
  });
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const email = process.env.POST_PHASE_L_TEST_ADMIN_EMAIL ?? "";
  const password = process.env.POST_PHASE_L_TEST_ADMIN_PASSWORD ?? "";
  if (!serviceRoleKey || !email || !password) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY, POST_PHASE_L_TEST_ADMIN_EMAIL, and POST_PHASE_L_TEST_ADMIN_PASSWORD are required",
    );
  }
  if (password.length < 12) throw new Error("Test-admin password must contain at least 12 characters");

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(guard.target_project_url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Post-Phase L Test Admin" },
  });
  if (error && !/already.*registered|already.*exists/i.test(error.message)) {
    throw new Error(`Test-admin auth creation failed: ${error.message}`);
  }

  let userId = data.user?.id ?? null;
  if (!userId) {
    const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (listError) throw new Error(`Test-admin lookup failed: ${listError.message}`);
    userId = listed.users.find((user) => user.email === email)?.id ?? null;
  }
  if (!userId) throw new Error("Test-admin user ID could not be resolved");

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({
      id: userId,
      email,
      role: "admin",
      name: "Post-Phase L Test Admin",
      is_onboarded: false,
      is_org_manager: false,
    }, { onConflict: "id" });
  if (profileError) throw new Error(`Test-admin profile bootstrap failed: ${profileError.message}`);

  console.log("post_phase_l_test_admin_ready=true");
  console.log("credential_values_printed=false");
  console.log("production_ref_detected=false");
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exitCode = 1;
});
