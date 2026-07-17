function normalizePath(value) {
  return String(value ?? "").trim().replaceAll("\\", "/");
}

function uniquePaths(values) {
  return [...new Set((values ?? []).map(normalizePath).filter(Boolean))];
}

function classifyPaths(paths) {
  return {
    admin_ui_changed: paths.some((file) => file.startsWith("app/") || file.startsWith("components/")),
    migration_files_changed: paths.some((file) => file.startsWith("supabase/") || /migration/i.test(file)),
    api_cron_queue_worker_changed: paths.some((file) => /(^|\/)(api|cron|queue|worker)(\/|\.)/i.test(file)),
    sensitive_file_changed: paths.some((file) => /(^|\/)(\.env(?:\.|$)|[^/]*secret[^/]*|[^/]*credential[^/]*|[^/]*\.pem|[^/]*\.key)$/i.test(file)),
    absolute_local_path_changed: paths.some((file) => /^[A-Za-z]:\//.test(file) || file.startsWith("/")),
  };
}

function looksLikeRawLiveArtifact(file) {
  const liveArtifactDirectory = /(^|\/)(\.tmp|tmp)(\/|$).*\/live\//i.test(file) || /(^|\/)live\//i.test(file);
  const rawArtifactName = /(result|response|raw|state|scholarship-notices|crawler-output)[^/]*\.(html?|json|csv|state)$/i.test(file);
  return liveArtifactDirectory && rawArtifactName;
}

export function classifyEnginePhase2EvidencePaths({
  committedPaths = [],
  workingTreePaths = [],
  trackedPaths = [],
} = {}) {
  const committed = uniquePaths(committedPaths);
  const working = uniquePaths(workingTreePaths);
  const tracked = uniquePaths(trackedPaths);
  const committedClassification = classifyPaths(committed);
  const combinedClassification = classifyPaths([...committed, ...working]);
  const rawLiveArtifactTracked = tracked.some(looksLikeRawLiveArtifact);
  const committedDiffSafetyCheckValid =
    !committedClassification.admin_ui_changed &&
    !committedClassification.migration_files_changed &&
    !committedClassification.api_cron_queue_worker_changed &&
    !committedClassification.sensitive_file_changed &&
    !committedClassification.absolute_local_path_changed &&
    !rawLiveArtifactTracked;

  return {
    committed_paths: committed,
    working_tree_paths: working,
    ...combinedClassification,
    raw_live_artifact_tracked: rawLiveArtifactTracked,
    committed_diff_safety_check_valid: committedDiffSafetyCheckValid,
  };
}
