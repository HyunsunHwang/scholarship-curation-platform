import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const profilePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "config",
  "crawler-parser",
  "list-parser-profiles.json",
);

let cachedProfiles = null;

function clean(value) {
  return String(value ?? "").trim();
}

function validateProfile(profile) {
  const profileId = clean(profile?.profileId);
  if (!profileId) throw new Error("List parser profile requires profileId.");
  if (profile.noticeUrlPattern) {
    try { new RegExp(profile.noticeUrlPattern); } catch {
      throw new Error(`List parser profile ${profileId} has an invalid noticeUrlPattern.`);
    }
  }
  return Object.freeze({ ...profile, profileId });
}

export function loadListParserProfiles({ filePath = profilePath, reload = false } = {}) {
  if (!reload && filePath === profilePath && cachedProfiles) return cachedProfiles;
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (parsed.schemaVersion !== "crawler-list-parser-profiles-v1" || !Array.isArray(parsed.profiles)) {
    throw new Error("Invalid list parser profile registry.");
  }
  const profiles = new Map();
  for (const rawProfile of parsed.profiles) {
    const profile = validateProfile(rawProfile);
    if (profiles.has(profile.profileId)) throw new Error("List parser profile IDs must be unique.");
    profiles.set(profile.profileId, profile);
  }
  if (filePath === profilePath) cachedProfiles = profiles;
  return profiles;
}

export function resolveListParserProfile(profileId) {
  const normalized = clean(profileId);
  if (!normalized) return null;
  return loadListParserProfiles().get(normalized) ?? null;
}

export function applyListParserProfile(source = {}) {
  const profile = resolveListParserProfile(source.listParserProfile);
  if (!profile) return source;
  const fields = ["listItemSelector", "linkSelector", "titleSelector", "dateSelector", "noticeUrlPattern"];
  const applied = { ...source, listParserProfile: profile.profileId };
  const appliedFields = [];
  for (const field of fields) {
    if (!clean(applied[field]) && clean(profile[field])) {
      applied[field] = clean(profile[field]);
      appliedFields.push(field);
    }
  }
  Object.defineProperty(applied, "__crawlerListParserProfile", {
    value: Object.freeze({ profileId: profile.profileId, appliedFields: Object.freeze(appliedFields) }),
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return applied;
}
