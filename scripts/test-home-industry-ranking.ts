import assert from "node:assert/strict";
import type { CardScholarship } from "../components/ScholarshipCard";
import { softRankForYou } from "../lib/home-rails";

function card(
  id: number,
  options: Partial<CardScholarship> = {}
): CardScholarship {
  return {
    id,
    name: `공고 ${id}`,
    organization: `기관 ${id}`,
    institution_type: "기업",
    support_types: [],
    support_amount_text: null,
    apply_end_date: "2099-12-31",
    poster_image_url: null,
    created_at: "2026-07-29T00:00:00.000Z",
    view_count: 0,
    scrap_count: 0,
    content_kind: "contest",
    ...options,
  };
}

const unrelated = card(1, { interest_industries: ["consumer_goods"] });
const matching = card(2, { interest_industries: ["it_software"] });
const rankedByIndustry = softRankForYou([unrelated, matching], {
  industries: ["it_software"],
});
assert.equal(rankedByIndustry[0]?.id, matching.id);

const matchingJob = card(3, {
  interest_categories: ["backend"],
  interest_industries: ["consumer_goods"],
});
const industryOnly = card(4, {
  interest_industries: ["it_software"],
});
const rankedByBoth = softRankForYou([industryOnly, matchingJob], {
  interests: ["backend"],
  industries: ["it_software"],
});
assert.equal(
  rankedByBoth[0]?.id,
  matchingJob.id,
  "직무 신호가 산업 신호보다 강해야 한다"
);

console.log("home industry ranking tests passed");
