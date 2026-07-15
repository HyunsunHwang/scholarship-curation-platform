import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadCrawlerDepartments } from "@/lib/crawler-departments";
import type { Scholarship } from "@/lib/database.types";
import type { NoticeDraft, NoticeDraftStage } from "@/lib/notice-extraction";
import { redistributeFreeformQualifiers } from "@/lib/notice-extraction";
import { splitSpecialInfoValues } from "@/lib/special-info";
import ScholarshipForm, {
  type SelectionStageDefault,
} from "@/app/admin/scholarships/ScholarshipForm";
import GenerateDraftButton from "@/app/admin/crawled-notices/GenerateDraftButton";
import FormatNoticeBodyButton from "@/app/admin/crawled-notices/FormatNoticeBodyButton";
import { promoteNotice } from "@/app/admin/crawled-notices/actions";

export const maxDuration = 60;

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
    image_urls: string[] | null;
    extracted_draft: unknown;
  };
}): Partial<Scholarship> {
  const { notice } = params;
  const rawDraft = isNoticeDraft(notice.extracted_draft)
    ? notice.extracted_draft
    : {};
  const draft = redistributeFreeformQualifiers(rawDraft);
  const parsedSpecialInfo = splitSpecialInfoValues(draft.qual_special_info ?? []);
  const imageUrls = (notice.image_urls ?? []).filter(
    (url): url is string => typeof url === "string" && url.trim().length > 0
  );

  return {
    name: notice.title,
    organization: notice.source_name,
    scholarship_type: notice.scholarship_type,
    support_amount_text: draft.support_amount_text ?? null,
    support_types: (draft.support_types ?? []) as Scholarship["support_types"],
    apply_start_date: draft.apply_start_date ?? notice.notice_posted_at ?? "",
    apply_end_date: draft.apply_end_date ?? "",
    announcement_date: draft.announcement_date ?? null,
    selection_count: draft.selection_count ?? null,
    qual_university: draft.qual_university ?? null,
    qual_school_location:
      (draft.qual_school_location as Scholarship["qual_school_location"]) ?? null,
    qual_school_category:
      (draft.qual_school_category as Scholarship["qual_school_category"]) ?? null,
    qual_academic_year: draft.qual_academic_year ?? null,
    qual_enrollment_status:
      (draft.qual_enrollment_status as Scholarship["qual_enrollment_status"]) ??
      null,
    qual_major: draft.qual_major ?? null,
    qual_field_codes: draft.qual_field_codes ?? null,
    qual_gpa_min: draft.qual_gpa_min ?? null,
    qual_gpa_last_semester_min: draft.qual_gpa_last_semester_min ?? null,
    qual_last_semester_earned_credits_min:
      draft.qual_last_semester_earned_credits_min ?? null,
    qual_income_level_min: draft.qual_income_level_min ?? null,
    qual_income_level_max: draft.qual_income_level_max ?? null,
    qual_household_size_max: draft.qual_household_size_max ?? null,
    qual_gender: (draft.qual_gender as Scholarship["qual_gender"]) ?? null,
    qual_age_min: draft.qual_age_min ?? null,
    qual_age_max: draft.qual_age_max ?? null,
    qual_region: draft.qual_region ?? null,
    qual_nationality:
      (draft.qual_nationality as Scholarship["qual_nationality"]) ?? null,
    qual_admission_type:
      (draft.qual_admission_type as Scholarship["qual_admission_type"]) ?? null,
    qual_parent_cohabitation:
      (draft.qual_parent_cohabitation as Scholarship["qual_parent_cohabitation"]) ??
      null,
    qual_parent_region: draft.qual_parent_region ?? null,
    qual_parent_occupation:
      (draft.qual_parent_occupation as Scholarship["qual_parent_occupation"]) ??
      null,
    qual_military_status:
      (draft.qual_military_status as Scholarship["qual_military_status"]) ?? null,
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
    original_notice_image_urls: imageUrls.length > 0 ? imageUrls : null,
    original_notice_image_url: imageUrls[0] ?? null,
    homepage_url: notice.notice_url,
    apply_url: notice.notice_url,
  };
}

