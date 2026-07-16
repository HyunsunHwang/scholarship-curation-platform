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
  const databaseBacked = status.dataBacking === "database-backed";
  const degraded = status.serviceState === "degraded";
  const tone = degraded
    ? "border-red-200 bg-red-50 text-red-950"
    : databaseBacked
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : "border-amber-200 bg-amber-50 text-amber-950";
  const detailTone = degraded
    ? "text-red-900"
    : databaseBacked
      ? "text-emerald-900"
      : "text-amber-900";

  return (
    <section
      aria-label="Scholarship data status"
      className={`border-y px-4 py-4 text-sm ${tone}`}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-80">
          <p className="font-semibold">
            {degraded
              ? "현재 공개 범위: DB 조회 실패로 비공개"
              : databaseBacked
                ? "현재 공개 범위: 검토 승인된 DB projection"
                : "현재 공개 범위: 검토된 보고서 스냅샷"}
          </p>
          <p className={`mt-1 break-words leading-6 ${detailTone}`}>
            {degraded
              ? "공개 상태를 확인할 수 없어 대체 데이터를 노출하지 않고 빈 목록으로 닫았습니다."
              : databaseBacked
                ? "사람의 승인 이벤트를 거쳐 명시적 projector가 공개한 활성 항목만 표시합니다. 거절·철회·마감 항목은 목록과 검색에서 제외합니다."
                : "이 목록은 실시간 크롤링 또는 DB 공개 projection이 아닙니다. 공개 조건을 통과한 항목만 표시하며, 출처 누락·검토 대기·품질 위험 항목은 공개하지 않습니다."}
          </p>
        </div>
        <dl className={`grid min-w-0 grid-cols-1 gap-x-5 gap-y-1 text-xs sm:grid-cols-2 sm:text-sm ${detailTone}`}>
          <div>
            <dt className="font-medium">{databaseBacked ? "조회 기준일" : "스냅샷 기준일"}</dt>
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
