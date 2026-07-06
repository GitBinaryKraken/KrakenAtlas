import { stringValue, uniqueStrings } from "./queryUtils";

export function referenceNextQueries(query: string, fallbackRows: Array<Record<string, unknown>>): string[] {
  return uniqueStrings([
    `kraken-atlas query relationships "${query}"`,
    `kraken-atlas query search "${query}"`,
    ...fallbackRows
      .map((row) => stringValue(row.record_id))
      .filter(Boolean)
      .slice(0, 3)
      .map((id) => `kraken-atlas query relationships "${id}"`)
  ]);
}

export function buildReferenceCoverageCaveats(query: string, fallbackRows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return [
    {
      recordType: "caveat",
      message: `No semantic references matched "${query}". Current reference coverage can miss Razor markup, model binding, string-based conventions, reflection, generated code, and dynamic framework usage. Use the fallback records as hints, not proof the symbol is unused.`
    },
    ...(fallbackRows.length
      ? [{
        recordType: "caveat",
        message: "Fallback records are bounded map-search matches from symbols, relationships, references, and files. Prefer relationship follow-ups before opening source broadly."
      }]
      : [{
        recordType: "caveat",
        message: "No fallback map-search records matched either. Retry with a shorter type name, method name, file name, route, selector, or config key."
      }])
  ];
}
