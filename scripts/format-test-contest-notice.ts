/**
 * Format CHAI contest original_notice_text with the same rules as scholarships,
 * then update public.contests.
 *
 *   npx --yes tsx scripts/format-test-contest-notice.ts
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { formatOriginalNoticeText } from "../lib/notice-extraction";
import type { Database } from "../lib/database.types";

function loadEnvLocal() {
  const path = ".env.local";
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: contest, error } = await supabase
    .from("contests")
    .select("id, name, original_notice_text")
    .eq("source", "linkareer")
    .eq("external_id", "329016")
    .maybeSingle();

  if (error || !contest) {
    console.error("contest not found", error);
    process.exit(1);
  }

  const raw = contest.original_notice_text?.trim() ?? "";
  if (!raw) {
    console.error("empty original_notice_text");
    process.exit(1);
  }

  console.log("formatting… length=", raw.length);
  const { text, error: formatError } = await formatOriginalNoticeText({
    title: contest.name,
    body: raw,
  });
  if (formatError) console.warn("format warn:", formatError);
  console.log("formatted length=", text.length);
  console.log("--- preview ---\n", text.slice(0, 600), "\n---");

  const { error: upErr } = await supabase
    .from("contests")
    .update({ original_notice_text: text })
    .eq("id", contest.id);

  if (upErr) {
    console.error(upErr);
    process.exit(1);
  }
  console.log("updated contest", contest.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
