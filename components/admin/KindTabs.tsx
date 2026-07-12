import Link from "next/link";
import {
  ADMIN_CONTENT_KINDS,
  adminKindLabel,
  type AdminContentKind,
} from "@/lib/admin-kinds";

type KindTabsProps = {
  basePath: "/admin/content" | "/admin/review";
  activeKind: AdminContentKind;
  counts?: Partial<Record<AdminContentKind, number>>;
  extraQuery?: Record<string, string>;
};

export function AdminKindTabs({
  basePath,
  activeKind,
  counts,
  extraQuery,
}: KindTabsProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {ADMIN_CONTENT_KINDS.map((kind) => {
        const active = activeKind === kind;
        const qs = new URLSearchParams({ kind, ...extraQuery });
        const count = counts?.[kind];
        return (
          <Link
            key={kind}
            href={`${basePath}?${qs.toString()}`}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {adminKindLabel(kind)}
            {typeof count === "number" ? (
              <span
                className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${
                  active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
