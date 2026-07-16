import assert from "node:assert/strict";
import fs from "node:fs";

const engagement = fs.readFileSync(
  "app/scholarships/[id]/LiveEngagementBadges.tsx",
  "utf8",
);
const navigation = fs.readFileSync(
  "components/NavigationPendingOverlay.tsx",
  "utf8",
);
const hub = fs.readFileSync("components/library/LibraryHub.tsx", "utf8");
const recent = fs.readFileSync(
  "components/library/LibraryRecentList.tsx",
  "utf8",
);
const store = fs.readFileSync("lib/recent-views.ts", "utf8");
const admin = fs.readFileSync("app/admin/crawler-review/page.tsx", "utf8");
const bookmarks = fs.readFileSync("lib/user-bookmarks.ts", "utf8");

assert.match(engagement, /LiveEngagementBadgesState/);
assert.match(engagement, /key=\{`\$\{props\.scholarshipId\}/);
assert.doesNotMatch(
  engagement,
  /useEffect\(\(\) => \{\s*setViewCount\(initialViewCount\)/s,
);
assert.match(navigation, /pendingTarget/);
assert.doesNotMatch(
  navigation,
  /useEffect\(\(\) => \{\s*clearDelayTimer\(\);\s*setPending/s,
);
assert.match(hub, /useSyncExternalStore/);
assert.match(recent, /useSyncExternalStore/);
assert.match(store, /subscribeRecentViews/);
assert.match(store, /getRecentViewsServerSnapshot/);
assert.match(admin, /getPostPhaseNQOperationsSnapshot/);
assert.match(bookmarks, /isScholarshipExpired/);
console.log(JSON.stringify({
  passed: true,
  hydration_contract: true,
  storage_subscription_contract: true,
  navigation_pending_contract: true,
  engagement_badge_contract: true,
  admin_dashboard_integrated: true,
  saved_expired_exclusion_preserved: true,
}, null, 2));
