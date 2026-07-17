import { load } from "cheerio";
import { createDocumentResult, sha256Bytes } from "./contract.mjs";
import { evaluateDocumentQuality } from "./quality.mjs";

export const HTML_PARSER_NAME = "structured-html";
export const HTML_PARSER_VERSION = "1.0.0";

const NOISE_SELECTOR = [
  "script", "style", "noscript", "nav", "header", "footer", "form",
  "[role='navigation']", ".navigation", ".nav", ".footer", ".header",
  ".breadcrumb", ".pagination", ".prev-next", ".login", ".privacy",
].join(",");

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function textWithLineBreaks($, node) {
  const cloned = $(node).clone();
  cloned.find("br").replaceWith("\n");
  return cloned.text()
    .split(/\n+/)
    .map(clean)
    .filter(Boolean)
    .join("\n");
}

function tableBlock($, table, sourceOrder) {
  const rows = [];
  $(table).find("tr").each((rowIndex, row) => {
    const cells = [];
    $(row).children("th,td").each((columnIndex, cell) => {
      cells.push({
        text: clean($(cell).text()),
        kind: cell.tagName?.toLowerCase() === "th" ? "header" : "data",
        row_index: rowIndex,
        column_index: columnIndex,
        rowspan: Math.max(1, Number($(cell).attr("rowspan")) || 1),
        colspan: Math.max(1, Number($(cell).attr("colspan")) || 1),
      });
    });
    if (cells.length) rows.push(cells);
  });
  const caption = clean($(table).find("caption").first().text()) || null;
  const firstHeaderRow = rows.find((row) => row.some((cell) => cell.kind === "header"));
  return {
    type: "table",
    caption,
    headers: firstHeaderRow?.map((cell) => cell.text) ?? [],
    rows: rows.map((row) => row.map((cell) => cell.text)),
    cells: rows.flat(),
    source_order: sourceOrder,
  };
}

export async function parseHtmlDocument(input = {}) {
  const html = String(input.html ?? Buffer.from(input.bytes ?? "").toString("utf8"));
  const $ = load(html);
  const selected = input.contentSelector && $(input.contentSelector).length
    ? $(input.contentSelector).first()
    : $("main,article,[role='main']").first().length
      ? $("main,article,[role='main']").first()
      : $("body");
  selected.find(NOISE_SELECTOR).remove();
  const blocks = [];
  let sourceOrder = 0;
  selected.find("h1,h2,h3,h4,h5,h6,p,ol,ul,blockquote,table,img,a[href]").each((_index, node) => {
    const tag = node.tagName?.toLowerCase();
    if (!["img", "a"].includes(tag) && $(node).parents("p,ol,ul,blockquote,table").length) return;
    let block = null;
    if (/^h[1-6]$/.test(tag)) block = { type: "heading", level: Number(tag.slice(1)), text: textWithLineBreaks($, node) };
    else if (tag === "p") block = { type: "paragraph", text: textWithLineBreaks($, node) };
    else if (tag === "blockquote") block = { type: "blockquote", text: textWithLineBreaks($, node) };
    else if (tag === "ol" || tag === "ul") block = {
      type: "list",
      ordered: tag === "ol",
      items: $(node).children("li").map((_i, item) => clean($(item).text())).get().filter(Boolean),
    };
    else if (tag === "table") block = tableBlock($, node, sourceOrder);
    else if (tag === "img") block = {
      type: "image_reference",
      src: $(node).attr("src") ?? null,
      alt: clean($(node).attr("alt")),
    };
    else if (tag === "a") {
      const href = $(node).attr("href") ?? "";
      if (/\.(pdf|hwp|hwpx|png|jpe?g|webp|gif|bmp|tiff?)(?:$|[?#])/i.test(href)) {
        block = { type: "attachment_reference", href, text: clean($(node).text()) };
      }
    }
    if (!block) return;
    const hasContent = block.text || block.items?.length || block.rows?.length || block.src || block.href;
    if (!hasContent) return;
    blocks.push({ ...block, source_order: sourceOrder });
    sourceOrder += 1;
  });
  const text = blocks.map((block) => {
    if (block.type === "list") return block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : "-"} ${item}`).join("\n");
    if (block.type === "table") return block.rows.map((row) => row.join(" | ")).join("\n");
    if (block.type === "image_reference") return block.alt;
    if (block.type === "attachment_reference") return block.text;
    return block.text;
  }).filter(Boolean).join("\n");
  const tableCount = blocks.filter((block) => block.type === "table").length;
  const imageCount = blocks.filter((block) => block.type === "image_reference").length;
  const quality = evaluateDocumentQuality({ text, contentBlocks: blocks, tableCount, imageCount });
  return createDocumentResult({
    ...input,
    bytes: Buffer.from(html),
    byte_size: Buffer.byteLength(html),
    byte_sha256: sha256Bytes(html),
    detected_format: "html",
    detected_mime_type: input.detected_mime_type ?? "text/html",
    extraction_status: quality.quality_status,
    extraction_method: "structured_dom",
    parser_name: HTML_PARSER_NAME,
    parser_version: HTML_PARSER_VERSION,
    extracted_text: text,
    content_blocks: blocks,
    table_count: tableCount,
    ...quality,
    provenance: { ...(input.provenance ?? {}), content_selector: input.contentSelector ?? null },
  });
}