export default async function ReviewScholarshipNoticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const noticeId = Number.parseInt(id, 10);
  if (Number.isNaN(noticeId)) notFound();

  const supabase = await createClient();
  const { data: notice } = await supabase
    .from("crawled_notices")
    .select("*")
    .eq("id", noticeId)
    .single();

  if (!notice) notFound();

  if (notice.status !== "new") {
    return (
      <div>
        <Link
          href="/admin/review?kind=scholarship"
          className="text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          검토 대기열로 돌아가기
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">검토가 종료된 공고</h1>
        <section className="mt-6 border-y border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-950" aria-label="종료된 검토 상태">
          <p className="font-semibold">이 공고는 이미 {notice.status} 상태입니다.</p>
          <p className="mt-1 leading-6 text-amber-900">
            현재 compatibility lifecycle에서는 이 화면에서 scholarship 레코드를 다시 만들 수 없습니다.
            거절 항목만 검토 대기열에서 복원할 수 있으며, 승인 항목은 연결된 장학금에서 관리합니다.
          </p>
          <dl className="mt-4 grid gap-2 text-xs text-amber-900 sm:grid-cols-2 sm:text-sm">
            <div><dt className="font-medium">소스 ID</dt><dd>{notice.source_id || "확인 불가"}</dd></div>
            <div><dt className="font-medium">검토 시각</dt><dd>{notice.reviewed_at ?? "확인 불가"}</dd></div>
          </dl>
          {notice.status === "promoted" && notice.scholarship_id ? (
            <Link
              href={`/admin/content/scholarships/${notice.scholarship_id}/edit`}
              className="mt-4 inline-flex font-semibold text-brand hover:underline"
            >
              연결된 장학금 레코드 열기
            </Link>
          ) : null}
        </section>
      </div>
    );
  }

  const [{ data: universities }, crawlerDepartments] = await Promise.all([
    supabase.from("universities").select("id, name").order("name"),
    loadCrawlerDepartments(),
  ]);

  const universityNames = (universities ?? []).map((u) => u.name);
  const boundAction = promoteNotice.bind(null, noticeId);
  const defaultValues = buildDefaultValues({ notice });
  const draft = isNoticeDraft(notice.extracted_draft) ? notice.extracted_draft : {};
  const defaultStages: SelectionStageDefault[] = (draft.stages ?? []).map(
    (stage: NoticeDraftStage) => ({
      title: stage.title,
      phase: stage.phase,
      schedule_text: stage.schedule_text,
      note: stage.note,
    })
  );

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/review?kind=scholarship"
          className="text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          ← 검수 큐
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">장학금 검수 후 등록</h1>
      </div>

      <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-gray-700">{notice.source_name}</p>
          <a
            href={notice.notice_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            원문 공지 열기 ↗
          </a>
        </div>
        <p className="mt-1 text-base font-semibold text-gray-900">{notice.title}</p>
        <dl className="mt-3 grid gap-2 text-xs text-gray-600 sm:grid-cols-3">
          <div><dt className="font-medium text-gray-500">소스 ID</dt><dd>{notice.source_id || "확인 불가"}</dd></div>
          <div><dt className="font-medium text-gray-500">본문 근거</dt><dd>{notice.body?.trim() ? "수집됨" : "확인 불가"}</dd></div>
          <div><dt className="font-medium text-gray-500">첨부 메타데이터</dt><dd>{notice.image_urls?.length ?? 0}건</dd></div>
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <GenerateDraftButton noticeId={notice.id} />
          <FormatNoticeBodyButton noticeId={notice.id} />
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

      <section className="mb-6 border-y border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950" aria-label="현재 검토 lifecycle">
        <p className="font-semibold">현재 compatibility lifecycle</p>
        <p className="mt-1 leading-6 text-amber-900">
          이 공고 등록은 기존 DB 기반 `crawled_notices` lifecycle을 사용하고 legacy `scholarships` 레코드를
          만듭니다. append-only review event를 만들거나 crawler public projection을 활성화하지는 않습니다.
        </p>
      </section>

      <ScholarshipForm
        key={`notice-${notice.id}-${notice.updated_at ?? notice.created_at}`}
        defaultValues={defaultValues}
        action={boundAction}
        submitLabel="장학금으로 등록"
        universities={universityNames}
        universityDepartments={crawlerDepartments.map((entry) => ({
          university: entry.university,
          department: entry.department,
        }))}
        defaultStages={defaultStages}
        returnPath="/admin/review?kind=scholarship"
      />
    </div>
  );
}
