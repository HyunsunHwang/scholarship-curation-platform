import crypto from "node:crypto";

const SENSITIVE_KEY = /secret|password|credential|token|authorization|api[_-]?key|service[_-]?role/i;

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitize(nested),
    ]),
  );
}

export function createAuditRecord({
  actor,
  role,
  action,
  target,
  reason,
  result,
  correlationId = crypto.randomUUID(),
  timestamp = new Date().toISOString(),
  metadata = {},
}) {
  if (!["Reviewer", "Operator", "Owner", "System"].includes(role)) {
    throw new Error(`Unsupported audit role: ${role}`);
  }
  return {
    audit_id: crypto
      .createHash("sha256")
      .update(`${correlationId}:${timestamp}:${action}:${target}`)
      .digest("hex"),
    actor,
    role,
    action,
    target,
    timestamp,
    reason,
    result,
    correlation_id: correlationId,
    metadata: sanitize(metadata),
  };
}

export function appendAuditRecord(history, record) {
  if (history.some((item) => item.audit_id === record.audit_id)) return history;
  return [...history, record];
}
