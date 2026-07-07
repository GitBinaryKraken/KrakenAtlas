import { compactResponse } from "./queryEvidence";
import { QueryResponse } from "./queryTypes";
import { numberValue, stringValue, uniqueStrings } from "./queryUtils";

export type CodeHealthFindingKind = "orphan-callable" | "duplicate-code-block" | "pattern-drift";

interface CodeHealthQueryDependencies {
  ambiguousContextResponse(queryType: string, query: string): QueryResponse | undefined;
  execJson(sql: string, params?: unknown[]): Array<Record<string, unknown>>;
  scopeFindingToContext(finding: Record<string, unknown>): Record<string, unknown> | undefined;
}

export function findCodeHealthQuery(kind: CodeHealthFindingKind, query: string, dependencies: CodeHealthQueryDependencies): QueryResponse {
  const queryType = kind === "orphan-callable" ? "orphans" : kind === "duplicate-code-block" ? "duplicates" : "drift";
  const ambiguity = dependencies.ambiguousContextResponse(queryType, query || "all");
  if (ambiguity) {
    return ambiguity;
  }

  const term = query.trim();
  const queryFilter = term ? "AND (title LIKE ? OR json LIKE ? OR file LIKE ?)" : "";
  const params = term ? [`%${term}%`, `%${term}%`, `%${term}%`] : [];
  const candidateRows = dependencies.execJson(
    `SELECT json FROM findings
     WHERE kind = ?
     ${queryFilter}
     ORDER BY confidence DESC, file, start_line
     LIMIT 1000;`,
    [kind, ...params]
  );
  const rows = candidateRows
    .map((row) => dependencies.scopeFindingToContext(row))
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .slice(0, 50);
  const locations = rows.flatMap((row) => Array.isArray(row.locations) ? row.locations as Array<Record<string, unknown>> : []);
  const label = kind === "orphan-callable" ? "orphan callable candidate" : kind === "duplicate-code-block" ? "duplicate code group" : "pattern drift candidate";

  return compactResponse({
    query: term || queryType,
    answer: rows.length ? `Found ${rows.length} ${label}(s).` : `No ${label}s matched.`,
    confidence: rows.length ? Math.min(...rows.map((row) => numberValue(row.confidence))) : 1,
    evidence: [
      {
        recordType: "findingSummary",
        kind,
        count: rows.length,
        message: kind === "orphan-callable"
          ? "Candidates have no mapped incoming static evidence after conservative exclusions; verify dynamic and external use before deletion."
          : kind === "duplicate-code-block"
            ? "Groups have exact normalized callable bodies; verify intent and ownership before consolidation."
            : "Candidates appear to diverge from detected local patterns; verify intent and nearby examples before changing architecture."
      },
      ...rows
    ],
    files: uniqueStrings(locations.map((location) => stringValue(location.file)).filter(Boolean)),
    symbols: uniqueStrings(locations.map((location) => stringValue(location.symbolId)).filter(Boolean)),
    nextQueries: uniqueStrings(locations.slice(0, 5).map((location) => `kraken-atlas query relationships "${stringValue(location.symbolId) || stringValue(location.file)}"`))
  });
}
