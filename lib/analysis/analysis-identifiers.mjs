import { createHash } from "node:crypto";

export function analysisSha256(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}
export function stableAnalysisUuid(namespace, value) {
  const chars = analysisSha256(`${namespace}\u0000${value}`).slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
