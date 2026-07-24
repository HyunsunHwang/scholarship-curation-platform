function clean(value) {
  return String(value ?? "").trim();
}

export function createListAdapterExecution({
  source,
  listAdapter,
  transportClient,
  adapterOptions = {},
  strategyName = null,
} = {}) {
  if (!source || typeof listAdapter !== "function" || !transportClient) {
    throw new TypeError("source, listAdapter, and transportClient are required");
  }
  let observations = [];
  const strategy = {
    name: clean(strategyName) || clean(source.adapter) || "list_adapter",
    buildListRequest() {
      return {
        url: source.listUrl,
        kind: "adapter_api",
      };
    },
    parseList() {
      return observations;
    },
    resolveDetailUrl({ item }) {
      return item.noticeUrl ?? item.notice_url ?? "";
    },
    normalizeNotice({ item, detail, attachmentMetadata }) {
      return {
        ...item,
        ...detail,
        attachmentMetadata,
      };
    },
  };
  const fetchHtml = async (_url, request = {}) => {
    observations = await listAdapter(source, {
      ...adapterOptions,
      signal: request.signal,
      transportClient,
    });
    if (!Array.isArray(observations)) {
      throw new TypeError("List adapter must return an array.");
    }
    return "";
  };
  return Object.freeze({
    strategy,
    fetchHtml,
  });
}
