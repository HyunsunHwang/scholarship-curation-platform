import { createCrawlerDocumentRuntime } from "./runtime.mjs";
import { sanitizeTransportUrl } from "../transport/transport-client.mjs";

function requireTransportClient(context, fallback) {
  const client = context?.transportClient ?? fallback;
  if (!client || typeof client.request !== "function") {
    throw new TypeError("Document transport requires an injected transportClient");
  }
  return client;
}

export async function inspectCrawlerAssetWithTransport(asset, context = {}) {
  const transportClient = requireTransportClient(context, context.defaultTransportClient);
  const response = await transportClient.request(asset.url, {
    method: "HEAD",
    kind: "attachment_probe",
    readBody: false,
    retryCount: 0,
    signal: context.signal,
    timeoutMs: context.timeoutMs,
    maxBytes: context.maxBytes,
  });
  return {
    finalUrl: sanitizeTransportUrl(response.finalUrl),
    mimeType: response.contentType.split(";")[0],
    etag: response.etag,
    lastModified: response.lastModified,
    contentLength: response.contentLength,
  };
}

export async function fetchCrawlerAssetWithTransport(asset, context = {}) {
  const transportClient = requireTransportClient(context, context.defaultTransportClient);
  const response = await transportClient.request(asset.url, {
    method: "GET",
    kind: "attachment",
    retryCount: 0,
    signal: context.signal,
    timeoutMs: context.timeoutMs,
    maxBytes: context.maxBytes,
  });
  return {
    bytes: response.bytes,
    finalUrl: sanitizeTransportUrl(response.finalUrl),
    mimeType: response.contentType.split(";")[0],
    etag: response.etag,
    lastModified: response.lastModified,
    contentLength: response.contentLength,
  };
}

export function createTransportBackedDocumentRuntime({
  transportClient,
  enabled = false,
  cacheDirectory,
  ocrAdapter,
  hwpBinaryAdapter,
  parserOptions = {},
} = {}) {
  return createCrawlerDocumentRuntime({
    enabled,
    cacheDirectory,
    inspectAsset: (asset, context = {}) => inspectCrawlerAssetWithTransport(asset, {
      ...context,
      defaultTransportClient: transportClient,
    }),
    fetchAsset: (asset, context = {}) => fetchCrawlerAssetWithTransport(asset, {
      ...context,
      defaultTransportClient: transportClient,
    }),
    ocrAdapter,
    hwpBinaryAdapter,
    parserOptions,
  });
}
