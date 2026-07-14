import {
  averagePatternConfidence,
  buildPatternMapSummaries,
  compactResponse,
  patternEvidence
} from "./queryEvidence";
import {
  buildArchitectureHotspots,
  buildPrecomputedArchitectureHotspots
} from "./queryHotspots";
import { queryTerms } from "./queryText";
import { QueryResponse } from "./queryTypes";
import {
  numberValue,
  placeholders,
  stringValue,
  uniqueStrings
} from "./queryUtils";

interface QueryWhere {
  sql: string;
  params: string[];
}

interface PatternQueryDependencies {
  ambiguousContextResponse(queryType: string, query: string): QueryResponse | undefined;
  execJson(sql: string, params?: unknown[]): Array<Record<string, unknown>>;
  execRows(sql: string, params?: unknown[]): Array<Record<string, unknown>>;
  queryContextFilePrefix?: string;
  relationshipContextWhere(prefix: "AND" | "WHERE"): QueryWhere;
  scopePatternsToContext(patterns: Array<Record<string, unknown>>): Array<Record<string, unknown>>;
}

export function findPatternsQuery(query: string, dependencies: PatternQueryDependencies): QueryResponse {
  const ambiguity = dependencies.ambiguousContextResponse("pattern", query);
  if (ambiguity) {
    return ambiguity;
  }

  const like = `%${query}%`;
  const rows = dependencies.execJson(
    `SELECT json FROM patterns
     WHERE id LIKE ? OR name LIKE ? OR category LIKE ? OR agent_guidance LIKE ?
     ORDER BY confidence DESC, frequency DESC
     LIMIT 12;`,
    [like, like, like, like]
  );

  return compactResponse({
    query,
    answer: rows.length ? `Found ${rows.length} pattern match(es).` : "No patterns matched.",
    confidence: rows.length ? 0.85 : 0,
    evidence: rows.map(patternEvidence),
    patterns: rows.map(patternEvidence),
    files: uniqueStrings(rows.flatMap(patternFiles)).slice(0, 20),
    symbols: uniqueStrings(rows.flatMap(patternSymbols)).slice(0, 20),
    nextQueries: patternRelationshipNextQueries(rows)
  });
}

export function findPatternMapQuery(query: string, dependencies: PatternQueryDependencies): QueryResponse {
  const ambiguity = dependencies.ambiguousContextResponse("pattern-map", query);
  if (ambiguity) {
    return ambiguity;
  }

  const rows = dependencies.scopePatternsToContext(dependencies.execJson(
    `SELECT json FROM patterns
     ORDER BY category, confidence DESC, frequency DESC, name
     LIMIT 100;`
  ));
  const summaries = buildPatternMapSummaries(rows);
  const topPatterns = rows
    .sort((left, right) =>
      numberValue(right.confidence) - numberValue(left.confidence) ||
      numberValue(right.frequency) - numberValue(left.frequency) ||
      stringValue(left.name).localeCompare(stringValue(right.name))
    )
    .slice(0, 12)
    .map(patternEvidence);

  return compactResponse({
    query,
    answer: rows.length
      ? `Pattern map found ${rows.length} detected project pattern(s) across ${summaries.length} architecture area(s).`
      : "No detected project patterns are indexed yet.",
    confidence: rows.length ? averagePatternConfidence(rows) : 0,
    evidence: [
      ...summaries,
      ...topPatterns.slice(0, 8)
    ],
    patterns: topPatterns,
    files: uniqueStrings(rows.flatMap(patternFiles)).slice(0, 20),
    symbols: uniqueStrings(rows.flatMap(patternSymbols)).slice(0, 20),
    nextQueries: patternMapNextQueries(rows)
  });
}

export function findArchitectureHotspotsQuery(query: string, dependencies: PatternQueryDependencies): QueryResponse {
  const ambiguity = dependencies.ambiguousContextResponse("hotspots", query);
  if (ambiguity) {
    return ambiguity;
  }

  const terms = queryTerms(query).filter((term) => !["hotspot", "hotspots", "architecture", "central", "shared"].includes(term));
  const precomputedHotspots = findPrecomputedArchitectureHotspots(terms, dependencies);
  const activeRows = precomputedHotspots ? [] : findHotspotRelationshipRows(terms, dependencies);
  const hotspots = precomputedHotspots ?? buildArchitectureHotspots(activeRows).slice(0, 8);
  const files = hotspots.map((hotspot) => stringValue(hotspot.file));

  return compactResponse({
    query,
    answer: hotspots.length
      ? `Found ${hotspots.length} architecture hotspot candidate(s). Treat central files as shared context, not default edit targets.`
      : "No architecture hotspot candidates found. Rebuild the map or run relationship queries first.",
    confidence: hotspots.length ? 0.72 : 0.2,
    evidence: [
      {
        recordType: "hotspotSummary",
        source: precomputedHotspots ? "node_usage_summary" : "relationships",
        message: precomputedHotspots
          ? "Hotspots are ranked from rebuild-time usage summaries. They are useful for architecture awareness and risk checks."
          : "Hotspots are ranked from relationship volume, relationship-type diversity, and shared graph endpoints. They are useful for architecture awareness and risk checks."
      },
      ...hotspots,
      {
        recordType: "caveat",
        message: "High centrality is not proof a file should be edited. Prefer feature-specific files unless the task explicitly touches startup, config, routing, shared services, or cross-cutting behavior."
      }
    ],
    files,
    relationships: activeRows.slice(0, 12),
    nextQueries: uniqueStrings(files.slice(0, 6).map((file) => `kraken-atlas query relationships "${file}"`))
  });
}

