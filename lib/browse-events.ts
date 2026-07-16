import { createClient } from "@/lib/supabase/client";

export type BrowseContentKind =
  | "scholarship"
  | "contest"
  | "education"
  | "activity";

export type TrackBrowseEventInput = {
  contentKind: BrowseContentKind;
  contentId: number;
  name: string;
  organization: string;
  posterImageUrl?: string | null;
  applyEndDate?: string | null;
  dwellMs?: number | null;
  pagePath?: string | null;
};

/** 로그인 사용자 상세 조회 → browse_events upsert (실패해도 UI에 영향 없음) */
export async function trackBrowseEventClient(input: TrackBrowseEventInput) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const resolvedPath =
      input.pagePath ??
      (typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : null);

    await supabase.rpc("track_browse_event", {
      p_content_kind: input.contentKind,
      p_content_id: input.contentId,
      p_name: input.name,
      p_organization: input.organization,
      p_poster_image_url: input.posterImageUrl ?? null,
      p_apply_end_date: input.applyEndDate ?? null,
      p_dwell_ms: input.dwellMs ?? null,
      p_page_path: resolvedPath,
    });
  } catch (error) {
    console.error("Failed to track browse event", error);
  }
}
