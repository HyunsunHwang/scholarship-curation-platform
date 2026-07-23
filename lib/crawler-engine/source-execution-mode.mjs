const WORKER_CONCURRENCY_ERROR =
  "Worker source isolation currently requires CRAWL_SOURCE_CONCURRENCY=1 because each worker owns an independent host rate limiter.";

export function resolveSourceExecutionMode({
  sourceConcurrency,
  isolationRequested,
}) {
  const concurrency = Math.max(1, Number(sourceConcurrency) || 1);
  const requested = isolationRequested === true;
  if (requested && concurrency !== 1) {
    throw new Error(WORKER_CONCURRENCY_ERROR);
  }
  return {
    mode: requested ? "worker" : "main_thread",
    isolation_enabled: requested,
  };
}

export { WORKER_CONCURRENCY_ERROR };
