import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assertApprovedNonproductionTarget } from "../../lib/post-phase-n-q/safety.mjs";

const ROOT = process.cwd();

function loadEnvironment() {
  if (typeof process.loadEnvFile !== "function") return;
  const envPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

async function rows(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label} failed: ${error.message}`);
  return data ?? [];
}

async function bootstrapAdmin(serviceClient) {
  const nonce = crypto.randomBytes(8).toString("hex");
  const email = `post-phase-nq-browser-${nonce}@example.invalid`;
  const password = `${crypto.randomBytes(24).toString("base64url")}aA1!`;
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Post-Phase N-Q Browser Reviewer" },
  });
  if (error) throw new Error(`Browser admin bootstrap failed: ${error.message}`);
  const userId = data.user?.id;
  if (!userId) throw new Error("Browser admin id is missing");
  const { error: profileError } = await serviceClient.from("profiles").upsert(
    {
      id: userId,
      email,
      role: "admin",
      name: "Post-Phase N-Q Browser Reviewer",
      is_onboarded: false,
      is_org_manager: false,
    },
    { onConflict: "id" },
  );
  if (profileError) throw new Error(`Browser admin profile failed: ${profileError.message}`);
  return { email, password, userId };
}

async function applyDecision({
  userClient,
  legacyNoticeId,
  decision,
  scholarshipId,
  key,
}) {
  const { data, error } = await userClient.rpc(
    "post_phase_l_apply_legacy_review_decision",
    {
      p_legacy_notice_id: legacyNoticeId,
      p_decision: decision,
      p_reason: `Post-Phase N-Q browser walkthrough ${decision}`,
      p_event_idempotency_key: key,
      p_scholarship_id: scholarshipId,
    },
  );
  if (error) throw new Error(`Browser ${decision} failed: ${error.message}`);
  return data;
}

async function main() {
  loadEnvironment();
  const mode = process.argv.includes("--show")
    ? "show"
    : process.argv.includes("--hide")
      ? "hide"
      : null;
  if (!mode) throw new Error("Use --show or --hide");
  const guard = assertApprovedNonproductionTarget(process.env);
  const rehearsal = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "reports/post-phase-n-q/integrated-rehearsal.json"),
      "utf8",
    ),
  );
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!serviceRoleKey || !anonKey) throw new Error("Supabase keys are required");
  const serviceClient = createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userClient = createClient(projectUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = await bootstrapAdmin(serviceClient);
  const { error: signInError } = await userClient.auth.signInWithPassword({
    email: admin.email,
    password: admin.password,
  });
  if (signInError) throw new Error(`Browser admin sign-in failed: ${signInError.message}`);
  const legacyRows = await rows(
    serviceClient
      .from("crawled_notices")
      .select("id, status, scholarship_id")
      .eq("id", rehearsal.legacy_compatibility_notice_id)
      .limit(1),
    "browser legacy notice",
  );
  const legacy = legacyRows[0];
  if (mode === "show") {
    if (legacy.status === "rejected") {
      await applyDecision({
        userClient,
        legacyNoticeId: legacy.id,
        decision: "reopen",
        scholarshipId: null,
        key: "post-phase-nq-browser:reopen:v1",
      });
      await applyDecision({
        userClient,
        legacyNoticeId: legacy.id,
        decision: "approve",
        scholarshipId: rehearsal.scholarship_id,
        key: "post-phase-nq-browser:approve:v1",
      });
    }
    const { error } = await serviceClient
      .from("scholarships")
      .update({ is_verified: true, list_on_home: true })
      .eq("id", rehearsal.scholarship_id);
    if (error) throw new Error(`Browser projection show failed: ${error.message}`);
    const credentialsPath = path.join(
      os.tmpdir(),
      "post-phase-nq-browser-admin.json",
    );
    fs.writeFileSync(
      credentialsPath,
      JSON.stringify({ email: admin.email, password: admin.password }),
      { encoding: "utf8", mode: 0o600 },
    );
  } else {
    if (legacy.status === "promoted") {
      await applyDecision({
        userClient,
        legacyNoticeId: legacy.id,
        decision: "reject",
        scholarshipId: null,
        key: "post-phase-nq-browser:reject:v1",
      });
    }
    const { error } = await serviceClient
      .from("scholarships")
      .update({ is_verified: false, list_on_home: false })
      .eq("id", rehearsal.scholarship_id);
    if (error) throw new Error(`Browser projection hide failed: ${error.message}`);
    fs.rmSync(path.join(os.tmpdir(), "post-phase-nq-browser-admin.json"), {
      force: true,
    });
  }
  const visibleRows = await rows(
    serviceClient
      .from("scholarships")
      .select("id")
      .eq("id", rehearsal.scholarship_id)
      .eq("is_verified", true)
      .eq("list_on_home", true),
    "browser projection verification",
  );
  const report = {
    generated_at: new Date().toISOString(),
    contract_version: "post-phase-q-browser-rehearsal-state/v1",
    evidence_kind: "database_nonproduction",
    mode,
    scholarship_id: rehearsal.scholarship_id,
    visible: visibleRows.length === 1,
    credentials_written_to_temporary_file: mode === "show",
    credentials_printed: false,
    production_access_performed: false,
    automatic_public_publish_count: 0,
    guard,
    passed:
      (mode === "show" && visibleRows.length === 1) ||
      (mode === "hide" && visibleRows.length === 0),
  };
  fs.writeFileSync(
    path.join(ROOT, "reports/post-phase-n-q/browser-rehearsal-state.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify({
    passed: report.passed,
    mode,
    visible: report.visible,
    credentials_printed: false,
    production_access_performed: false,
  }, null, 2));
  if (!report.passed) process.exitCode = 1;
}

await main();
