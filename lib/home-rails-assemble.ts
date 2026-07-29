import type { CardScholarship } from "@/components/ScholarshipCard";
import type { HomeRail } from "@/lib/home-rails";
import {
  buildCampusRail,
  buildCollaborativeRail,
  buildIndustryRails,
  buildInterestRails,
  buildRegionRail,
  collectRailKeys,
  HOME_INTEREST_RAIL_LIMIT,
  type HomeProfileSignals,
} from "@/lib/home-rails";

export type AssembledHomeRails = {
  interestRails: HomeRail[];
  campusRail: HomeRail | null;
  regionRail: HomeRail | null;
  collaborativeRail: HomeRail | null;
  /** For You·히어로 이후 레일에서 제외할 누적 키 */
  seenKeys: Set<string>;
};

/**
 * 개인화 레일을 순서대로 조립하며 교차 중복을 제거한다.
 * 순서: For You → 관심사 → 교내 → 지역 → CF
 */
export function assemblePersonalizedRails(options: {
  catalog: CardScholarship[];
  forYou: CardScholarship[];
  interests: readonly string[] | null | undefined;
  industries: readonly string[] | null | undefined;
  profile: HomeProfileSignals;
  campusItems: CardScholarship[];
  collaborativeItems: CardScholarship[];
}): AssembledHomeRails {
  const {
    catalog,
    forYou,
    interests,
    industries,
    profile,
    campusItems,
    collaborativeItems,
  } = options;

  let seen = collectRailKeys(forYou);

  const jobRails = buildInterestRails(catalog, interests, seen);
  const seenAfterJobs = collectRailKeys(forYou, ...jobRails.map((r) => r.items));
  const industryRails = buildIndustryRails(
    catalog,
    industries,
    seenAfterJobs,
    Math.max(0, HOME_INTEREST_RAIL_LIMIT - jobRails.length)
  );
  const interestRails = [...jobRails, ...industryRails];
  seen = collectRailKeys(forYou, ...interestRails.map((r) => r.items));

  const campusRail = buildCampusRail(campusItems, profile, seen);
  seen = collectRailKeys(
    forYou,
    ...interestRails.map((r) => r.items),
    campusRail?.items
  );

  const regionRail = buildRegionRail(catalog, profile, seen);
  seen = collectRailKeys(
    forYou,
    ...interestRails.map((r) => r.items),
    campusRail?.items,
    regionRail?.items
  );

  const collaborativeRail = buildCollaborativeRail(collaborativeItems, seen);
  seen = collectRailKeys(
    forYou,
    ...interestRails.map((r) => r.items),
    campusRail?.items,
    regionRail?.items,
    collaborativeRail?.items
  );

  return {
    interestRails,
    campusRail,
    regionRail,
    collaborativeRail,
    seenKeys: seen,
  };
}
