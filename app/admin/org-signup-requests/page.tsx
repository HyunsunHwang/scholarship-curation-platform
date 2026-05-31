import { createClient } from "@/lib/supabase/server";
import { approveOrgSignupRequest, rejectOrgSignupRequest } from "./actions";

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function OrgSignupRequestsPage() {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("org_signup_requests")
    .select(
      "id, email, applicant_name, organization_kind, organization_name, request_note, status, requested_at, reviewed_at, review_note"
    )
    .order("requested_at", { ascending: false })
    .limit(100);

  async function approveAction(formData: FormData): Promise<void> {
    "use server";
    await approveOrgSignupRequest(formData);
  }

  async function rejectAction(formData: FormData): Promise<void> {
    "use server";
    await rejectOrgSignupRequest(formData);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">기관 담당자 가입 요청</h1>
        <p className="mt-1 text-sm text-gray-500">
          숨김 링크를 통해 접수된 요청을 승인/반려합니다.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-brand">
          요청 목록을 불러오지 못했습니다: {error.message}
        </div>
      ) : null}

      <div className="space-y-4">
        {(rows ?? []).map((row) => {
          const isPending = row.status === "pending";
          return (
            <article
              key={row.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-500">요청 #{row.id}</p>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {row.organization_name} ({row.organization_kind})
                  </h2>
                  <p className="mt-1 text-sm text-gray-700">
                    담당자: {row.applicant_name} · 이메일: {row.email}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    요청일: {formatDateTime(row.requested_at)}
                    {row.reviewed_at ? ` · 처리일: ${formatDateTime(row.reviewed_at)}` : ""}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                    row.status === "pending"
                      ? "bg-amber-100 text-amber-800"
                      : row.status === "approved"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-gray-200 text-gray-700"
                  }`}
                >
                  {row.status === "pending"
                    ? "승인 대기"
                    : row.status === "approved"
                      ? "승인됨"
                      : "반려됨"}
                </span>
              </div>

              {row.request_note ? (
                <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  요청 메모: {row.request_note}
                </p>
              ) : null}
              {row.review_note ? (
                <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  처리 메모: {row.review_note}
                </p>
              ) : null}

              {isPending ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <form action={approveAction}>
                    <input type="hidden" name="request_id" value={row.id} />
                    <button
                      type="submit"
                      className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      승인
                    </button>
                  </form>

                  <form action={rejectAction} className="flex items-center gap-2">
                    <input type="hidden" name="request_id" value={row.id} />
                    <input
                      type="text"
                      name="review_note"
                      placeholder="반려 사유 (선택)"
                      className="w-56 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/10"
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      반려
                    </button>
                  </form>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
