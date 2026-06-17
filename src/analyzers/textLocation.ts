import { SourceRange } from "../model/records";

export function rangeFromIndex(text: string, startIndex: number, length: number): SourceRange {
  const start = lineColumnFromIndex(text, startIndex);
  const end = lineColumnFromIndex(text, startIndex + Math.max(length, 1));

  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column
  };
}

function lineColumnFromIndex(text: string, index: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;

  for (let cursor = 0; cursor < index && cursor < text.length; cursor++) {
    if (text.charCodeAt(cursor) === 10) {
      line++;
      lineStart = cursor + 1;
    }
  }

  return {
    line,
    column: index - lineStart + 1
  };
}
