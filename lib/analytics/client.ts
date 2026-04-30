import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/database.types";

type TrackClientEventInput = {
  eventName: string;
  pagePath?: string | null;
  scholarshipId?: number | null;
  searchQuery?: string | null;
  sortKey?: string | null;
  scopeFilter?: string | null;
  metadata?: Json | null;
};

export async function trackAnalyticsEventClient({
  eventName,
  pagePath,
  scholarshipId,
  searchQuery,
  sortKey,
  scopeFilter,
  metadata,
}: TrackClientEventInput) {
  try {
    const supabase = createClient();
    const resolvedPath =
      pagePath ?? (typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : null);
    await supabase.rpc("track_analytics_event", {
      p_event_name: eventName,
      p_page_path: resolvedPath,
      p_scholarship_id: scholarshipId ?? null,
      p_search_query: searchQuery ?? null,
      p_sort_key: sortKey ?? null,
      p_scope_filter: scopeFilter ?? null,
      p_metadata: metadata ?? {},
    });
  } catch (error) {
    console.error("Failed to track analytics event", error);
  }
}
