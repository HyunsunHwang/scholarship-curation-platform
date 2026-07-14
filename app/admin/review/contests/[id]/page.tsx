import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Contest } from "@/lib/database.types";
import {
  adminKindLabel,
  isContestContentKind,
  type ContestContentKind,
} from "@/lib/admin-kinds";
import { parseContestContentKind } from "@/lib/contest-payload";
import ContestForm from "@/app/admin/content/contests/ContestForm";
import { promoteCrawledContest } from "../actions";
import FormatCrawledContestBodyButton from "../FormatCrawledContestBodyButton";

export const maxDuration = 120;

function isDraftRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

export default async function ReviewContestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ kind?: string }>;
}) {
  const { id } = await params;
  const resolvedSearch = (await searchParams) ?? {};
  const crawledId = Number.parseInt(id, 10);
  if (!Number.isFinite(crawledId)) notFound();

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("crawled_contests")
    .select("*")
    .eq("id", crawledId)
    .single();

  if (error || !row) notFound();

  const kind: ContestContentKind = isContestContentKind(resolvedSearch.kind)
    ? resolvedSearch.kind
    : parseContestContentKind(row.content_kind);

  if (row.content_kind !== kind) notFound();

  const draft = isDraftRecord(row.extracted_draft) ? row.extracted_draft : {};
  const imageUrls = (row.image_urls ?? []).filter(
    (url): url is string => typeof url === "string" && url.trim().length > 0
  );

  const defaultValues: Partial<Contest> & {
    selection_stages?: Array<{
      title: string;
      phase: "selection" | "post_acceptance";
      schedule_text?: string | null;
      note?: string | null;
    }>;
  } = {
    name: asString(draft.name) ?? row.title,
    organization: asString(draft.organization) ?? row.source_name,
    organization_type: asString(draft.organization_type),
    content_kind: kind,
    support_amount_text: asString(draft.support_amount_text),
    selection_count:
      typeof draft.selection_count === "number" ? draft.selection_count : null,
    apply_start_date: asString(draft.apply_start_date) ?? row.notice_posted_at,
    apply_end_date: asString(draft.apply_end_date),
    announcement_date: asString(draft.announcement_date),
    targets: asStringArray(draft.targets),
    benefits: asStringArray(draft.benefits),
    apply_types: asStringArray(draft.apply_types),
    interest_categories: asStringArray(draft.interest_categories) as Contest["interest_categories"],
    required_documents: asStringArray(draft.required_documents),
    document_files: row.document_files ?? [],
    apply_method: asString(draft.apply_method) ?? "",
    apply_url: asString(draft.apply_url) ?? row.notice_url ?? "",
    homepage_url: asString(draft.homepage_url),
    contact: asString(draft.contact),
    note: asString(draft.note),
    selection_note: asString(draft.selection_note),
    poster_image_url: asString(draft.poster_image_url) ?? row.poster_image_url,
    original_notice_image_urls: imageUrls,
    // 원문 섹션 body가 소스 오브 트루스 (본문 형식 정리 후 폼과 동기화)
    original_notice_text: row.body?.trim() || asString(draft.original_notice_text),
    source: row.source_group,
    external_id: row.source_id,
    source_url: row.notice_url,
    // 검수 후 등록 = 바로 공개 (체크박스 hidden+true 패턴은 payload에서 getAll 처리)
    is_verified: true,
    list_on_home: true,
    is_recommended: false,
    selection_stages: Array.isArray(draft.stages)
      ? draft.stages.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const s = item as Record<string, unknown>;
          const title = typeof s.title === "string" ? s.title.trim() : "";
          if (!title) return [];
          return [
            {
              title,
              phase:
                s.phase === "post_acceptance"
                  ? ("post_acceptance" as const)
                  : ("selection" as const),
              schedule_text:
                typeof s.schedule_text === "string" ? s.schedule_text : null,
              note: typeof s.note === "string" ? s.note : null,
            },
          ];
        })
      : [],
  };

  const boundPromote = promoteCrawledContest.bind(null, crawledId, kind);

  // 원문 정리·추출 후 router.refresh() 시 defaultValues만 바뀌고
  // ContestForm 내부 useState는 유지되므로, draft 내용이 바뀌면 폼을 리마운트한다.
  const formResetKey = [
    crawledId,
    (row.body ?? "").length,
    asString(draft.announcement_date) ?? "",
    asStringArray(draft.benefits).join("|"),
    Array.isArray(draft.stages)
      ? draft.stages
          .map((item) => {
            if (!item || typeof item !== "object") return "";
            const s = item as Record<string, unknown>;
            return `${String(s.title ?? "")}:${String(s.schedule_text ?? "")}`;
          })
          .join(",")
      : "",
  ].join("::");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/review?kind=${kind}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← 검수 큐
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          {adminKindLabel(kind)} 검수
        </h1>
        <p className="mt-1 text-sm text-gray-500">{row.title}</p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900">원문</h2>
          <div className="flex items-center gap-2">
            <a
              href={row.notice_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              원문 링크
            </a>
            <FormatCrawledContestBodyButton crawledId={crawledId} />
          </div>
        </div>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
          {row.body?.trim() || "(본문 없음)"}
        </pre>
      </section>

      <ContestForm
        key={formResetKey}
        defaultValues={defaultValues}
        action={boundPromote}
        submitLabel={`${adminKindLabel(kind)}으로 등록`}
        returnPath={`/admin/review?kind=${kind}`}
        lockedKind={kind}
      />
    </div>
  );
}
