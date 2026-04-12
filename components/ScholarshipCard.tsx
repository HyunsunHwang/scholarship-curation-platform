import { Badge } from "@/components/ui/badge";
import { getDaysUntilDeadline, type Scholarship } from "@/lib/mock-data";

const categoryColors: Record<string, string> = {
  성적우수: "bg-blue-50 text-blue-700 border-blue-200",
  소득기준: "bg-green-50 text-green-700 border-green-200",
  지역: "bg-orange-50 text-orange-700 border-orange-200",
  기업: "bg-purple-50 text-purple-700 border-purple-200",
  특기: "bg-pink-50 text-pink-700 border-pink-200",
  국가: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

function DeadlineBadge({ deadline }: { deadline: string }) {
  const days = getDaysUntilDeadline(deadline);

  if (days < 0) {
    return (
      <span className="text-xs font-medium text-gray-400">마감됨</span>
    );
  }

  if (days <= 7) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        D-{days}
      </span>
    );
  }

  if (days <= 30) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        D-{days}
      </span>
    );
  }

  return (
    <span className="text-xs text-gray-500">
      {new Date(deadline).toLocaleDateString("ko-KR", {
        month: "long",
        day: "numeric",
      })}{" "}
      마감
    </span>
  );
}

export default function ScholarshipCard({
  scholarship,
}: {
  scholarship: Scholarship;
}) {
  const categoryColorClass =
    categoryColors[scholarship.category] ??
    "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <div className="group flex flex-col rounded-xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${categoryColorClass}`}
          >
            {scholarship.category}
          </span>
          {scholarship.isNew && (
            <span className="inline-flex items-center rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-semibold text-white">
              NEW
            </span>
          )}
        </div>
        <DeadlineBadge deadline={scholarship.deadline} />
      </div>

      <div className="mt-3 flex-1">
        <p className="text-xs font-medium text-gray-500">
          {scholarship.organization}
        </p>
        <h3 className="mt-1 text-base font-semibold leading-snug text-gray-900 group-hover:text-indigo-600 transition-colors">
          {scholarship.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-500">
          {scholarship.description}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {scholarship.tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="rounded-full bg-gray-100 px-2.5 text-xs font-normal text-gray-600 hover:bg-gray-100"
          >
            {tag}
          </Badge>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-gray-50 pt-4">
        <div>
          <p className="text-xs text-gray-400">지원 금액</p>
          <p className="mt-0.5 text-lg font-bold text-gray-900">
            {scholarship.amount}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-7 items-center rounded-full border border-indigo-200 px-3 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
        >
          자세히 보기
        </button>
      </div>
    </div>
  );
}
