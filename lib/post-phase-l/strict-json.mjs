export function parseJsonWithDuplicateKeyCheck(text, label = "JSON") {
  let index = 0;
  const duplicates = [];

  function fail(message) {
    throw new SyntaxError(`${label}: ${message} at offset ${index}`);
  }

  function skipWhitespace() {
    while (/\s/.test(text[index] ?? "")) index += 1;
  }

  function parseString() {
    if (text[index] !== '"') fail("expected string");
    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === "\\") {
        index += 2;
        continue;
      }
      if (text[index] === '"') {
        index += 1;
        return JSON.parse(text.slice(start, index));
      }
      index += 1;
    }
    fail("unterminated string");
  }

  function parsePrimitive() {
    const remaining = text.slice(index);
    const match = remaining.match(/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/);
    if (!match) fail("invalid primitive");
    index += match[0].length;
  }

  function parseArray(path) {
    index += 1;
    skipWhitespace();
    let itemIndex = 0;
    if (text[index] === "]") {
      index += 1;
      return;
    }
    while (index < text.length) {
      parseValue(`${path}[${itemIndex}]`);
      itemIndex += 1;
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      if (text[index] !== ",") fail("expected array comma");
      index += 1;
      skipWhitespace();
    }
    fail("unterminated array");
  }

  function parseObject(path) {
    index += 1;
    skipWhitespace();
    const keys = new Set();
    if (text[index] === "}") {
      index += 1;
      return;
    }
    while (index < text.length) {
      const key = parseString();
      const keyPath = path ? `${path}.${key}` : key;
      if (keys.has(key)) duplicates.push(keyPath);
      keys.add(key);
      skipWhitespace();
      if (text[index] !== ":") fail("expected object colon");
      index += 1;
      skipWhitespace();
      parseValue(keyPath);
      skipWhitespace();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      if (text[index] !== ",") fail("expected object comma");
      index += 1;
      skipWhitespace();
    }
    fail("unterminated object");
  }

  function parseValue(path) {
    skipWhitespace();
    if (text[index] === "{") return parseObject(path);
    if (text[index] === "[") return parseArray(path);
    if (text[index] === '"') {
      parseString();
      return;
    }
    parsePrimitive();
  }

  parseValue("");
  skipWhitespace();
  if (index !== text.length) fail("trailing content");
  const value = JSON.parse(text);
  if (duplicates.length > 0) {
    throw new SyntaxError(`${label}: duplicate keys: ${duplicates.join(", ")}`);
  }
  return { value, duplicates };
}
