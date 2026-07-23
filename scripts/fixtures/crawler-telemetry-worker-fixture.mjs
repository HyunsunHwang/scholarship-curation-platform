import { parentPort, workerData } from "node:worker_threads";
import {
  clearCrawlerTelemetryEventSink,
  setCrawlerTelemetryEventSink,
  telemetryDetailFinished,
  telemetryDetailStarted,
  telemetryHttpFinished,
  telemetryHttpStarted,
  telemetryRetryDelay,
} from "../../lib/crawler-engine/crawler-performance-telemetry.mjs";

if (workerData.telemetryEnabled) {
  setCrawlerTelemetryEventSink((event) => parentPort.postMessage({
    type: "telemetry_event",
    worker_id: workerData.workerId,
    event,
  }));
}

const detail = telemetryDetailStarted();
const request = telemetryHttpStarted({
  url: "https://user:password@example.edu/detail?api_key=secret",
  attempt: 1,
});

if (workerData.mode === "abnormal") {
  setImmediate(() => process.exit(2));
} else {
  telemetryRetryDelay(10);
  telemetryHttpFinished(request, { status: 200, bytes: 32 });
  telemetryDetailFinished(detail);
  clearCrawlerTelemetryEventSink();
  parentPort.postMessage({ type: "result", result_status: "success" });
}
