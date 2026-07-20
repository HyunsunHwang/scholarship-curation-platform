"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AnnouncementDetailModal from "@/components/announcement/AnnouncementDetailModal";
import {
  announcementHref,
  isAnnouncementKind,
  type AnnouncementDetailPayload,
  type AnnouncementKind,
} from "@/lib/announcement-detail";
import { trackBrowseEventClient } from "@/lib/browse-events";
import { recordRecentView } from "@/lib/recent-views";

type OpenTarget = { kind: AnnouncementKind; id: number };

type AnnouncementModalContextValue = {
  /** 데스크톱(md+)에서만 true — 모바일은 일반 링크로 이동 */
  canOpenModal: boolean;
  openAnnouncement: (target: OpenTarget) => void;
  closeAnnouncement: () => void;
};

const AnnouncementModalContext =
  createContext<AnnouncementModalContextValue | null>(null);

const MD_QUERY = "(min-width: 768px)";
const HISTORY_STATE_KEY = "announcementModal";

function isDesktopViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MD_QUERY).matches;
}

export function useAnnouncementModal() {
  return useContext(AnnouncementModalContext);
}

export default function AnnouncementModalProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [canOpenModal, setCanOpenModal] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnnouncementDetailPayload | null>(null);
  const [target, setTarget] = useState<OpenTarget | null>(null);
  const pushedRef = useRef(false);
  const returnUrlRef = useRef<string | null>(null);
  const fetchGen = useRef(0);

  useEffect(() => {
    const mql = window.matchMedia(MD_QUERY);
    const sync = () => setCanOpenModal(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  const closeAnnouncement = useCallback(() => {
    setOpen(false);
    setLoading(false);
    setError(null);
    setData(null);
    setTarget(null);
    if (pushedRef.current) {
      pushedRef.current = false;
      const returnUrl = returnUrlRef.current || "/";
      window.history.replaceState(
        { ...(window.history.state ?? {}), [HISTORY_STATE_KEY]: false },
        "",
        returnUrl
      );
    }
  }, []);

  const openAnnouncement = useCallback((next: OpenTarget) => {
    if (!isDesktopViewport()) return;
    returnUrlRef.current = `${window.location.pathname}${window.location.search}`;
    setTarget(next);
    setOpen(true);
    setLoading(true);
    setError(null);
    setData(null);

    const href = announcementHref(next.kind, next.id);
    if (!window.history.state?.[HISTORY_STATE_KEY]) {
      window.history.pushState(
        { ...(window.history.state ?? {}), [HISTORY_STATE_KEY]: true, kind: next.kind, id: next.id },
        "",
        href
      );
      pushedRef.current = true;
    }
  }, []);

  useEffect(() => {
    function onPopState() {
      if (open) {
        pushedRef.current = false;
        setOpen(false);
        setLoading(false);
        setError(null);
        setData(null);
        setTarget(null);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [open]);

  useEffect(() => {
    if (!open || !target) return;
    const gen = ++fetchGen.current;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/announcements/${target!.kind}/${target!.id}`,
          { credentials: "same-origin" }
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || "불러오기 실패");
        }
        const payload = (await res.json()) as AnnouncementDetailPayload;
        if (cancelled || gen !== fetchGen.current) return;
        setData(payload);
        // 모달은 상세 페이지를 거치지 않으므로 여기서 최근본을 남긴다
        recordRecentView({
          id: payload.id,
          name: payload.name,
          organization: payload.organization,
          poster_image_url: payload.posterImageUrl,
          apply_end_date: payload.scholarship.apply_end_date || "2099-12-31",
          content_kind: payload.kind,
        });
        void trackBrowseEventClient({
          contentKind: payload.kind,
          contentId: payload.id,
          name: payload.name,
          organization: payload.organization,
          posterImageUrl: payload.posterImageUrl,
          applyEndDate: payload.scholarship.apply_end_date || "2099-12-31",
          pagePath: payload.href,
        });
      } catch (e) {
        if (cancelled || gen !== fetchGen.current) return;
        setError(e instanceof Error ? e.message : "불러오기 실패");
      } finally {
        if (!cancelled && gen === fetchGen.current) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, target]);

  const value = useMemo(
    () => ({
      canOpenModal,
      openAnnouncement,
      closeAnnouncement,
    }),
    [canOpenModal, openAnnouncement, closeAnnouncement]
  );

  return (
    <AnnouncementModalContext.Provider value={value}>
      {children}
      <AnnouncementDetailModal
        open={open}
        loading={loading}
        error={error}
        data={data}
        onClose={closeAnnouncement}
      />
    </AnnouncementModalContext.Provider>
  );
}

/** 카드 Link 클릭: 데스크톱이면 모달, 모바일이면 기본 이동 */
export function useAnnouncementLinkClick(
  kind: AnnouncementKind | string | null | undefined,
  id: number
) {
  const ctx = useAnnouncementModal();
  const resolvedKind: AnnouncementKind =
    kind && isAnnouncementKind(kind) ? kind : "scholarship";

  return useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!ctx?.canOpenModal) return;
      // 새 탭/수정 클릭은 기본 링크 동작 유지
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      ctx.openAnnouncement({ kind: resolvedKind, id });
    },
    [ctx, resolvedKind, id]
  );
}
