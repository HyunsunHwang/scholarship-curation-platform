import assert from "node:assert/strict";
import { appendAuditRecord, createAuditRecord } from "../../lib/post-phase-n-q/audit.mjs";

const record = createAuditRecord({
  actor: "operator@example.invalid",
  role: "Operator",
  action: "projector_execution",
  target: "review-item-1",
  timestamp: "2026-07-16T00:00:00.000Z",
  reason: "Explicit non-production projection",
  result: "pass",
  correlationId: "correlation-1",
  metadata: {
    service_role_key: "must-not-survive",
    report_path: "reports/example.json",
  },
});
assert.equal(record.metadata.service_role_key, "[REDACTED]");
assert.equal(appendAuditRecord([], record).length, 1);
assert.equal(appendAuditRecord([record], record).length, 1);
assert.throws(
  () =>
    createAuditRecord({
      actor: "x",
      role: "Administrator",
      action: "x",
      target: "x",
      reason: "x",
      result: "x",
    }),
  /Unsupported audit role/,
);
console.log(JSON.stringify({
  passed: true,
  audit_secret_redaction: true,
  audit_idempotence: true,
  role_contract_enforced: true,
}, null, 2));
