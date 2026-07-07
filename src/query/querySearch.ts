import { compactResponse, searchEvidence } from "./queryEvidence";
import { looksLikeFileQuery } from "./queryPath";
import { relationshipWeight } from "./queryScoring";
import { queryTerms } from "./queryText";
import { QueryResponse } from "./queryTypes";
import { numberValue, stringValue, uniqueStrings } from "./queryUtils";

interface QueryWhere {
  sql: string;
  params: string[];
}

interface SearchQueryDependencies {
  ambiguousContextResponse(queryType: string, query: string): QueryResponse | undefined;
  execRows(sql: string, params?: unknown[]): Array<Record<string, unknown>>;
  fileContextWhere(prefix: "AND" | "WHERE"): QueryWhere;
  findSearchRowsByTerms(query: string, limit: number): Array<Record<string, unknown>>;
}

export function findSearchQuery(query: string, dependencies: SearchQueryDependencies): QueryResponse {
  const ambiguity = dependencies.ambiguousContextResponse("search", query);
  if (ambiguity) {
    return ambiguity;
  }

  const exactFileResponse = exactFileSearch(query, dependencies);
  if (exactFileResponse) {
    return exactFileResponse;
  }

  const candidateRows = rankSearchRowsForAgent(query, dependencies.findSearchRowsByTerms(query, 80));
  const rows = candidateRows.slice(0, 20);
  const weakMatch = isWeakMultiTermSearch(query, rows);
  const evidence = rows.map(searchEvidence);

  return compactResponse({
    query,
    answer: rows.length ? `Showing ${rows.length} ranked search result(s).` : "No search results matched.",
    confidence: rows.length ? weakMatch ? 0.4 : 0.7 : 0,
    evidence: [
      ...(candidateRows.length > rows.length ? [{
        recordType: "searchSummary",
        shownCount: rows.length,
        candidateCount: candidateRows.length,
        candidateCountIsLowerBound: candidateRows.length === 80,
        message: `Showing ${rows.length} of ${candidateRows.length === 80 ? "at least " : ""}${candidateRows.length} matched candidates; compact evidence is sampled.`
      }] : []),
      ...(weakMatch ? [{
        recordType: "caveat",
        message: "Search hits are weak because top results match only part of the query. Retry with an exact symbol, route, file name, error text, or more specific feature term."
      }] : []),
      ...evidence
    ],
    files: uniqueStrings(rows.map((row) => stringValue(row.path))),
    nextQueries: rows.slice(0, 5).map((row) => `kraken-atlas query relationships "${row.record_id}"`)
  });
}

export function rankSearchRowsForAgent(query: string, rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const terms = queryTerms(query);
  const scored = rows
    .map((row, index) => ({ row, index, score: searchRowScore(row, terms) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const perFile = new Map<string, number>();
  const selected: Array<Record<string, unknown>> = [];
  const overflow: Array<Record<string, unknown>> = [];

  for (const entry of scored) {
    const file = stringValue(entry.row.path);
    const key = file || stringValue(entry.row.record_id);
    const count = perFile.get(key) ?? 0;
    perFile.set(key, count + 1);
    if (count < 2) {
      selected.push(entry.row);
    } else {
      overflow.push(entry.row);
    }
  }

  return [...selected, ...overflow];
}

export function isWeakMultiTermSearch(query: string, rows: Array<Record<string, unknown>>): boolean {
  const terms = queryTerms(query);
  if (terms.length < 2 || rows.length === 0) {
    return false;
  }

  const topRows = rows.slice(0, 6);
  if (terms.length >= 3 && !topRows.some((row) => countSearchTermMatches(row, terms) >= terms.length)) {
    return true;
  }

  return !topRows.some((row) => countSearchTermMatches(row, terms) >= 2);
}

export function relationshipTermScore(row: Record<string, unknown>, terms: string[]): number {
  const haystack = [row.from_id, row.to_id, row.type, row.file, row.json].map(stringValue).join(" ").toLowerCase();
  const matchedTerms = terms.filter((term) => haystack.includes(term));
  return matchedTerms.length * 10 + relationshipWeight(stringValue(row.type));
}

export function scorePattern(pattern: Record<string, unknown>, terms: string[]): number {
  const haystack = [
    pattern.id,
    pattern.name,
    pattern.category,
    pattern.language,
    pattern.agentGuidance,
    ...(Array.isArray(pattern.rulesObserved) ? pattern.rulesObserved : [])
  ].map(stringValue).join(" ").toLowerCase();
  return terms.filter((term) => haystack.includes(term)).length + numberValue(pattern.confidence);
}

function exactFileSearch(query: string, dependencies: SearchQueryDependencies): QueryResponse | undefined {
  const normalized = query.trim().replace(/\\/g, "/");
  if (!looksLikeFileQuery(normalized)) {
    return undefined;
  }

  const context = dependencies.fileContextWhere("AND");
  const rows = dependencies.execRows(
    `SELECT json FROM files
     WHERE (LOWER(path) = LOWER(?) OR LOWER(path) LIKE LOWER(?))
     ${context.sql}
     ORDER BY CASE WHEN LOWER(path) = LOWER(?) THEN 0 ELSE 1 END, path
     LIMIT 20;`,
    [normalized, `%/${normalized}`, ...context.params, normalized]
  ).map((row) => JSON.parse(stringValue(row.json)) as Record<string, unknown>);

  if (!rows.length) {
    return compactResponse({
      query,
      answer: `No exact indexed file match for "${query}".`,
      confidence: 1,
      evidence: [{
        recordType: "exactFileSearch",
        requestedPath: normalized,
        found: false,
        message: "The filename-shaped query was checked against indexed file paths before fuzzy search."
      }],
      nextQueries: ["kraken-atlas query project"]
    });
  }

  return compactResponse({
    query,
    answer: `Found ${rows.length} exact indexed file match(es).`,
    confidence: 1,
    evidence: rows.map((row) => ({
      recordType: "exactFileSearch",
      requestedPath: normalized,
      found: true,
      file: row.path,
      language: row.language,
      extension: row.extension
    })),
    files: rows.map((row) => stringValue(row.path)),
    nextQueries: rows.map((row) => `kraken-atlas query relationships "${stringValue(row.path)}"`)
  });
}

function countSearchTermMatches(row: Record<string, unknown>, terms: string[]): number {
  const haystack = [row.title, row.body, row.path, row.record_id].map(stringValue).join(" ").toLowerCase();
  return terms.filter((term) => haystack.includes(term)).length;
}

function searchRowScore(row: Record<string, unknown>, terms: string[]): number {
  const title = stringValue(row.title).toLowerCase();
  const body = stringValue(row.body).toLowerCase();
  const file = stringValue(row.path).toLowerCase();
  const recordType = stringValue(row.record_type);
  let score = 0;

  for (const term of terms) {
    if (title.includes(term)) {
      score += 8;
    }
    if (file.includes(term)) {
      score += 6;
    }
    if (body.includes(term)) {
      score += 3;
    }
  }

  if (recordType === "file") {
    score += 5;
  } else if (recordType === "relationship") {
    score += 4;
  } else if (recordType === "symbol") {
    score += 2;
  } else if (recordType === "pattern") {
    score += 1;
  }

  if (/(basecontroller|controllerbase|base\.cs$)/i.test(file)) {
    score -= 4;
  }

  return score;
}
