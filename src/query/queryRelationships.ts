import { inferProjectNameFromFile } from "./queryContext";
import { relationshipSourceKind } from "../model/mapProvenance";
import {
  buildReferenceSummary,
  compactResponse,
  referenceEvidence,
  relationshipEvidence,
  relationshipFiles,
  searchEvidence
} from "./queryEvidence";
import { isCommonExternalSymbol, isLowValueRelationshipEdge } from "./queryFlow";
import { buildReferenceCoverageCaveats, referenceNextQueries } from "./queryReferences";
import { rankSearchRowsForAgent } from "./querySearch";
import { QueryResponse, RelationshipQueryOptions } from "./queryTypes";
import {
  booleanValue,
  numberValue,
  placeholders,
  stringValue,
  sumCounts,
  uniqueById,
  uniqueStrings
} from "./queryUtils";
import { findValueLifecycleRelationships } from "./queryValueLifecycle";

interface QueryWhere {
  sql: string;
  params: string[];
}

interface RelationshipQueryDependencies {
  ambiguousContextResponse(queryType: string, query: string): QueryResponse | undefined;
  execJson(sql: string, params?: unknown[]): Array<Record<string, unknown>>;
  execRows(sql: string, params?: unknown[]): Array<Record<string, unknown>>;
  findSearchRowsByTerms(query: string, limit: number): Array<Record<string, unknown>>;
  findSymbolIds(query: string): string[];
  hasQueryContext: boolean;
  queryContextName?: string;
  relationshipSourceKindColumnExists: boolean;
  referenceContextWhere(prefix: "AND" | "WHERE"): QueryWhere;
  relationshipContextWhere(prefix: "AND" | "WHERE"): QueryWhere;
  relationshipMatchesContext(row: Record<string, unknown>): boolean;
  withEndpointLocations(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>>;
}

export function findReferencesQuery(query: string, dependencies: RelationshipQueryDependencies): QueryResponse {
  const ambiguity = dependencies.ambiguousContextResponse("references", query);
  if (ambiguity) {
    return ambiguity;
  }

  const like = `%${query}%`;
  const context = dependencies.referenceContextWhere("AND");
  const rows = dependencies.execJson(
    `SELECT json FROM references_map
     WHERE (symbol_name LIKE ? OR resolved_symbol_id LIKE ? OR file LIKE ?)
     ${context.sql}
     ORDER BY file, start_line
     LIMIT 20;`,
    [like, like, like, ...context.params]
  );
  const symbolIds = uniqueStrings([
    ...dependencies.findSymbolIds(query),
    ...findGlobalExactSymbolIds(query, dependencies)
  ]);
  const relatedRelationships = findReferenceRelationships(query, symbolIds, dependencies);
  const sourceReferenceKinds = countReferenceMatches(query, dependencies);
  const relationshipTypes = countReferenceRelationships(query, symbolIds, dependencies);
  const sourceReferenceCount = sumCounts(sourceReferenceKinds);
  const connectedRelationshipCount = sumCounts(relationshipTypes);
  const hasSemanticEvidence = sourceReferenceCount > 0 || connectedRelationshipCount > 0;
  const fallbackRows = hasSemanticEvidence ? [] : findReferenceFallbackRows(query, 6, dependencies);
  const caveats = hasSemanticEvidence ? [] : buildReferenceCoverageCaveats(query, fallbackRows);
  const referenceSummary = hasSemanticEvidence ? buildReferenceSummary(sourceReferenceKinds, relationshipTypes, symbolIds) : undefined;
  const evidence = hasSemanticEvidence
    ? [referenceSummary!, ...relatedRelationships.map(relationshipEvidence), ...rows.map(referenceEvidence)]
    : [...caveats, ...fallbackRows.map(searchEvidence)];
  const fallbackFiles = uniqueStrings(fallbackRows.map((row) => stringValue(row.path)).filter(Boolean));
  const symbolFiles = symbolIds.length ? dependencies.execRows(
    `SELECT file FROM symbols WHERE id IN (${placeholders(symbolIds.length)});`,
    symbolIds
  ).map((row) => stringValue(row.file)) : [];
  const semanticFiles = uniqueStrings([
    ...symbolFiles,
    ...relationshipFiles(relatedRelationships),
    ...rows.map((row) => stringValue(row.file))
  ].filter(Boolean));

  return compactResponse({
    query,
    answer: hasSemanticEvidence
      ? `Found ${sourceReferenceCount} source reference record(s) and ${connectedRelationshipCount} connected relationship edge(s).`
      : `No semantic references matched "${query}". Returning bounded map-search fallback and coverage caveat.`,
    confidence: hasSemanticEvidence ? 0.88 : fallbackRows.length ? 0.35 : 0.2,
    evidence,
    symbols: uniqueStrings([
      ...symbolIds,
      ...rows.map((row) => stringValue(row.resolvedSymbolId)),
      ...relatedRelationships.flatMap((row) => [stringValue(row.from), stringValue(row.to)]).filter((id) => id.startsWith("symbol:"))
    ]),
    relationships: relatedRelationships.map(relationshipEvidence),
    files: hasSemanticEvidence ? semanticFiles : fallbackFiles,
    nextQueries: uniqueStrings([
      ...symbolIds.slice(0, 3).map((id) => `kraken-atlas query relationships "${id}"`),
      ...referenceNextQueries(query, fallbackRows)
    ]).slice(0, 8)
  });
}

export function findRelationshipsQuery(query: string, options: RelationshipQueryOptions, dependencies: RelationshipQueryDependencies): QueryResponse {
  const ambiguity = dependencies.ambiguousContextResponse("relationships", query);
  if (ambiguity) {
    return ambiguity;
  }

  const scopedSymbolIds = dependencies.findSymbolIds(query);
  const globalExactSymbolIds = findGlobalExactSymbolIds(query, dependencies);
  const symbolIds = uniqueStrings([...scopedSymbolIds, ...globalExactSymbolIds]);
  const terms = [query, ...symbolIds];
  const context = dependencies.relationshipContextWhere("AND");
  const edgeTypes = uniqueStrings((options.edgeTypes ?? []).map((edgeType) => edgeType.trim().toUpperCase()).filter(Boolean));
  const edgeFilter = edgeTypes.length ? `AND type IN (${placeholders(edgeTypes.length)})` : "";
  const sourceKinds = uniqueStrings((options.sourceKinds ?? []).map((sourceKind) => sourceKind.trim().toLowerCase()).filter(Boolean));
  const filterSourceKindsInSql = dependencies.relationshipSourceKindColumnExists;
  const sourceKindFilter = filterSourceKindsInSql && sourceKinds.length ? `AND source_kind IN (${placeholders(sourceKinds.length)})` : "";
  const limit = Math.max(1, Math.min(options.limit ?? 30, 100));
  let rows = dependencies.execJson(
    `SELECT json FROM relationships
     WHERE (from_id IN (${placeholders(terms.length)})
        OR to_id IN (${placeholders(terms.length)})
        OR from_id LIKE ?
        OR to_id LIKE ?
        OR file LIKE ?
        OR type LIKE ?
        OR json LIKE ?)
     ${edgeFilter}
     ${sourceKindFilter}
     ${context.sql}
     ORDER BY
       CASE
         WHEN from_id IN (${placeholders(terms.length)}) OR to_id IN (${placeholders(terms.length)}) THEN 0
         WHEN from_id LIKE ? OR to_id LIKE ? THEN 1
         WHEN json LIKE ? THEN 2
         WHEN file LIKE ? THEN 3
         ELSE 4
       END,
       CASE type
         WHEN 'UPSERTS_TABLE' THEN 0
         WHEN 'WRITES_TABLE' THEN 1
         WHEN 'DELETES_FROM_TABLE' THEN 2
         WHEN 'READS_TABLE' THEN 3
         WHEN 'JOINS_TABLE' THEN 4
         WHEN 'BACKS_TABLE' THEN 5
         WHEN 'MAPS_DAPPER_RESULT' THEN 6
         WHEN 'USES_DAPPER_PARAMETER' THEN 7
         WHEN 'PROJECTS_DAPPER_ROW' THEN 8
         WHEN 'MAPS_DAPPER_PROPERTY' THEN 9
         WHEN 'PROJECTS_MODEL' THEN 10
         WHEN 'INSERTS_ROW' THEN 11
         WHEN 'ROW_IN_TABLE' THEN 12
         WHEN 'ROW_HAS_TYPE_CODE' THEN 13
         WHEN 'MAPS_ROUTE' THEN 14
         WHEN 'REQUIRES_AUTH' THEN 15
         WHEN 'WRITES_QUERY_STRING' THEN 16
         WHEN 'READS_QUERY_STRING' THEN 17
         WHEN 'WRITES_BROWSER_HISTORY' THEN 18
         WHEN 'POSTS_TO' THEN 19
         WHEN 'WRITES' THEN 20
         WHEN 'QUERIES' THEN 21
         WHEN 'CALLS_REPOSITORY' THEN 22
         WHEN 'CALLS' THEN 23
         WHEN 'IMPLEMENTS' THEN 24
         WHEN 'INJECTS' THEN 25
         WHEN 'WRITES_FIELD' THEN 26
         WHEN 'BINDS_MODEL_PROPERTY' THEN 27
         WHEN 'MAPS_PROPERTY' THEN 28
         WHEN 'SELECTS_ELEMENT' THEN 29
         WHEN 'INVOKES_VIEW_COMPONENT' THEN 30
         WHEN 'RENDERS_VIEW' THEN 31
         WHEN 'CONTAINS' THEN 99
         ELSE 50
       END,
       file,
       start_line
     LIMIT ${limit};`,
    [
      ...terms,
      ...terms,
      `%${query}%`,
      `%${query}%`,
      `%${query}%`,
      `%${query}%`,
      `%${query}%`,
      ...edgeTypes,
      ...(filterSourceKindsInSql ? sourceKinds : []),
      ...context.params,
      ...terms,
      ...terms,
      `%${query}%`,
      `%${query}%`,
      `%${query}%`,
      `%${query}%`
    ]
  );

  if (dependencies.hasQueryContext && globalExactSymbolIds.length) {
    const connectedRows = dependencies.execJson(
      `SELECT json FROM relationships
       WHERE (from_id IN (${placeholders(globalExactSymbolIds.length)}) OR to_id IN (${placeholders(globalExactSymbolIds.length)}))
       ${edgeFilter}
       ${sourceKindFilter}
       ORDER BY
         CASE type
           WHEN 'IMPLEMENTS' THEN 0
           WHEN 'REGISTERS' THEN 1
           WHEN 'RAZOR_INJECTS' THEN 2
           WHEN 'CALLS_INJECTED_SERVICE' THEN 3
           WHEN 'INJECTS' THEN 4
           ELSE 20
         END,
         file,
         start_line
       LIMIT ${limit};`,
      [...globalExactSymbolIds, ...globalExactSymbolIds, ...edgeTypes, ...(filterSourceKindsInSql ? sourceKinds : [])]
    );
    rows = uniqueById([...connectedRows, ...rows]).slice(0, limit);
  }

  const dapperProjectionRows = findProjectionChainRelationships(rows, edgeTypes, sourceKinds, filterSourceKindsInSql, limit, dependencies);
  if (dapperProjectionRows.length) {
    const directBudget = Math.max(1, limit - dapperProjectionRows.length);
    rows = uniqueById([...rows.slice(0, directBudget), ...dapperProjectionRows]).slice(0, limit);
  }

  const valueLifecycleRows = symbolIds.some(isExactDataNodeId) ? [] : findValueLifecycleRelationships({
    query,
    symbolIds,
    edgeTypes,
    sourceKinds,
    filterSourceKindsInSql,
    limit,
    relationshipContext: dependencies.relationshipContextWhere("AND"),
    readJson: (sql, params = []) => dependencies.execJson(sql, params)
  });
  const hasDirectSeedRows = rows.some((row) => terms.includes(stringValue(row.from)) || terms.includes(stringValue(row.to)));
  rows = uniqueById(hasDirectSeedRows ? [...rows, ...valueLifecycleRows] : [...valueLifecycleRows, ...rows]).slice(0, limit);
  if (sourceKinds.length) {
    rows = rows.filter((row) => sourceKinds.includes(rowSourceKind(row)));
  }

  const filteredRows = dependencies.withEndpointLocations(filterRelationshipRowsForQuery(rows, query));
  const omittedCount = Math.max(0, rows.length - filteredRows.length);
  const expandedRows = dependencies.hasQueryContext ? filteredRows.filter((row) => !dependencies.relationshipMatchesContext(row)) : [];
  const expandedTypes = countByValues(expandedRows.map((row) => stringValue(row.type)));
  const datatypeProjectUsage = buildDatatypeProjectUsage(query, symbolIds, dependencies);
  const datatypeRoleSummary = buildNodeRoleSummary(symbolIds, dependencies);
  const datatypeTagSummary = buildNodeTagSummary(symbolIds, dependencies);
  const datatypeMemberSummary = buildNodeMemberSummary(symbolIds, dependencies);

  return compactResponse({
    query,
    answer: filteredRows.length
      ? `Found ${filteredRows.length} relationship edge(s)${formatRelationshipFiltersForAnswer(edgeTypes, sourceKinds)}.`
      : "No relationships matched.",
    confidence: filteredRows.length ? 0.9 : 0,
    evidence: [
      ...(datatypeProjectUsage ? [datatypeProjectUsage] : []),
      ...(datatypeRoleSummary ? [datatypeRoleSummary] : []),
      ...(datatypeTagSummary ? [datatypeTagSummary] : []),
      ...(datatypeMemberSummary ? [datatypeMemberSummary] : []),
      ...(expandedRows.length ? [{
        recordType: "contextExpansion",
        context: dependencies.queryContextName,
        edgeTypes: expandedTypes,
        message: `Included ${expandedRows.length} directly connected edge(s) outside seed context ${dependencies.queryContextName}: ${formatCountMap(expandedTypes)}.`
      }] : []),
      ...(edgeTypes.length || sourceKinds.length ? [{
        recordType: "relationshipFilter",
        edgeTypes,
        sourceKinds,
        message: formatRelationshipFilterMessage(edgeTypes, sourceKinds)
      }] : []),
      ...(rows.length >= limit ? [{
        recordType: "caveat",
        message: `Result hit the limit of ${limit}. Retry with --edge, a more exact symbol/file/query, or --limit up to 100.`
      }] : []),
      ...(omittedCount ? [{
        recordType: "caveat",
        message: `${omittedCount} low-value framework edge(s) were omitted from this compact result.`
      }] : []),
      ...filteredRows.map(relationshipEvidence)
    ],
    relationships: filteredRows.map(relationshipEvidence),
    symbols: uniqueStrings(filteredRows.flatMap((row) => [stringValue(row.from), stringValue(row.to)]).filter(isQueryableNodeId)),
    files: relationshipFiles(filteredRows),
    nextQueries: relationshipNextQueries(filteredRows)
  });
}

function findProjectionChainRelationships(
  rows: Array<Record<string, unknown>>,
  edgeTypes: string[],
  sourceKinds: string[],
  filterSourceKindsInSql: boolean,
  limit: number,
  dependencies: RelationshipQueryDependencies
): Array<Record<string, unknown>> {
  const sourceKindFilter = filterSourceKindsInSql && sourceKinds.length ? `AND source_kind IN (${placeholders(sourceKinds.length)})` : "";
  const allowedDapperTypes = ["PROJECTS_DAPPER_ROW", "MAPS_DAPPER_PROPERTY"].filter((type) => edgeTypes.length === 0 || edgeTypes.includes(type));
  const rowTypeIds = uniqueStrings(rows
    .filter((row) => stringValue(row.type) === "MAPS_DAPPER_RESULT")
    .map((row) => stringValue(row.to))
    .filter((id) => id.startsWith("symbol:csharp:")));
  const dapperRows = allowedDapperTypes.length && rowTypeIds.length ? dependencies.execJson(
    `SELECT json FROM relationships
     WHERE type IN (${placeholders(allowedDapperTypes.length)})
       ${sourceKindFilter}
       AND (
         from_id IN (${placeholders(rowTypeIds.length)})
         OR to_id IN (${placeholders(rowTypeIds.length)})
         OR ${rowTypeIds.map(() => "from_id LIKE ? OR to_id LIKE ?").join(" OR ")}
       )
     ORDER BY
       CASE type
         WHEN 'PROJECTS_DAPPER_ROW' THEN 0
         WHEN 'MAPS_DAPPER_PROPERTY' THEN 1
         ELSE 20
       END,
       file,
       start_line
     LIMIT ${Math.min(limit, 20)};`,
    [
      ...allowedDapperTypes,
      ...(filterSourceKindsInSql ? sourceKinds : []),
      ...rowTypeIds,
      ...rowTypeIds,
      ...rowTypeIds.flatMap((id) => [`${id}.%`, `${id}.%`])
    ]
  ) : [];

  const allowedModelTypes = ["PROJECTS_MODEL"].filter((type) => edgeTypes.length === 0 || edgeTypes.includes(type));
  const modelTypeIds = uniqueStrings([
    ...rows,
    ...dapperRows
  ]
    .filter((row) => stringValue(row.type) === "PROJECTS_DAPPER_ROW")
    .map((row) => stringValue(row.to))
    .filter((id) => id.startsWith("symbol:csharp:")));
  const modelRows = allowedModelTypes.length && modelTypeIds.length ? dependencies.execJson(
    `SELECT json FROM relationships
     WHERE type IN (${placeholders(allowedModelTypes.length)})
       ${sourceKindFilter}
       AND from_id IN (${placeholders(modelTypeIds.length)})
     ORDER BY file, start_line
     LIMIT ${Math.min(limit, 20)};`,
    [
      ...allowedModelTypes,
      ...(filterSourceKindsInSql ? sourceKinds : []),
      ...modelTypeIds
    ]
  ) : [];

  const dapperTypeRows = dapperRows.filter((row) => stringValue(row.type) === "PROJECTS_DAPPER_ROW");
  const dapperPropertyRows = dapperRows.filter((row) => stringValue(row.type) !== "PROJECTS_DAPPER_ROW");
  return uniqueById([...dapperTypeRows, ...modelRows, ...dapperPropertyRows]);
}

export function relationshipNextQueries(rows: Array<Record<string, unknown>>): string[] {
  return uniqueStrings(
    rows
      .flatMap((row) => [stringValue(row.from), stringValue(row.to)])
      .filter((id) => id && !isCommonExternalSymbol(id))
      .slice(0, 10)
      .map((id) => `kraken-atlas query relationships "${id}"`)
  );
}

function findReferenceRelationships(query: string, symbolIds: string[], dependencies: RelationshipQueryDependencies): Array<Record<string, unknown>> {
  if (symbolIds.length === 0) {
    return [];
  }

  const like = `%${query}%`;
  return dependencies.withEndpointLocations(dependencies.execJson(
    `SELECT json FROM relationships
     WHERE from_id IN (${placeholders(symbolIds.length)})
        OR to_id IN (${placeholders(symbolIds.length)})
        OR from_id LIKE ?
        OR to_id LIKE ?
     ORDER BY
       CASE type
         WHEN 'IMPLEMENTS' THEN 0
         WHEN 'REGISTERS' THEN 1
         WHEN 'RAZOR_INJECTS' THEN 2
         WHEN 'CALLS_INJECTED_SERVICE' THEN 3
         WHEN 'INJECTS' THEN 4
         WHEN 'CALLS' THEN 5
         ELSE 20
       END,
       file,
       start_line
     LIMIT 30;`,
    [...symbolIds, ...symbolIds, like, like]
  ));
}

function countReferenceMatches(query: string, dependencies: RelationshipQueryDependencies): Record<string, number> {
  const like = `%${query}%`;
  const context = dependencies.referenceContextWhere("AND");
  const rows = dependencies.execRows(
    `SELECT context, COUNT(*) AS count FROM references_map
     WHERE (symbol_name LIKE ? OR resolved_symbol_id LIKE ? OR file LIKE ?)
     ${context.sql}
     GROUP BY context;`,
    [like, like, like, ...context.params]
  );
  return Object.fromEntries(rows.map((row) => [stringValue(row.context) || "unknown", numberValue(row.count)]));
}

function countReferenceRelationships(query: string, symbolIds: string[], dependencies: RelationshipQueryDependencies): Record<string, number> {
  if (symbolIds.length === 0) {
    return {};
  }

  const like = `%${query}%`;
  const rows = dependencies.execRows(
    `SELECT type, COUNT(*) AS count FROM relationships
     WHERE from_id IN (${placeholders(symbolIds.length)})
        OR to_id IN (${placeholders(symbolIds.length)})
        OR from_id LIKE ?
        OR to_id LIKE ?
     GROUP BY type;`,
    [...symbolIds, ...symbolIds, like, like]
  );
  return Object.fromEntries(rows.map((row) => [stringValue(row.type) || "unknown", numberValue(row.count)]));
}

function findGlobalExactSymbolIds(query: string, dependencies: RelationshipQueryDependencies): string[] {
  if (!dependencies.hasQueryContext || !query.trim()) {
    return [];
  }

  return dependencies.execRows(
    `SELECT id FROM symbols
     WHERE name = ?
        OR id = ?
        OR fully_qualified_name = ?
        OR fully_qualified_name LIKE ?
     ORDER BY CASE WHEN name = ? THEN 0 ELSE 1 END, file, start_line
     LIMIT 10;`,
    [query, query, query, `%.${query}`, query]
  ).map((row) => stringValue(row.id));
}

function buildNodeMemberSummary(symbolIds: string[], dependencies: RelationshipQueryDependencies): Record<string, unknown> | undefined {
  if (symbolIds.length === 0) {
    return undefined;
  }

  try {
    const rows = dependencies.execRows(
      `SELECT node_id, member_id, member_name, member_kind, type_name, required, nullable
       FROM node_members
       WHERE node_id IN (${placeholders(symbolIds.length)})
       ORDER BY node_id, member_name
       LIMIT 40;`,
      symbolIds
    );
    if (rows.length === 0) {
      return undefined;
    }

    const memberCounts = dependencies.execRows(
      `SELECT node_id, COUNT(*) AS member_count
       FROM node_members
       WHERE node_id IN (${placeholders(symbolIds.length)})
       GROUP BY node_id;`,
      symbolIds
    );

    return {
      recordType: "nodeMemberSummary",
      memberCount: memberCounts.reduce((total, row) => total + numberValue(row.member_count), 0),
      sampledCount: rows.length,
      members: rows.map((row) => ({
        nodeId: stringValue(row.node_id),
        memberId: stringValue(row.member_id),
        name: stringValue(row.member_name),
        kind: stringValue(row.member_kind),
        typeName: stringValue(row.type_name),
        required: booleanValue(row.required),
        nullable: booleanValue(row.nullable)
      }))
    };
  } catch {
    return undefined;
  }
}

function buildNodeRoleSummary(symbolIds: string[], dependencies: RelationshipQueryDependencies): Record<string, unknown> | undefined {
  if (symbolIds.length === 0) {
    return undefined;
  }

  try {
    const rows = dependencies.execRows(
      `SELECT role, MAX(confidence) AS confidence, GROUP_CONCAT(DISTINCT source) AS sources, COUNT(*) AS node_count
       FROM node_roles
       WHERE node_id IN (${placeholders(symbolIds.length)})
       GROUP BY role
       ORDER BY confidence DESC, role
       LIMIT 12;`,
      symbolIds
    );
    if (rows.length === 0) {
      return undefined;
    }

    return {
      recordType: "nodeRoleSummary",
      roles: rows.map((row) => ({
        role: stringValue(row.role),
        confidence: numberValue(row.confidence),
        sources: stringValue(row.sources).split(",").filter(Boolean),
        nodeCount: numberValue(row.node_count)
      }))
    };
  } catch {
    return undefined;
  }
}

function buildNodeTagSummary(symbolIds: string[], dependencies: RelationshipQueryDependencies): Record<string, unknown> | undefined {
  if (symbolIds.length === 0) {
    return undefined;
  }

  try {
    const rows = dependencies.execRows(
      `SELECT tag, MAX(confidence) AS confidence, GROUP_CONCAT(DISTINCT source) AS sources, COUNT(DISTINCT node_id) AS node_count
       FROM node_tags
       WHERE node_id IN (${placeholders(symbolIds.length)})
       GROUP BY tag
       ORDER BY confidence DESC, node_count DESC, tag
       LIMIT 16;`,
      symbolIds
    );
    if (rows.length === 0) {
      return undefined;
    }

    return {
      recordType: "nodeTagSummary",
      tags: rows.map((row) => ({
        tag: stringValue(row.tag),
        confidence: numberValue(row.confidence),
        sources: stringValue(row.sources).split(",").filter(Boolean),
        nodeCount: numberValue(row.node_count)
      }))
    };
  } catch {
    return undefined;
  }
}

function buildDatatypeProjectUsage(query: string, symbolIds: string[], dependencies: RelationshipQueryDependencies): Record<string, unknown> | undefined {
  if (symbolIds.length === 0) {
    return undefined;
  }

  const symbols = dependencies.execJson(
    `SELECT json FROM symbols WHERE id IN (${placeholders(symbolIds.length)}) LIMIT 80;`,
    symbolIds
  );
  const csharpSymbols = symbols.filter((symbol) => stringValue(symbol.language) === "csharp");
  if (csharpSymbols.length === 0) {
    return undefined;
  }

  const enrichedProjectUsage = readNodeProjectUsage(symbolIds, dependencies);
  if (enrichedProjectUsage) {
    return enrichedProjectUsage;
  }

  const declarationProjects = countByValues(csharpSymbols.map((symbol) => inferProjectNameFromFile(stringValue(symbol.file)) ?? "").filter(Boolean));
  const referenceRows = dependencies.execRows(
    `SELECT file FROM references_map
     WHERE resolved_symbol_id IN (${placeholders(symbolIds.length)})
        OR resolved_symbol_id LIKE ?
        OR symbol_name LIKE ?
     LIMIT 500;`,
    [...symbolIds, `%${query}%`, `%${query}%`]
  );
  const relationshipRows = dependencies.execRows(
    `SELECT file FROM relationships
     WHERE from_id IN (${placeholders(symbolIds.length)})
        OR to_id IN (${placeholders(symbolIds.length)})
        OR from_id LIKE ?
        OR to_id LIKE ?
        OR json LIKE ?
     LIMIT 500;`,
    [...symbolIds, ...symbolIds, `%${query}%`, `%${query}%`, `%${query}%`]
  );
  const referenceProjects = countByValues(referenceRows.map((row) => inferProjectNameFromFile(stringValue(row.file)) ?? "").filter(Boolean));
  const relationshipProjects = countByValues(relationshipRows.map((row) => inferProjectNameFromFile(stringValue(row.file)) ?? "").filter(Boolean));
  const projects = uniqueStrings([
    ...Object.keys(declarationProjects),
    ...Object.keys(referenceProjects),
    ...Object.keys(relationshipProjects)
  ]);

  if (projects.length <= 1 && Object.keys(referenceProjects).length === 0 && Object.keys(relationshipProjects).length === 0) {
    return undefined;
  }

  return {
    recordType: "datatypeProjectUsage",
    symbolCount: csharpSymbols.length,
    declaredIn: declarationProjects,
    referencedFrom: referenceProjects,
    relationshipEvidenceFrom: relationshipProjects,
    projects
  };
}

function readNodeProjectUsage(symbolIds: string[], dependencies: RelationshipQueryDependencies): Record<string, unknown> | undefined {
  try {
    const rows = dependencies.execRows(
      `SELECT project, role, SUM(evidence_count) AS evidence_count
       FROM node_projects
       WHERE node_id IN (${placeholders(symbolIds.length)})
       GROUP BY project, role
       ORDER BY project, role;`,
      symbolIds
    );
    if (rows.length === 0) {
      return undefined;
    }

    const byRole = (role: string): Record<string, number> => Object.fromEntries(rows
      .filter((row) => stringValue(row.role) === role)
      .map((row) => [stringValue(row.project), numberValue(row.evidence_count)]));
    const declaredIn = byRole("declared");
    const referencedFrom = byRole("referenced");
    const relationshipEvidenceFrom = byRole("related");
    const projects = uniqueStrings(rows.map((row) => stringValue(row.project)));
    if (projects.length <= 1 && Object.keys(referencedFrom).length === 0 && Object.keys(relationshipEvidenceFrom).length === 0) {
      return undefined;
    }

    return {
      recordType: "datatypeProjectUsage",
      symbolCount: symbolIds.length,
      declaredIn,
      referencedFrom,
      relationshipEvidenceFrom,
      projects
    };
  } catch {
    return undefined;
  }
}

function findReferenceFallbackRows(query: string, limit: number, dependencies: RelationshipQueryDependencies): Array<Record<string, unknown>> {
  return rankSearchRowsForAgent(query, dependencies.findSearchRowsByTerms(query, Math.max(limit * 3, 12))).slice(0, limit);
}

function filterRelationshipRowsForQuery(rows: Array<Record<string, unknown>>, query: string): Array<Record<string, unknown>> {
  const lowerQuery = query.toLowerCase();
  if (rows.length === 0 || queryTargetsCommonExternalSymbol(lowerQuery)) {
    return rows;
  }

  const filtered = rows.filter((row) => !isLowValueRelationshipEdge(row));
  return filtered.length > 0 ? filtered : rows;
}

function queryTargetsCommonExternalSymbol(lowerQuery: string): boolean {
  return /\b(string|int|long|double|decimal|bool|object|task|ienumerable|ilist|list|dictionary|datetime|guid|iconfiguration|ihttpclientfactory|ilogger|iserviceprovider|pagemodel|controller|controllerbase)\b/i.test(lowerQuery);
}

function isQueryableNodeId(value: string): boolean {
  return value.startsWith("symbol:") || value.startsWith("table:") || value.startsWith("type-code:") || value.startsWith("row:");
}

function isExactDataNodeId(value: string): boolean {
  return value.startsWith("table:") || value.startsWith("row:") || value.startsWith("type-code:");
}

function rowSourceKind(row: Record<string, unknown>): string {
  return stringValue(row.sourceKind) || relationshipSourceKind(row);
}

function countByValues(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values.filter(Boolean)) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function formatRelationshipFiltersForAnswer(edgeTypes: string[], sourceKinds: string[]): string {
  const parts = [
    edgeTypes.length ? `types ${edgeTypes.join(", ")}` : "",
    sourceKinds.length ? `source kinds ${sourceKinds.join(", ")}` : ""
  ].filter(Boolean);
  return parts.length ? ` filtered to ${parts.join("; ")}` : "";
}

function formatRelationshipFilterMessage(edgeTypes: string[], sourceKinds: string[]): string {
  const parts = [
    edgeTypes.length ? `relationship types: ${edgeTypes.join(", ")}` : "",
    sourceKinds.length ? `source kinds: ${sourceKinds.join(", ")}` : ""
  ].filter(Boolean);
  return `Showing only ${parts.join("; ")}.`;
}

function formatCountMap(counts: Record<string, number>): string {
  return Object.entries(counts).map(([key, count]) => `${key}=${count}`).join(", ");
}
