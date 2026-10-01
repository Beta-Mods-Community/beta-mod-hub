const namedEntities: Record<string, string> = {
  amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
};

// Scan delimiter runs once, then pair them using a reverse lookup. Unmatched
// punctuation stays literal without retrying every possible delimiter length.
function replaceDelimited(value: string, marker: string, replace: (text: string) => string): string {
  const runs: { start: number; end: number; opens: boolean; closes: boolean; next?: number }[] = [];
  for (let index = 0; index < value.length; index++) {
    if (value[index] !== marker) continue;
    const start = index;
    while (index + 1 < value.length && value[index + 1] === marker) index++;
    const end = index + 1;
    const width = end - start;
    if (marker !== "`" && (width > 3 || (marker === "~" && width !== 2))) continue;
    const before = value[start - 1] ?? "";
    const after = value[end] ?? "";
    runs.push({
      start, end,
      opens: marker === "`" || Boolean(after && !/\s/.test(after) && (marker !== "_" || !/\w/.test(before))),
      closes: marker === "`" || Boolean(before && !/\s/.test(before) && (marker !== "_" || !/\w/.test(after))),
    });
  }
  const nextClose = new Map<number, number>();
  for (let index = runs.length - 1; index >= 0; index--) {
    const run = runs[index];
    const width = run.end - run.start;
    run.next = nextClose.get(width);
    if (run.closes) nextClose.set(width, index);
  }
  const parts: string[] = [];
  let consumed = 0;
  for (let index = 0; index < runs.length; index++) {
    const run = runs[index];
    if (!run.opens || run.next === undefined) continue;
    const close = runs[run.next];
    parts.push(value.slice(consumed, run.start), replace(value.slice(run.end, close.start)));
    consumed = close.end;
    index = run.next;
  }
  parts.push(value.slice(consumed));
  return parts.join("");
}

function inlineText(value: string, references: Set<string>): string {
  const code: string[] = [];
  let text = replaceDelimited(value, "`", (text) => `\u0000${code.push(text.trim()) - 1}\u0000`)
    // Keep code and escaped punctuation literal while removing prose formatting.
    .replace(/\\([\\`*{}\[\]()#+.!_>~|-])/g, (_, text: string) => `\u0000${code.push(text) - 1}\u0000`)
    .replace(/!?\[([^\[\]]*)\]\((?:[^()\n]|\([^()\n]*\))*\)/g, (match, label: string) => match.startsWith("!") ? "" : label)
    .replace(/!?\[([^\[\]]*)\]\[([^\[\]]*)\]/g, (match, label: string) => match.startsWith("!") ? "" : label)
    .replace(/\[\^([^\[\]]+)\]/g, "")
    .replace(/\[([^\[\]]+)\]/g, (match, label: string) => references.has(label.toLowerCase()) ? label : match)
    .replace(/<(https?:\/\/[^<>\s]+|[^<>@\s]+@[^<>@\s]+)>/g, "$1")
    .replace(/<\/?[a-z][^<>]*>/gi, " ");
  for (const marker of ["*", "_", "~"]) text = replaceDelimited(text, marker, (content) => content);
  return text
    .replace(/\u0000(\d+)\u0000/g, (_, index: string) => code[Number(index)])
    .replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (match, entity: string) => {
      if (!entity.startsWith("#")) return namedEntities[entity.toLowerCase()] ?? match;
      const point = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** A plain-text preview, rendered as text by React; never use it as HTML. */
export function modExcerpt(description: string | null | undefined, maxLength = 280): string {
  if (!description?.trim() || !Number.isFinite(maxLength) || maxLength < 1) return "";
  const source = description
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/<(script|style)\b[^<>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, "");
  const lines = source.split("\n");
  const prose: string[] = [];
  const headings: string[] = [];
  const code: string[] = [];
  const references = new Set<string>();
  let fence: { character: string; length: number } | undefined;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      else code.push(line);
      continue;
    }
    if (marker) {
      fence = { character: marker[1][0], length: marker[1].length };
      continue;
    }
    const reference = line.match(/^ {0,3}\[([^\]]+)\]:\s*\S/);
    if (reference) {
      references.add(reference[1].toLowerCase());
      continue;
    }
    const heading = line.match(/^ {0,3}#{1,6}(?:\s+(.*?))?\s*$/);
    if (heading) {
      headings.push((heading[1] ?? "").replace(/\s+#+\s*$/, ""));
      continue;
    }
    if (line.trim() && /^ {0,3}(?:=+|-+)\s*$/.test(lines[index + 1] ?? "")) {
      headings.push(line);
      index++;
      continue;
    }
    if (/^\s*(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,}|\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?)$/.test(line)) continue;
    const content = line.replace(/^\s*(?:>\s*)+/, "").replace(/^\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, "");
    prose.push(/^\s*\||\|\s*$/.test(content) ? content.replace(/\s*\|\s*/g, " ") : content);
  }

  const text = inlineText(prose.join(" "), references) || inlineText(headings.join(" "), references) || code.join(" ").replace(/\s+/g, " ").trim();
  const limit = Math.floor(maxLength);
  const characters = Array.from(text);
  if (characters.length <= limit) return text;
  if (limit === 1) return "…";
  const candidate = characters.slice(0, limit - 1).join("");
  const lastSpace = candidate.lastIndexOf(" ");
  const end = lastSpace >= candidate.length * 0.65 ? lastSpace : candidate.length;
  return `${candidate.slice(0, end).trimEnd()}…`;
}
