import Link from "next/link";
import type { HomeDashboardStats } from "@/lib/home-dashboard-stats";

type StatKey = "saved" | "recent" | "urgent" | "qualified";

type StatDef = {
  key: StatKey;
  label: string;
  href: string;
  value: number;
  emphasize?: boolean;
  icon: "bookmark" | "recent" | "alarm" | "check";
};

function StatIcon({
  name,
  emphasize,
}: {
  name: StatDef["icon"];
  emphasize?: boolean;
}) {
  const stroke = emphasize ? "text-rose-500" : "text-brand/70";
  const cls = `h-4 w-4 ${stroke}`;
  switch (name) {
    case "bookmark":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.5 3.75H6.5A.75.75 0 0 0 5.75 4.5v15.11a.75.75 0 0 0 1.17.62L12 16.7l5.08 3.53a.75.75 0 0 0 1.17-.62V4.5a.75.75 0 0 0-.75-.75Z" />
        </svg>
      );
    case "recent":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3.5 2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-3-6.7" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 4v4h-4" />
        </svg>
      );
    case "alarm":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4l2.5 1.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 5.5 3 8m15.5-2.5L21 8" />
          <circle cx="12" cy="13" r="7.25" />
        </svg>
      );
    case "check":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75" />
          <circle cx="12" cy="12" r="8.25" />
        </svg>
      );
  }
}

function displayName(name: string | null) {
  const trimmed = name?.trim();
  if (!trimmed) return "회원";
  return trimmed.endsWith("님") ? trimmed.slice(0, -1) : trimmed;
}

export default function HomeDashboardHeroView({
  stats,
}: {
  stats: HomeDashboardStats;
}) {
  const name = displayName(stats.userName);
  const statsList: StatDef[] = [
    {
      key: "saved",
      label: "저장함",
      href: "/library/saved",
      value: stats.savedCount,
      icon: "bookmark",
    },
    {
      key: "recent",
      label: "최근 본 공고",
      href: "/library/recent",
      value: stats.recentCount,
      icon: "recent",
    },
    {
      key: "urgent",
      label: "마감 임박",
      href: "/library/saved",
      value: stats.urgentCount,
      emphasize: stats.urgentCount > 0,
      icon: "alarm",
    },
    {
      key: "qualified",
      label: "맞춤형 장학금",
      href: "/matched",
      value: stats.qualifiedCount,
      icon: "check",
    },
  ];

  return (
    <div className="relative z-10 w-full shrink-0 lg:max-w-md lg:self-end xl:max-w-lg">
      <div className="pointer-events-none absolute -left-6 -top-8 h-32 w-32 rounded-full bg-brand/8 blur-3xl" />
      <div className="pointer-events-none absolute right-2 top-0 h-24 w-24 rounded-full bg-peach/10 blur-3xl" />

      <h2
        id="home-hero-intro-heading"
        className="text-[1.55rem] font-extrabold leading-tight tracking-tight text-ink sm:text-[1.85rem] md:text-[2rem]"
      >
        <span className="bg-linear-to-r from-ink via-ink to-brand bg-clip-text text-transparent">
          {name}님
        </span>
        , 이번 주 마감{" "}
        <span className="relative inline-block text-brand">
          {stats.weekDeadlineCount}
          <span
            aria-hidden
            className="absolute -bottom-0.5 left-0 right-0 h-1.5 rounded-full bg-brand/15"
          />
        </span>
        건
      </h2>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-ink/60 sm:text-sm">
        <span>{stats.dateLabel}</span>
        <span aria-hidden className="text-ink/25">
          ·
        </span>
        <span>
          오늘{" "}
          <span className="font-bold text-ink/80">{stats.newTodayCount}</span>
          건 새로 올라왔어요
        </span>
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-2.5">
        {statsList.map((stat, index) => (
          <Link
            key={stat.key}
            href={stat.href}
            className="group relative overflow-hidden rounded-xl border border-white/80 bg-white/70 p-2.5 shadow-[0_8px_24px_-16px_rgba(2,0,128,0.45)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:border-brand/20 hover:bg-white hover:shadow-[0_14px_32px_-18px_rgba(2,0,128,0.55)] sm:p-3"
            style={{ transitionDelay: `${index * 20}ms` }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white to-transparent"
            />
            <div className="flex items-start justify-between gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                  stat.emphasize
                    ? "bg-rose-50 ring-1 ring-rose-100"
                    : "bg-brand/6 ring-1 ring-brand/10"
                }`}
              >
                <StatIcon name={stat.icon} emphasize={stat.emphasize} />
              </div>
              <span
                className={`text-[1.35rem] font-extrabold leading-none tracking-tight tabular-nums sm:text-[1.5rem] ${
                  stat.emphasize ? "text-rose-500" : "text-ink"
                }`}
              >
                {stat.value}
              </span>
            </div>
            <p className="mt-2 text-[11px] font-semibold text-ink/55 transition group-hover:text-ink/75 sm:text-xs">
              {stat.label}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function HomeDashboardHeroSkeleton() {
  return (
    <div className="relative z-10 w-full shrink-0 lg:max-w-md lg:self-end xl:max-w-lg">
      <div className="h-9 w-[80%] max-w-sm animate-pulse rounded-lg bg-ink/10" />
      <div className="mt-2 h-4 w-52 animate-pulse rounded bg-ink/8" />
      <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[4.5rem] animate-pulse rounded-xl bg-white/60 ring-1 ring-ink/5"
          />
        ))}
      </div>
    </div>
  );
}
