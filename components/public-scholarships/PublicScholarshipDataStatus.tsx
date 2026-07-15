import type { PublicScholarshipReadModelStatus } from "@/lib/scholarships/public-scholarship-read-model";

function formatSnapshotDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("ko-KR");
}

export function PublicScholarshipDataStatus({
  status,
}: {
  status: PublicScholarshipReadModelStatus;
}) {
  return (
    <section
      aria-label="Scholarship data status"
      className="border-y border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-80">
          <p className="font-semibold">현재 공개 범위: 검토된 보고서 스냅샷</p>
          <p className="mt-1 break-words leading-6 text-amber-900">
            이 목록은 실시간 크롤링 또는 DB 공개 projection이 아닙니다. 공개 조건을 통과한 항목만
            표시하며, 출처 누락·검토 대기·품질 위험 항목은 공개하지 않습니다.
          </p>
        </div>
        <dl className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-1 text-xs text-amber-900 sm:grid-cols-2 sm:text-sm">
          <div>
            <dt className="font-medium">스냅샷 기준일</dt>
            <dd>{formatSnapshotDate(status.generatedAt)}</dd>
          </div>
          <div>
            <dt className="font-medium">공개 가능 항목</dt>
            <dd>{status.publicItemCount}건</dd>
          </div>
          <div>
            <dt className="font-medium">보류/비공개 항목</dt>
            <dd>{status.hiddenItemCount}건</dd>
          </div>
          <div>
            <dt className="font-medium">첨부 검증</dt>
            <dd className="break-words">원문에서 별도 확인 필요</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
