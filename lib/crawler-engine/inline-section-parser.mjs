import { load as loadHtml } from "cheerio";

const DEFAULT_SECTION_TITLE_SELECTOR = "h2, h3";
const EXCLUDED_CONTAINER_SELECTOR = "header, nav, footer, aside";
const DEFAULT_MAX_TRAVERSED_NODES = 20_000;
const DEFAULT_MAX_SECTION_COUNT = 500;
const DEFAULT_MAX_SECTION_BODY_CHARACTERS = 200_000;

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function appendText(section, value, maxBodyCharacters) {
  if (!section || section.bodyLength >= maxBodyCharacters) return;
  const text = clean(value);
  if (!text) return;
  const bounded = text.slice(0, maxBodyCharacters - section.bodyLength);
  section.bodyParts.push(bounded);
  section.bodyLength += bounded.length;
}

/**
 * Scans one HTML document in DOM order and groups text and links under the
 * nearest configured heading. The scan is read-only, bounded, and independent
 * of the crawler transport.
 */
export function parseInlineSections(source = {}, html = "", options = {}) {
  const $ = loadHtml(String(html ?? ""));
  const titleSelector = clean(source.sectionTitleSelector)
    || clean(options.titleSelector)
    || DEFAULT_SECTION_TITLE_SELECTOR;
  const bodyBoundary = clean(source.sectionBodyBoundary)
    || clean(options.bodyBoundary)
    || "next_heading";
  if (bodyBoundary !== "next_heading") {
    throw new Error(`Unsupported inline section boundary: ${bodyBoundary}`);
  }

  const maxTraversedNodes = Math.max(
    1,
    Number(options.maxTraversedNodes) || DEFAULT_MAX_TRAVERSED_NODES,
  );
  const maxSectionCount = Math.max(
    1,
    Number(options.maxSectionCount) || DEFAULT_MAX_SECTION_COUNT,
  );
  const maxBodyCharacters = Math.max(
    1,
    Number(options.maxBodyCharacters) || DEFAULT_MAX_SECTION_BODY_CHARACTERS,
  );
  const sections = [];
  const roots = $("body").length ? $("body").toArray() : $.root().children().toArray();
  const stack = [...roots].reverse();
  let traversedNodeCount = 0;
  let currentSection = null;

  while (stack.length > 0 && traversedNodeCount < maxTraversedNodes) {
    const node = stack.pop();
    traversedNodeCount += 1;
    if (!node) continue;

    if (node.type === "text") {
      appendText(currentSection, node.data, maxBodyCharacters);
      continue;
    }
    if (node.type !== "tag") continue;
    const element = $(node);
    if (element.is(EXCLUDED_CONTAINER_SELECTOR)) continue;

    if (element.is(titleSelector)) {
      const title = clean(element.text());
      currentSection = title && sections.length < maxSectionCount
        ? { title, bodyParts: [], bodyLength: 0, links: [] }
        : null;
      if (currentSection) sections.push(currentSection);
      continue;
    }

    if (currentSection && element.is("a")) {
      currentSection.links.push({
        href: clean(element.attr("href")),
        label: clean(element.text()),
      });
    }

    const children = Array.isArray(node.children) ? node.children : [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }

  return Object.freeze({
    title_selector: titleSelector,
    body_boundary: bodyBoundary,
    traversed_node_count: traversedNodeCount,
    traversal_truncated: stack.length > 0,
    sections: sections.map((section) => Object.freeze({
      title: section.title,
      body: clean(section.bodyParts.join(" ")),
      links: section.links.map((link) => Object.freeze({ ...link })),
    })),
  });
}
