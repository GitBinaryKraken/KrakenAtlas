import { compactResponse, symbolEvidence } from "./queryEvidence";
import { QueryResponse } from "./queryTypes";
import { stringValue, uniqueStrings } from "./queryUtils";

interface QueryWhere {
  sql: string;
  params: string[];
}

interface ProjectQueryDependencies {
  ambiguousContextResponse(queryType: string, query: string): QueryResponse | undefined;
  execJson(sql: string, params?: unknown[]): Array<Record<string, unknown>>;
  execRows(sql: string, params?: unknown[]): Array<Record<string, unknown>>;
}

interface SymbolQueryDependencies {
  ambiguousContextResponse(queryType: string, query: string): QueryResponse | undefined;
  execJson(sql: string, params?: unknown[]): Array<Record<string, unknown>>;
  symbolContextWhere(prefix: "AND" | "WHERE"): QueryWhere;
}

export function getProjectQuery(query: string, dependencies: ProjectQueryDependencies): QueryResponse {
  const ambiguity = dependencies.ambiguousContextResponse("project", query);
  if (ambiguity) {
    return ambiguity;
  }

  const rows = dependencies.execJson("SELECT json FROM metadata WHERE key = 'project';");
  const project = rows[0] ?? null;
  const projectFiles = dependencies.execRows(
    `SELECT path FROM files WHERE extension = '.csproj' ORDER BY path LIMIT 50;`
  ).map((row) => stringValue(row.path));

  return compactResponse({
    query,
    answer: project ? "Project metadata summary." : "No project metadata found.",
    confidence: project ? 1 : 0,
    evidence: project ? [{
      recordType: "projectSummary",
      ...project,
      projects: projectFiles
    }] : [],
    files: projectFiles,
    nextQueries: ["kraken-atlas query symbols", "kraken-atlas query relationships", "kraken-atlas query pattern controller-service-flow"]
  });
}

export function findSymbolsQuery(query: string, dependencies: SymbolQueryDependencies): QueryResponse {
  const ambiguity = dependencies.ambiguousContextResponse("symbol", query);
  if (ambiguity) {
    return ambiguity;
  }

  const like = `%${query}%`;
  const context = dependencies.symbolContextWhere("AND");
  const rows = dependencies.execJson(
    `SELECT json FROM symbols
     WHERE (name LIKE ? OR fully_qualified_name LIKE ? OR file LIKE ?)
     ${context.sql}
     ORDER BY
       CASE WHEN name = ? THEN 0 WHEN name LIKE ? THEN 1 ELSE 2 END,
       file,
       start_line
     LIMIT 12;`,
    [like, like, like, ...context.params, query, `${query}%`]
  );

  return compactResponse({
    query,
    answer: rows.length ? `Found ${rows.length} symbol match(es).` : "No symbols matched.",
    confidence: rows.length ? 0.9 : 0,
    evidence: rows.map(symbolEvidence),
    symbols: rows.map((row) => String(row.id)),
    files: uniqueStrings(rows.map((row) => stringValue(row.file))),
    nextQueries: rows.slice(0, 5).map((row) => `kraken-atlas query relationships "${row.id}"`)
  });
}
