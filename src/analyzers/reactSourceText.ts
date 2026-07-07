export type IndexedMatch = RegExpExecArray & { index: number };

export function matchAll(text: string, pattern: RegExp): IndexedMatch[] {
  return [...text.matchAll(pattern)] as IndexedMatch[];
}

export function findMatchingBrace(text: string, openBrace: number): number {
  return findMatchingPair(text, openBrace, "{", "}");
}

export function findMatchingParen(text: string, openParen: number): number {
  return findMatchingPair(text, openParen, "(", ")");
}

export function braceDepthAt(text: string, targetIndex: number): number {
  let depth = 0;
  for (let index = 0; index < targetIndex; index += 1) {
    const character = text[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth = Math.max(0, depth - 1);
    }
  }
  return depth;
}

function findMatchingPair(text: string, openIndex: number, openToken: string, closeToken: string): number {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1] ?? "";
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === openToken) depth += 1;
    else if (character === closeToken && --depth === 0) return index;
  }
  return -1;
}