function findHotspotRelationshipRows(terms: string[], dependencies: PatternQueryDependencies): Array<Record<string, unknown>> {
  const context = dependencies.relationshipContextWhere("WHERE");
  const rows = dependencies.execJson(
    `SELECT json FROM relationships
     ${context.sql}
     ORDER BY file, start_line
     LIMIT 5000;`,
    context.params
  );
  const scopedRows = terms.length
    ? rows.filter((row) => terms.some((term) => JSON.stringify(row).toLowerCase().includes(term)))
    : rows;
  return scopedRows.length || !terms.length ? scopedRows : rows;
}

function findPrecomputedArchitectureHotspots(terms: string[], dependencies: PatternQueryDependencies): Array<Record<string, unknown>> | undefined {
  try {
    const rows = readUsageHotspotRows(terms, dependencies);
    const activeRows = rows.length || !terms.length ? rows : readUsageHotspotRows([], dependencies);
    if (activeRows.length === 0) {
      return [];
    }

    const files = activeRows.map((row) => stringValue(row.file));
    const typesByFile = readTopRelationshipTypesForFiles(files, dependencies);
    return buildPrecomputedArchitectureHotspots(activeRows, typesByFile);
  } catch {
    return undefined;
  }
}

function readUsageHotspotRows(terms: string[], dependencies: PatternQueryDependencies): Array<Record<string, unknown>> {
  const contextSql = dependencies.queryContextFilePrefix ? "AND f.path LIKE ?" : "";
  const contextParams = dependencies.queryContextFilePrefix ? [`${dependencies.queryContextFilePrefix}%`] : [];
  const termSql = terms.length ? `AND (${terms.map(() => "f.path LIKE ?").join(" OR ")})` : "";
  const termParams = terms.map((term) => `%${term}%`);
  return dependencies.execRows(
    `SELECT f.path AS file,
            u.incoming_count,
            u.outgoing_count,
            u.reference_count,
            u.project_count,
            u.hotspot_score,
            u.edit_likelihood,
            u.avoid_initially
     FROM node_usage_summary u
     JOIN files f ON f.id = u.node_id
     WHERE u.hotspot_score >= 4
       AND f.is_generated = 0
       ${contextSql}
       ${termSql}
     ORDER BY u.hotspot_score DESC, u.outgoing_count DESC, f.path
     LIMIT 8;`,
    [...contextParams, ...termParams]
  );
}

function readTopRelationshipTypesForFiles(files: string[], dependencies: PatternQueryDependencies): Map<string, Array<Record<string, unknown>>> {
  if (files.length === 0) {
    return new Map();
  }

  const rows = dependencies.execRows(
    `SELECT file, type, COUNT(*) AS count
     FROM relationships
     WHERE file IN (${placeholders(files.length)})
     GROUP BY file, type
     ORDER BY file, count DESC, type;`,
    files
  );
  const byFile = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const file = stringValue(row.file);
    const entries = byFile.get(file) ?? [];
    entries.push({ type: stringValue(row.type), count: numberValue(row.count) });
    byFile.set(file, entries);
  }
  return byFile;
}

function patternFiles(pattern: Record<string, unknown>): string[] {
  const instances = Array.isArray(pattern.instances) ? pattern.instances as Array<Record<string, unknown>> : [];
  return instances.flatMap((instance) => Array.isArray(instance.files) ? instance.files.map(stringValue) : []);
}

function patternSymbols(pattern: Record<string, unknown>): string[] {
  const instances = Array.isArray(pattern.instances) ? pattern.instances as Array<Record<string, unknown>> : [];
  return instances.flatMap((instance) => Array.isArray(instance.symbols) ? instance.symbols.map(stringValue) : []);
}

function patternMapNextQueries(patterns: Array<Record<string, unknown>>): string[] {
  const patternQueries = patterns
    .slice(0, 6)
    .map((pattern) => `kraken-atlas query pattern "${stringValue(pattern.id) || stringValue(pattern.name)}"`);
  const relationshipQueries = patterns
    .flatMap(patternSymbols)
    .slice(0, 6)
    .map((symbol) => `kraken-atlas query relationships "${symbol}"`);
  return uniqueStrings([...patternQueries, ...relationshipQueries]).slice(0, 10);
}

function patternRelationshipNextQueries(patterns: Array<Record<string, unknown>>): string[] {
  return uniqueStrings(patterns
    .flatMap(patternSymbols)
    .slice(0, 6)
    .map((symbol) => `kraken-atlas query relationships "${symbol}"`));
}
