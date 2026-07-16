import fs from "node:fs";
import path from "node:path";
import {
  ATTACHMENT_SECURITY_LIMITS,
  inspectDownloadedAttachment,
  validateAttachmentUrl,
} from "../../lib/post-phase-n-q/attachments.mjs";

const ROOT = process.cwd();

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

async function fetchBounded(rawUrl, allowedHosts) {
  let current = rawUrl;
  for (
    let redirectCount = 0;
    redirectCount <= ATTACHMENT_SECURITY_LIMITS.redirect_limit;
    redirectCount += 1
  ) {
    const urlCheck = validateAttachmentUrl(current, allowedHosts);
    if (!urlCheck.allowed) throw new Error(`Attachment URL blocked: ${urlCheck.reason}`);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(ATTACHMENT_SECURITY_LIMITS.timeout_ms),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect response has no location");
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) throw new Error(`Attachment HTTP status ${response.status}`);
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (
      contentLength > 0 &&
      contentLength > ATTACHMENT_SECURITY_LIMITS.max_byte_size
    ) {
      throw new Error("Attachment content-length exceeds the byte limit");
    }
    const chunks = [];
    let byteCount = 0;
    for await (const chunk of response.body) {
      byteCount += chunk.length;
      if (byteCount > ATTACHMENT_SECURITY_LIMITS.max_byte_size) {
        throw new Error("Attachment stream exceeds the byte limit");
      }
      chunks.push(chunk);
    }
    return {
      url: current,
      redirectCount,
      contentType: response.headers.get("content-type") ?? "",
      contentDisposition: response.headers.get("content-disposition") ?? "",
      bytes: Buffer.concat(chunks),
    };
  }
  throw new Error("Attachment redirect limit exceeded");
}

const args = parseArgs(process.argv.slice(2));
const rawUrl = String(args.url ?? "");
const sourceHost = String(args.host ?? "");
const output = String(
  args.output ?? "reports/post-phase-n-q/live-attachment-inspection.json",
);
if (!rawUrl || !sourceHost) {
  throw new Error("--url and --host are required");
}

const downloaded = await fetchBounded(rawUrl, [sourceHost]);
const dispositionName = downloaded.contentDisposition.match(
  /filename\*?=(?:UTF-8''|"?)([^";]+)/i,
)?.[1];
const filename = dispositionName
  ? decodeURIComponent(dispositionName.replaceAll('"', ""))
  : new URL(downloaded.url).pathname.split("/").at(-1) || "attachment";
const inspection = inspectDownloadedAttachment({
  filename,
  url: downloaded.url,
  contentType: downloaded.contentType,
  bytes: downloaded.bytes,
  allowedHosts: [sourceHost],
  redirectCount: downloaded.redirectCount,
  parserAttempted: false,
});
const report = {
  generated_at: new Date().toISOString(),
  contract_version: "post-phase-p-live-attachment-inspection/v1",
  evidence_kind: "live_public",
  source_key: String(args["source-key"] ?? "unknown"),
  filename: inspection.filename ?? filename,
  url_hash: inspection.url_hash ?? null,
  content_hash: inspection.content_hash ?? null,
  byte_count: inspection.byte_count ?? downloaded.bytes.length,
  mime: inspection.mime ?? downloaded.contentType,
  parser_result: inspection.status,
  stages: inspection.stages,
  live_file_committed: false,
  external_llm_upload_performed: false,
  arbitrary_execution_performed: false,
  document_network_access_enabled: false,
  tls_verification_disabled: false,
  production_access_performed: false,
};
const resolved = path.resolve(ROOT, output);
fs.mkdirSync(path.dirname(resolved), { recursive: true });
fs.writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  passed: Boolean(report.content_hash),
  parser_result: report.parser_result,
  byte_count: report.byte_count,
  live_file_committed: false,
  output_path: path.relative(ROOT, resolved).replaceAll("\\", "/"),
}, null, 2));
