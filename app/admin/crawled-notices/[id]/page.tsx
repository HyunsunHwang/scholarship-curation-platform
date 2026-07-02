import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadCrawlerDepartments } from "@/lib/crawler-departments";
import type { Scholarship } from "@/lib/database.types";
import type { NoticeDraft } from "@/lib/notice-extraction";
import { splitSpecialInfoValues } from "@/lib/special-info";
import ScholarshipForm from "../../scholarships/ScholarshipForm";
import GenerateDraftButton from "../GenerateDraftButton";
import { promoteNotice } from "../actions";

function isNoticeDraft(value: unknown): value is NoticeDraft {
  return value !== null && typeof value === "object";
}

function buildDefaultValues(params: {
  notice: {
    title: string;
    source_name: string;
    scholarship_type: Scholarship["scholarship_type"];
    notice_posted_at: string | null;
    notice_url: string;
    body: string | null;
    extracted_draft: unknown;
  };
}): Partial<Scholarship> {
  const { notice } = params;
  const draft = isNoticeDraft(notice.extracted_draft)
    ? notice.extracted_draft
    : {};
  const parsedSpecialInfo = splitSpecialInfoValues(draft.qual_special_info ?? []);

  return {
    name: notice.title,
    organization: notice.source_name,
    scholarship_type: notice.scholarship_type,
    support_amount_text: draft.support_amount_text ?? null,
    support_types: (draft.support_types ?? []) as Scholarship["support_types"],
    apply_start_date:
      draft.apply_start_date ?? notice.notice_posted_at ?? "",
    apply_end_date: draft.apply_end_date ?? "",
    announcement_date: draft.announcement_date ?? null,
    selection_count: draft.selection_count ?? null,
    qual_academic_year: draft.qual_academic_year ?? null,
    qual_enrollment_status:
      (draft.qual_enrollment_status as Scholarship["qual_enrollment_status"]) ??
      null,
    qual_major: draft.qual_major ?? null,
    qual_gpa_min: draft.qual_gpa_min ?? null,
    qual_income_level_min: draft.qual_income_level_min ?? null,
    qual_income_level_max: draft.qual_income_level_max ?? null,
    qual_special_info:
      parsedSpecialInfo.matched.length > 0 ? parsedSpecialInfo.matched : null,
    qual_extra_requirements: [
      ...parsedSpecialInfo.extra,
      ...(draft.qual_extra_requirements ?? []),
    ],
    required_documents: draft.required_documents ?? [],
    apply_method: draft.apply_method ?? "",
    contact: draft.contact ?? null,
    note: draft.note ?? null,
    original_notice_text: notice.body ?? null,
    homepage_url: notice.notice_url,
    apply_url: notice.notice_url,
  };
}

export default async function ReviewCrawledNoticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const noticeId = Number.parseInt(id, 10);
  if (Number.isNaN(noticeId)) notFound();

  const supabase = await createClient();
  const [{ data: notice }, { data: universities }, crawlerDepartments] =
    await Promise.all([
      supabase
        .from("crawled_notices")
        .select("*")
        .eq("id", noticeId)
        .single(),
      supabase.from("universities").select("id, name").order("name"),
      loadCrawlerDepartments(),
    ]);

  if (!notice) notFound();

  const universityNames = (universities ?? []).map((u) => u.name);
  const boundAction = promoteNotice.bind(null, noticeId);
  const defaultValues = buildDefaultValues({ notice });

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/crawled-notices"
          className="text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          ← 검수 목록으로
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          공지 검수 후 등록
        </h1>
      </div>

      <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-gray-700">
            {notice.source_name}
          </p>
          <a
            href={notice.notice_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            원문 공지 열기 ↗
          </a>
        </div>
        <p className="mt-1 text-base font-semibold text-gray-900">
          {notice.title}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <GenerateDraftButton noticeId={notice.id} />
          {notice.extracted_draft && (
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
              AI 초안 적용됨
            </span>
          )}
        </div>
        {notice.body && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-gray-500">
              수집된 본문 보기
            </summary>
            <p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-700">
              {notice.body}
            </p>
          </details>
        )}
      </div>

      <ScholarshipForm
        defaultValues={defaultValues}
        action={boundAction}
        submitLabel="장학금으로 등록"
        universities={universityNames}
        universityDepartments={crawlerDepartments.map((entry) => ({
          university: entry.university,
          department: entry.department,
        }))}
        returnPath="/admin/crawled-notices"
      />
    </div>
  );
}
