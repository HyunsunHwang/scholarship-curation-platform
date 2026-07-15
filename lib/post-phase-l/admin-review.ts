import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import type {
  LAsset,
  LEffectiveDecision,
  LIngestionNotice,
  LOccurrence,
  LReviewEvent,
  LReviewItem,
  LRevision,
  LSourceRunResult,
  LUrlAlias,
  PostPhaseLDatabase,
} from "./database.types";
import { isPostPhaseLEnvironment } from "./runtime";

type ExistingClient = Awaited<ReturnType<typeof createClient>>;

export type LegacyNoticeSnapshot = {
  id: number;
  source_id: string;
  source_name: string;
  title: string;
  notice_url: string;
  body: string | null;
  image_urls: string[] | null;
  status: "new" | "promoted" | "rejected";
  scholarship_id: number | null;
};

export type PostPhaseLReviewEvidence = {
  mode: "inactive" | "unavailable" | "db-backed";
  errorCode: string | null;
  notice: LIngestionNotice | null;
  occurrence: LOccurrence | null;
  revision: LRevision | null;
  sourceResult: LSourceRunResult | null;
  assets: LAsset[];
  aliases: LUrlAlias[];
  reviewItem: LReviewItem | null;
  effectiveDecision: LEffectiveDecision | null;
  events: LReviewEvent[];
  legacyComparison: Array<{ field: string; state: "match" | "mismatch" | "missing" }>;
  preview: {
    exposurePolicyResult: "preview_eligible" | "hidden";
    hiddenReasons: string[];
    publicExposureEnabled: false;
    numericRouteCompatibility: string;
    payload: Record<string, unknown> | null;
  };
};

function emptyEvidence(
  mode: PostPhaseLReviewEvidence["mode"],
  errorCode: string | null = null,
): PostPhaseLReviewEvidence {
  return {
    mode,
    errorCode,
    notice: null,
    occurrence: null,
    revision: null,
    sourceResult: null,
    assets: [],
    aliases: [],
    reviewItem: null,
    effectiveDecision: null,
    events: [],
    legacyComparison: [],
    preview: {
      exposurePolicyResult: "hidden",
      hiddenReasons: [mode === "inactive" ? "l_environment_inactive" : "graph_evidence_unavailable"],
      publicExposureEnabled: false,
      numericRouteCompatibility: "preserved_unallocated",
      payload: null,
    },
  };
}

function compare(
  field: string,
  left: unknown,
  right: unknown,
): { field: string; state: "match" | "mismatch" | "missing" } {
  if (left == null || right == null || left === "" || right === "") {
    return { field, state: "missing" };
  }
  return {
    field,
    state: JSON.stringify(left) === JSON.stringify(right) ? "match" : "mismatch",
  };
}

function buildPreview(params: {
  legacy: LegacyNoticeSnapshot;
  notice: LIngestionNotice;
  revision: LRevision | null;
  reviewItem: LReviewItem | null;
  sourceResult: LSourceRunResult | null;
  effectiveDecision: LEffectiveDecision | null;
  effectiveEvent: LReviewEvent | null;
}) {
  const {
    legacy,
    notice,
    revision,
    reviewItem,
    sourceResult,
    effectiveDecision,
    effectiveEvent,
  } = params;
  const hiddenReasons = [];
  if (effectiveDecision?.decision !== "approve") hiddenReasons.push("effective_decision_not_approve");
  if (reviewItem?.current_revision_id !== revision?.id) {
    hiddenReasons.push("review_item_revision_not_current");
  }
  if (effectiveDecision?.decision === "approve" && effectiveEvent?.revision_id !== revision?.id) {
    hiddenReasons.push("approved_revision_not_current");
  }
  if (sourceResult?.result_status !== "success") hiddenReasons.push("source_result_not_success");
  if (!revision?.title.trim()) hiddenReasons.push("title_missing");
  if (!revision?.body?.trim()) hiddenReasons.push("body_missing");
  if (
    revision &&
    !["good", "text_sufficient", "no_assets_but_text_sufficient"].includes(
      revision.body_quality_status,
    )
  ) {
    hiddenReasons.push(`body_quality_${revision.body_quality_status}`);
  }

  const eligible = hiddenReasons.length === 0;
  return {
    exposurePolicyResult: eligible ? ("preview_eligible" as const) : ("hidden" as const),
    hiddenReasons,
    publicExposureEnabled: false as const,
    numericRouteCompatibility: legacy.scholarship_id
      ? `preserved_existing_${legacy.scholarship_id}`
      : "preserved_unallocated",
    payload: eligible
      ? {
          name: revision?.title,
          organization: legacy.source_name,
          scholarship_type: "on_campus",
          apply_url: notice.canonical_url,
          homepage_url: notice.canonical_url,
          original_notice_text: revision?.body,
          is_verified: false,
          list_on_home: false,
          provenance: {
            graph_notice_id: notice.id,
            source_id: notice.source_id,
            revision_id: revision?.id,
            decision_event_id: effectiveDecision?.decision_event_id,
          },
        }
      : null,
  };
}

