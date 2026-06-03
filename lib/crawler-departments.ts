import { readFile } from "node:fs/promises";
import path from "node:path";

export type CrawlerDepartmentEntry = {
  group: string;
  university: string;
  department: string;
};

const GROUP_ALIASES: Record<string, string[]> = {
  cau: ["중앙대", "중앙대학교"],
  ewha: ["이화여대", "이화여자대학교"],
  hanyang: ["한양대", "한양대학교"],
  hongik: ["홍익대", "홍익대학교"],
  khu: ["경희대", "경희대학교"],
  korea: ["고려대", "고려대학교"],
  skku: ["성균관대", "성균관대학교"],
  uos: ["서울시립대", "서울시립대학교", "시립대"],
  yonsei: ["연세대", "연세대학교"],
};

function cleanText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === "\"" && next === "\"") {
        field += "\"";
        i += 1;
      } else if (ch === "\"") {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === "\"") {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function removeKnownUniversityPrefix(sourceName: string, group: string): string {
  const aliases = GROUP_ALIASES[group] ?? [];
  let next = sourceName;

  for (const alias of aliases) {
    const regex = new RegExp(`^${alias}\\s*`);
    next = next.replace(regex, "");
  }

  return cleanText(next);
}

function extractDepartment(sourceName: string, group: string): string | null {
  const withoutPrefix = removeKnownUniversityPrefix(cleanText(sourceName), group)
    .replace(/\(중앙\)/g, "")
    .replace(/\s*합쳐진\s*듯.*$/g, "")
    .trim();

  if (!withoutPrefix) return null;
  if (/(장학공지|공지\(중앙\)|중앙)/.test(withoutPrefix)) return null;
  return withoutPrefix;
}

export function getCrawlerAliasesByGroup() {
  return GROUP_ALIASES;
}

export async function loadCrawlerDepartments(): Promise<CrawlerDepartmentEntry[]> {
  const csvPath = path.join(process.cwd(), "data", "notice-sources.csv");
  const raw = (await readFile(csvPath, "utf8")).replace(/^\uFEFF/, "");
  const table = parseCsv(raw);
  if (table.length === 0) return [];

  const [header, ...body] = table;
  const index = Object.fromEntries(header.map((name, idx) => [name, idx]));
  const sourceIdIdx = index.source_id as number | undefined;
  const sourceNameIdx = index.source_name as number | undefined;
  const enabledIdx = index.enabled as number | undefined;
  if (sourceIdIdx == null || sourceNameIdx == null) return [];

  const dedup = new Set<string>();
  const rows: CrawlerDepartmentEntry[] = [];

  for (const row of body) {
    const enabled = cleanText(enabledIdx == null ? "true" : row[enabledIdx]).toLowerCase();
    if (enabled && ["false", "0", "no", "n"].includes(enabled)) continue;

    const sourceId = cleanText(row[sourceIdIdx]);
    const sourceName = cleanText(row[sourceNameIdx]);
    if (!sourceId || !sourceName) continue;

    const group = sourceId.split("_")[0];
    const department = extractDepartment(sourceName, group);
    if (!department) continue;

    const university = (GROUP_ALIASES[group] ?? [group])[0];
    const key = `${group}::${department}`;
    if (dedup.has(key)) continue;
    dedup.add(key);
    rows.push({ group, university, department });
  }

  return rows.sort((a, b) => {
    if (a.group !== b.group) return a.group.localeCompare(b.group, "ko");
    return a.department.localeCompare(b.department, "ko");
  });
}
