import { relationshipWeight } from "./queryScoring";
import { queryTerms } from "./queryText";
import { numberValue, stringValue } from "./queryUtils";

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