export async function getPostPhaseLReviewEvidence(
  supabase: ExistingClient,
  legacy: LegacyNoticeSnapshot,
): Promise<PostPhaseLReviewEvidence> {
  if (!isPostPhaseLEnvironment()) return emptyEvidence("inactive");
  const client = supabase as unknown as SupabaseClient<PostPhaseLDatabase>;
  try {
    const { data: notice, error: noticeError } = await client
      .from("ingestion_notices")
      .select("*")
      .eq("legacy_crawled_notice_id", legacy.id)
      .maybeSingle();
    if (noticeError) return emptyEvidence("unavailable", "graph_schema_or_notice_unavailable");
    if (!notice) return emptyEvidence("unavailable", "graph_notice_not_linked");

    const [{ data: occurrence }, { data: revision }, { data: assets }, { data: aliases }, { data: reviewItem }] =
      await Promise.all([
        client
          .from("ingestion_notice_occurrences")
          .select("*")
          .eq("notice_id", notice.id)
          .order("observed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        client
          .from("ingestion_notice_revisions")
          .select("*")
          .eq("notice_id", notice.id)
          .order("revision_ordinal", { ascending: false })
          .limit(1)
          .maybeSingle(),
        client
          .from("ingestion_notice_assets")
          .select("*")
          .eq("notice_id", notice.id)
          .order("created_at", { ascending: true }),
        client
          .from("ingestion_notice_url_aliases")
          .select("*")
          .eq("notice_id", notice.id)
          .order("first_observed_at", { ascending: true }),
        client
          .from("review_items")
          .select("*")
          .eq("notice_id", notice.id)
          .eq("review_scope", "scholarship_notice")
          .maybeSingle(),
      ]);

    const sourceResult = occurrence
      ? (
          await client
            .from("ingestion_source_run_results")
            .select("*")
            .eq("id", occurrence.source_result_id)
            .maybeSingle()
        ).data
      : null;
    const effectiveDecision = reviewItem
      ? (
          await client
            .from("review_effective_decisions")
            .select("*")
            .eq("review_item_id", reviewItem.id)
            .maybeSingle()
        ).data
      : null;
    const events = reviewItem
      ? (
          await client
            .from("review_decision_events")
            .select("*")
            .eq("review_item_id", reviewItem.id)
            .order("created_at", { ascending: false })
        ).data ?? []
      : [];
    const effectiveEvent = effectiveDecision
      ? events.find((event) => event.id === effectiveDecision.decision_event_id) ?? null
      : null;

    return {
      mode: "db-backed",
      errorCode: null,
      notice,
      occurrence: occurrence ?? null,
      revision: revision ?? null,
      sourceResult: sourceResult ?? null,
      assets: assets ?? [],
      aliases: aliases ?? [],
      reviewItem: reviewItem ?? null,
      effectiveDecision: effectiveDecision ?? null,
      events,
      legacyComparison: [
        compare("source_id", notice.source_id, legacy.source_id),
        compare("title", revision?.title, legacy.title),
        compare("notice_url", notice.canonical_url, legacy.notice_url),
        compare("body", revision?.body, legacy.body),
        compare(
          "assets",
          (assets ?? []).filter((asset) => asset.asset_kind === "image").map((asset) => asset.original_url),
          legacy.image_urls ?? [],
        ),
      ],
      preview: buildPreview({
        legacy,
        notice,
        revision: revision ?? null,
        reviewItem: reviewItem ?? null,
        sourceResult: sourceResult ?? null,
        effectiveDecision: effectiveDecision ?? null,
        effectiveEvent,
      }),
    };
  } catch {
    return emptyEvidence("unavailable", "graph_read_failed_closed");
  }
}

export async function getPostPhaseLOperationsSnapshot(supabase: ExistingClient) {
  if (!isPostPhaseLEnvironment()) return { mode: "inactive" as const, runs: [], sourceResults: [] };
  const client = supabase as unknown as SupabaseClient<PostPhaseLDatabase>;
  try {
    const [{ data: runs, error: runError }, { data: sourceResults, error: resultError }] =
      await Promise.all([
        client
          .from("ingestion_crawl_runs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(8),
        client
          .from("ingestion_source_run_results")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(24),
      ]);
    if (runError || resultError) {
      return { mode: "unavailable" as const, runs: [], sourceResults: [] };
    }
    return { mode: "db-backed" as const, runs: runs ?? [], sourceResults: sourceResults ?? [] };
  } catch {
    return { mode: "unavailable" as const, runs: [], sourceResults: [] };
  }
}
