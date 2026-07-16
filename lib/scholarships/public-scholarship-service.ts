import { createClient } from "@/lib/supabase/server";
import {
  filterPublicScholarships,
  getPublicScholarshipFilterOptions,
  getPublicScholarshipReadModelStatus,
  type PublicScholarship,
  type PublicScholarshipReadModelStatus,
} from "./public-scholarship-read-model";

type PublicScholarshipPageOptions = {
  query?: string;
  organization?: string;
  category?: string;
};

type PublicScholarshipDatabaseRow = {
  id: number;
  name: string;
  organization: string;
  scholarship_type: string;
  support_types: string[];
  support_amount_text: string | null;
  apply_start_date: string;
  apply_end_date: string;
  apply_url: string;
  homepage_url: string | null;
  original_notice_text: string | null;
  collected_at: string;
};

function todayInKorea() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function toPublicScholarship(row: PublicScholarshipDatabaseRow): PublicScholarship {
  const body = row.original_notice_text?.trim() || row.support_amount_text?.trim() || "";
  return {
    id: String(row.id),
    canonicalKey: `db-scholarship-${row.id}`,
    sourceId: null,
    sourceKey: "review-projection",
    title: row.name,
    organization: row.organization,
    category: row.scholarship_type === "off_campus" ? "교외 장학금" : "교내 장학금",
    targetLabels: row.support_types ?? [],
    keywordLabels: [],
    publishedAt: row.collected_at.slice(0, 10),
    summary: body.slice(0, 180),
    body,
    sourceUrl: row.homepage_url || row.apply_url,
    attachments: [],
    noAssets: true,
    provenanceLabel: "검토 승인된 DB 공개 항목",
  };
}

function filterRows(
  rows: PublicScholarship[],
  options: PublicScholarshipPageOptions,
) {
  const query = options.query?.trim().toLocaleLowerCase("ko-KR") ?? "";
  return rows.filter((row) => {
    if (options.organization && row.organization !== options.organization) return false;
    if (options.category && row.category !== options.category) return false;
    if (!query) return true;
    return [
      row.title,
      row.organization,
      row.category,
      row.summary,
      ...row.targetLabels,
    ]
      .join(" ")
      .toLocaleLowerCase("ko-KR")
      .includes(query);
  });
}

export async function getPublicScholarshipPageModel(
  options: PublicScholarshipPageOptions,
) {
  if (process.env.POST_PHASE_O_DB_PUBLIC_READ_MODEL !== "true") {
    const filterOptions = getPublicScholarshipFilterOptions();
    return {
      scholarships: filterPublicScholarships(options),
      organizations: filterOptions.organizations,
      categories: filterOptions.categories,
      status: getPublicScholarshipReadModelStatus(),
    };
  }

  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("scholarships")
    .select(
      "id, name, organization, scholarship_type, support_types, support_amount_text, apply_start_date, apply_end_date, apply_url, homepage_url, original_notice_text, collected_at",
      { count: "exact" },
    )
    .eq("is_verified", true)
    .eq("list_on_home", true)
    .gte("apply_end_date", todayInKorea())
    .order("apply_end_date", { ascending: true })
    .order("id", { ascending: true })
    .limit(200);

  if (error) {
    const status: PublicScholarshipReadModelStatus = {
      dataBacking: "database-backed",
      serviceState: "degraded",
      generatedAt: new Date().toISOString(),
      sourceReport: null,
      inputCandidateCount: 0,
      publicItemCount: 0,
      hiddenItemCount: 0,
      exposurePolicy: "fail-closed",
      attachmentsVerified: false,
      limitations: [
        "DB 공개 projection 조회가 실패해 보고서 데이터로 대체하지 않고 빈 목록으로 닫았습니다.",
      ],
    };
    return {
      scholarships: [],
      organizations: [],
      categories: [],
      status,
    };
  }

  const rows = (data ?? []).map((row) =>
    toPublicScholarship(row as unknown as PublicScholarshipDatabaseRow),
  );
  const organizations = [...new Set(rows.map((row) => row.organization))].sort();
  const categories = [...new Set(rows.map((row) => row.category))].sort();
  const scholarships = filterRows(rows, options);
  const status: PublicScholarshipReadModelStatus = {
    dataBacking: "database-backed",
    serviceState: "controlled-beta",
    generatedAt: new Date().toISOString(),
    sourceReport: null,
    inputCandidateCount: count ?? rows.length,
    publicItemCount: rows.length,
    hiddenItemCount: Math.max(0, (count ?? rows.length) - rows.length),
    exposurePolicy: "fail-closed",
    attachmentsVerified: false,
    limitations: [
      "명시적 projector가 공개한 검토 승인 항목만 표시합니다.",
      "마감된 항목은 활성 목록과 검색에서 제외합니다.",
    ],
  };
  return { scholarships, organizations, categories, status };
}
