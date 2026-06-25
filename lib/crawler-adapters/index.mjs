function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function resolveUrlWithHttps(value, listUrl, baseUrl) {
  const input = cleanText(value);
  if (!input) return "";
  if (/^javascript:/i.test(input)) return "";
  try {
    const resolved = new URL(input, listUrl);
    if (resolved.protocol === "http:") {
      resolved.protocol = "https:";
    }
    return resolved.toString();
  } catch {
    try {
      if (!baseUrl) return "";
      const resolved = new URL(input, baseUrl);
      if (resolved.protocol === "http:") {
        resolved.protocol = "https:";
      }
      return resolved.toString();
    } catch {
      return "";
    }
  }
}

function buildNoticeUrlFromScript(scriptText, source) {
  const script = cleanText(scriptText);
  if (!script) return "";

  const absoluteUrlMatch = script.match(/https?:\/\/[^\s"'()<>]+/i);
  if (absoluteUrlMatch?.[0]) {
    return resolveUrlWithHttps(absoluteUrlMatch[0], source.listUrl, source.baseUrl);
  }

  const relativePathMatch = script.match(/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/);
  if (relativePathMatch?.[0]) {
    return resolveUrlWithHttps(relativePathMatch[0], source.listUrl, source.baseUrl);
  }

  const idMatch = script.match(
    /(?:articleNo|boardNo|nttNo|idx|no|wr_id|b_idx|seq|uid)\s*[:=,'"]+\s*['"]?(\d+)/i,
  );
  if (idMatch?.[1]) {
    const target = new URL(source.listUrl);
    target.searchParams.set("articleNo", idMatch[1]);
    return target.toString();
  }

  return "";
}

function applySourceSpecificAdapter(source, activeLinkNode) {
  const sourceId = cleanText(source.sourceId).toLowerCase();
  const onclick = cleanText(activeLinkNode?.attr("onclick"));
  if (!onclick) return "";

  // 중앙대 계열 게시판의 goView(123) 패턴 대응
  if (sourceId.startsWith("cau_")) {
    const goViewMatch = onclick.match(/goView\s*\(\s*['"]?(\d+)['"]?\s*\)/i);
    if (goViewMatch?.[1]) {
      const target = new URL(source.listUrl);
      target.searchParams.set("no", goViewMatch[1]);
      return target.toString();
    }
  }

  // 이화여대 계열 board viewArticle(123) 패턴 대응
  if (sourceId.startsWith("ewha_")) {
    const viewArticleMatch = onclick.match(/viewArticle\s*\(\s*['"]?(\d+)['"]?\s*\)/i);
    if (viewArticleMatch?.[1]) {
      const target = new URL(source.listUrl);
      target.searchParams.set("articleNo", viewArticleMatch[1]);
      return target.toString();
    }
  }

  return "";
}

export function extractNoticeUrlFromLinkNode(source, activeLinkNode) {
  const href = activeLinkNode?.attr("href") ?? "";
  const onclick = activeLinkNode?.attr("onclick") ?? "";
  const dataHref =
    activeLinkNode?.attr("data-href") ??
    activeLinkNode?.attr("data-url") ??
    activeLinkNode?.attr("data-link") ??
    "";

  return (
    resolveUrlWithHttps(href, source.listUrl, source.baseUrl) ||
    resolveUrlWithHttps(dataHref, source.listUrl, source.baseUrl) ||
    applySourceSpecificAdapter(source, activeLinkNode) ||
    buildNoticeUrlFromScript(onclick, source)
  );
}
