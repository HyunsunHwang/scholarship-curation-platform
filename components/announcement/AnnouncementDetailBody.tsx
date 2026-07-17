"use client";

import dynamic from "next/dynamic";
import BookmarkApplyButtons from "@/app/scholarships/[id]/BookmarkApplyButtons";
import BenefitHighlights from "@/components/BenefitHighlights";
import type { AnnouncementDetailPayload } from "@/lib/announcement-detail";

const ScholarshipTabs = dynamic(
  () => import("@/app/scholarships/[id]/ScholarshipTabs"),
  {
    loading: () => (
      <div className="mt-8 space-y-4" aria-hidden>
        <div className="h-8 w-40 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-24 w-full animate-pulse rounded-xl bg-gray-100" />
      </div>
    ),
  }
);

type ContactChannel = { icon: "mail" | "phone" | "info"; text: string; href: string | null };

function splitContactChannels(raw: string): ContactChannel[] {
  return raw
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const email = part.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
      if (email) return { icon: "mail" as const, text: part, href: `mailto:${email}` };
      const phone = part.match(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{3,4}/)?.[0];
      if (phone) {
        return {
          icon: "phone" as const,
          text: part,
          href: `tel:${phone.replace(/[.\s]/g, "-")}`,
        };
      }
      return { icon: "info" as const, text: part, href: null };
    });
}

function ContactChannelIcon({ icon }: { icon: ContactChannel["icon"] }) {
  if (icon === "mail") {
    return (
      <svg className="h-4 w-4 shrink-0 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0-.414.336-.75.75-.75h18a.75.75 0 01.75.75v10.5a.75.75 0 01-.75-.75H3a.75.75 0 01-.75-.75V6.75z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.5l9.75 6.75L21.75 7.5" />
      </svg>
    );
  }
  if (icon === "phone") {
    return (
      <svg className="h-4 w-4 shrink-0 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 6.75c0 8.284 6.716 15 15 15h1.5a2.25 2.25 0 002.25-2.25v-1.372a1.5 1.5 0 00-1.164-1.462l-3.328-.808a1.5 1.5 0 00-1.517.475l-.85 1.05a11.25 11.25 0 01-5.66-5.66l1.05-.85a1.5 1.5 0 00.475-1.517l-.808-3.328a1.5 1.5 0 00-1.462-1.164H4.5A2.25 2.25 0 002.25 6.75z"
        />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 shrink-0 text-ink/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
      />
    </svg>
  );
}

export default function AnnouncementDetailBody({
  data,
  onClose,
}: {
  data: AnnouncementDetailPayload;
  onClose?: () => void;
}) {
  const bookmarkTarget = data.kind === "scholarship" ? "scholarship" : "contest";

  const titleBlock = (
    <>
      {data.interestLabels.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {data.interestLabels.map((label) => (
            <span
              key={label}
              className="inline-flex items-center rounded-full border border-brand/25 bg-brand/5 px-2.5 py-0.5 text-[11px] font-semibold text-brand"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
      <p className="text-xs font-medium tracking-wide text-ink/45">
        {data.kindLabel}
        {data.organization ? ` · ${data.organization}` : null}
      </p>
      <h1 className="mt-2 break-keep text-[1.65rem] font-extrabold leading-snug tracking-tight text-ink sm:text-[2rem]">
        {data.name}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink/40">
        <span className="inline-flex items-center gap-1">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z" />
            <circle cx="12" cy="12" r="2.25" />
          </svg>
          {data.viewCount.toLocaleString()}
        </span>
        <span className="inline-flex items-center gap-1">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
          </svg>
          {data.scrapCount.toLocaleString()}
        </span>
      </div>
      {data.adJobRole ? (
        <div className="mt-3 text-sm text-ink/80">
          <span className="font-semibold text-ink">모집 직무</span> {data.adJobRole}
        </div>
      ) : null}
    </>
  );

  return (
    <div className="relative flex flex-col bg-white">
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-ink/5 text-ink/60 transition hover:bg-ink/10 hover:text-ink"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : null}

      <div className={`px-4 pb-8 pt-5 sm:px-6 sm:pb-10 sm:pt-6 ${onClose ? "pr-12 sm:pr-14" : ""}`}>
        {/*
          md+: 왼쪽 넓게 태그/제목/혜택 · 오른쪽 좁게 주요일정 + CTA
          (모바일은 제목→혜택→일정→CTA 순으로 스택)
        */}
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)] md:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,240px)]">
          <div className="order-1 min-w-0 md:border-r md:border-gray-100 md:pr-6 md:pt-0">
            {titleBlock}
            <BenefitHighlights benefits={data.benefits} divided={false} />
            <ScholarshipTabs
              scholarship={data.scholarship}
              selectionStages={data.selectionStages}
              autoCheck={data.autoCheck}
              hideQualificationSections={data.hideQualificationSections}
              layout="preOnly"
            />
          </div>

          <div className="order-2 min-w-0 md:pl-1">
            <BookmarkApplyButtons
              scholarshipId={data.id}
              applyUrl={data.applyUrl}
              initialBookmarked={data.initialBookmarked}
              bookmarkTarget={bookmarkTarget}
              variant="stack"
            />
            <ScholarshipTabs
              scholarship={data.scholarship}
              selectionStages={data.selectionStages}
              autoCheck={data.autoCheck}
              hideQualificationSections={data.hideQualificationSections}
              layout="scheduleOnly"
            />
          </div>
        </div>

        <ScholarshipTabs
          scholarship={data.scholarship}
          selectionStages={data.selectionStages}
          autoCheck={data.autoCheck}
          hideQualificationSections={data.hideQualificationSections}
          layout="postOnly"
        />

        {data.contact ? (
          <div className="mt-8 border-t border-gray-100 pt-6">
            <p className="text-xs font-semibold text-ink/40">문의</p>
            <div className="mt-2 flex flex-col gap-1.5 text-sm">
              {splitContactChannels(data.contact).map((channel, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-ink/70">
                  <ContactChannelIcon icon={channel.icon} />
                  {channel.href ? (
                    <a
                      href={channel.href}
                      className="wrap-break-word font-medium text-brand hover:underline"
                    >
                      {channel.text}
                    </a>
                  ) : (
                    <span className="wrap-break-word">{channel.text}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
