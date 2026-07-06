import * as path from "path";
import { Database } from "sql.js";
import { openSqliteIndex } from "../storage/sqliteIndex";
import {
  contextFromProjectSymbol,
  inferProjectNameFromFile,
  inferProjectNameFromSymbol,
  normalizeQueryContext,
  resolveContextCandidate,
  uniqueContexts
} from "./queryContext";
import {
  buildContextPruningResult,
  ContextProjectRow,
  ContextTagRow,
  contextPruningNodeIds
} from "./queryContextPruning";
import {
  averagePatternConfidence,
  buildPatternMapSummaries,
  buildReferenceSummary,
  compactResponse,
  firstLineRange,
  inferSyntheticNodeKind,
  nodeLocation,
  patternEvidence,
  referenceEvidence,
  relationshipEvidence,
  relationshipFiles,
  searchEvidence,
  strongAnchorEvidence,
  symbolEvidence
} from "./queryEvidence";
import {
  anchorFlowEdges,
  assessFlowCoverage,
  buildFlowCoverageCaveats,
  composeFlowEdges,
  exactIdentifierAnchors,
  hasIncompleteBrowserQueryState,
  isCommonExternalSymbol,
  isLowValueRelationshipEdge,
  isRelevantFlowEdge,
  propertyNamesFromFlow,
  promoteJavaScriptInteractionPath,
  rankFlowEdges,
  relationshipMatchesCrossContextAnchor,
  semanticFlowAnchors
} from "./queryFlow";
import {
  buildArchitectureHotspots,
  buildPrecomputedArchitectureHotspots
} from "./queryHotspots";
import { looksLikeFileQuery } from "./queryPath";
import { buildPlanChangeResponse } from "./queryPlanning";
import { buildReferenceCoverageCaveats, referenceNextQueries } from "./queryReferences";
import { enrichRecommendationsWithNodeGuidance } from "./queryRecommendationGuidance";
import { strongAnchorRoleBoost } from "./queryScoring";
import { buildRecommendationNodeTagEvidence, NodeTagEvidence } from "./queryNodeTags";
import {
  isWeakMultiTermSearch,
  rankSearchRowsForAgent,
  relationshipTermScore,
  scorePattern
} from "./querySearch";
import {
  buildSharedContractBoundaryRecords,
  NodeMemberEvidenceRow,
  NodeProjectEvidenceRow,
  NodeRoleEvidenceRow,
  sharedContractCandidateNodeIds,
  SymbolEvidenceRow
} from "./querySharedContracts";
import {
  conceptMatchesText,
  domainFlowTerms,
  queryCoreTerms,
  queryTerms,
  queryVariants,
  queryWantsBrowserQueryState,
  queryWantsCompositionRoot,
  queryWantsJavaScriptInteraction
} from "./queryText";
import type {
  QueryContext,
  QueryContextAmbiguity,
  QueryResponse,
  QueryServiceOptions,
  RelationshipQueryOptions
} from "./queryTypes";
import {
  booleanValue,
  mergeSearchRows,
  numberValue,
  placeholders,
  stringValue,
  sumCounts,
  uniqueById,
  uniqueStrings
} from "./queryUtils";
import {
  addRecommendationReason,
  assessExistingCapabilityEvidence,
  buildPatternFitEvidence,
  buildWhereToAddCaveats,
  calculateWhereToAddConfidence,
  FileRecommendation,
  includeViewSurfaceRecommendation,
  rankFileRecommendations,
  sortRecommendationReasons
} from "./whereToAddRanking";
import { findValueLifecycleRelationships } from "./queryValueLifecycle";

export type { QueryResponse, QueryServiceOptions, RelationshipQueryOptions } from "./queryTypes";

export async function withQueryService<T>(workspaceRoot: string, callback: (service: QueryService) => T | Promise<T>, options: QueryServiceOptions = {}): Promise<T> {
  const indexPath = path.join(workspaceRoot, ".kraken-atlas", "index.sqlite");
  const database = await openSqliteIndex(indexPath);

  try {
    return await callback(new QueryService(database, options));
  } finally {
    database.close();
  }
}

export class QueryService {
  private readonly queryContext?: QueryContext;
  private readonly queryContextAmbiguity?: QueryContextAmbiguity;

  public constructor(private readonly database: Database, options: QueryServiceOptions = {}) {
    const resolution = this.resolveQueryContext(options.projectContext);
    this.queryContext = resolution.context;
    this.queryContextAmbiguity = resolution.ambiguity;
  }

  public getProject(query = "project"): QueryResponse {
    const ambiguity = this.ambiguousContextResponse("project", query);
    if (ambiguity) {
      return ambiguity;
    }

    const rows = this.execJson("SELECT json FROM metadata WHERE key = 'project';");
    const project = rows[0] ?? null;
    const projectFiles = this.execRows(
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

  public findSymbols(query: string): QueryResponse {
    const ambiguity = this.ambiguousContextResponse("symbol", query);
    if (ambiguity) {
      return ambiguity;
    }

    const like = `%${query}%`;
    const context = this.symbolContextWhere("AND");
    const rows = this.execJson(
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

  public findReferences(query: string): QueryResponse {
    const ambiguity = this.ambiguousContextResponse("references", query);
    if (ambiguity) {
      return ambiguity;
    }

    const like = `%${query}%`;
    const context = this.referenceContextWhere("AND");
    const rows = this.execJson(
      `SELECT json FROM references_map
       WHERE (symbol_name LIKE ? OR resolved_symbol_id LIKE ? OR file LIKE ?)
       ${context.sql}
       ORDER BY file, start_line
       LIMIT 20;`,
      [like, like, like, ...context.params]
    );
    const symbolIds = uniqueStrings([...this.findSymbolIds(query), ...this.findGlobalExactSymbolIds(query)]);
    const relatedRelationships = this.findReferenceRelationships(query, symbolIds);
    const sourceReferenceKinds = this.countReferenceMatches(query);
    const relationshipTypes = this.countReferenceRelationships(query, symbolIds);
    const sourceReferenceCount = sumCounts(sourceReferenceKinds);
    const connectedRelationshipCount = sumCounts(relationshipTypes);
    const hasSemanticEvidence = sourceReferenceCount > 0 || connectedRelationshipCount > 0;
    const fallbackRows = hasSemanticEvidence ? [] : this.findReferenceFallbackRows(query, 6);
    const caveats = hasSemanticEvidence ? [] : buildReferenceCoverageCaveats(query, fallbackRows);
    const referenceSummary = hasSemanticEvidence ? buildReferenceSummary(sourceReferenceKinds, relationshipTypes, symbolIds) : undefined;
    const evidence = hasSemanticEvidence
      ? [referenceSummary!, ...relatedRelationships.map(relationshipEvidence), ...rows.map(referenceEvidence)]
      : [...caveats, ...fallbackRows.map(searchEvidence)];
    const fallbackFiles = uniqueStrings(fallbackRows.map((row) => stringValue(row.path)).filter(Boolean));
    const symbolFiles = symbolIds.length ? this.execRows(
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

  private findReferenceRelationships(query: string, symbolIds: string[]): Array<Record<string, unknown>> {
    if (symbolIds.length === 0) {
      return [];
    }

    const like = `%${query}%`;
    return this.withEndpointLocations(this.execJson(
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

  private countReferenceMatches(query: string): Record<string, number> {
    const like = `%${query}%`;
    const context = this.referenceContextWhere("AND");
    const rows = this.execRows(
      `SELECT context, COUNT(*) AS count FROM references_map
       WHERE (symbol_name LIKE ? OR resolved_symbol_id LIKE ? OR file LIKE ?)
       ${context.sql}
       GROUP BY context;`,
      [like, like, like, ...context.params]
    );
    return Object.fromEntries(rows.map((row) => [stringValue(row.context) || "unknown", numberValue(row.count)]));
  }

  private countReferenceRelationships(query: string, symbolIds: string[]): Record<string, number> {
    if (symbolIds.length === 0) {
      return {};
    }

    const like = `%${query}%`;
    const rows = this.execRows(
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

  private findGlobalExactSymbolIds(query: string): string[] {
    if (!this.queryContext || !query.trim()) {
      return [];
    }

    return this.execRows(
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

  public findRelationships(query: string, options: RelationshipQueryOptions = {}): QueryResponse {
    const ambiguity = this.ambiguousContextResponse("relationships", query);
    if (ambiguity) {
      return ambiguity;
    }

    const scopedSymbolIds = this.findSymbolIds(query);
    const globalExactSymbolIds = this.findGlobalExactSymbolIds(query);
    const symbolIds = uniqueStrings([...scopedSymbolIds, ...globalExactSymbolIds]);
    const terms = [query, ...symbolIds];
    const context = this.relationshipContextWhere("AND");
    const edgeTypes = uniqueStrings((options.edgeTypes ?? []).map((edgeType) => edgeType.trim().toUpperCase()).filter(Boolean));
    const edgeFilter = edgeTypes.length ? `AND type IN (${placeholders(edgeTypes.length)})` : "";
    const limit = Math.max(1, Math.min(options.limit ?? 30, 100));
    let rows = this.execJson(
      `SELECT json FROM relationships
       WHERE (from_id IN (${placeholders(terms.length)})
          OR to_id IN (${placeholders(terms.length)})
          OR from_id LIKE ?
          OR to_id LIKE ?
          OR file LIKE ?
          OR type LIKE ?
          OR json LIKE ?)
       ${edgeFilter}
       ${context.sql}
       ORDER BY
         CASE
           WHEN json LIKE ? THEN 0
           WHEN from_id LIKE ? OR to_id LIKE ? THEN 1
           WHEN file LIKE ? THEN 2
           ELSE 3
         END,
         CASE type
           WHEN 'MAPS_ROUTE' THEN 0
           WHEN 'REQUIRES_AUTH' THEN 1
           WHEN 'WRITES_QUERY_STRING' THEN 2
           WHEN 'READS_QUERY_STRING' THEN 3
           WHEN 'WRITES_BROWSER_HISTORY' THEN 4
           WHEN 'POSTS_TO' THEN 5
           WHEN 'WRITES' THEN 6
           WHEN 'QUERIES' THEN 7
           WHEN 'CALLS_REPOSITORY' THEN 8
           WHEN 'CALLS' THEN 9
           WHEN 'IMPLEMENTS' THEN 10
           WHEN 'INJECTS' THEN 11
           WHEN 'WRITES_FIELD' THEN 12
           WHEN 'BINDS_MODEL_PROPERTY' THEN 13
           WHEN 'MAPS_PROPERTY' THEN 14
           WHEN 'SELECTS_ELEMENT' THEN 15
           WHEN 'INVOKES_VIEW_COMPONENT' THEN 16
           WHEN 'RENDERS_VIEW' THEN 17
           WHEN 'CONTAINS' THEN 99
           ELSE 50
         END,
         file,
         start_line
       LIMIT ${limit};`,
      [...terms, ...terms, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, ...edgeTypes, ...context.params, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`]
    );

    if (this.queryContext && globalExactSymbolIds.length) {
      const connectedRows = this.execJson(
        `SELECT json FROM relationships
         WHERE (from_id IN (${placeholders(globalExactSymbolIds.length)}) OR to_id IN (${placeholders(globalExactSymbolIds.length)}))
         ${edgeFilter}
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
        [...globalExactSymbolIds, ...globalExactSymbolIds, ...edgeTypes]
      );
      rows = uniqueById([...connectedRows, ...rows]).slice(0, limit);
    }

    const valueLifecycleRows = findValueLifecycleRelationships({
      query,
      symbolIds,
      edgeTypes,
      limit,
      relationshipContext: this.relationshipContextWhere("AND"),
      readJson: (sql, params = []) => this.execJson(sql, params)
    });
    rows = uniqueById([...valueLifecycleRows, ...rows]).slice(0, limit);

    const filteredRows = this.withEndpointLocations(filterRelationshipRowsForQuery(rows, query));
    const omittedCount = Math.max(0, rows.length - filteredRows.length);
    const expandedRows = this.queryContext ? filteredRows.filter((row) => !this.relationshipMatchesContext(row)) : [];
    const expandedTypes = countByValues(expandedRows.map((row) => stringValue(row.type)));
    const datatypeProjectUsage = this.buildDatatypeProjectUsage(query, symbolIds);
    const datatypeRoleSummary = this.buildNodeRoleSummary(symbolIds);
    const datatypeTagSummary = this.buildNodeTagSummary(symbolIds);
    const datatypeMemberSummary = this.buildNodeMemberSummary(symbolIds);

    return compactResponse({
      query,
      answer: filteredRows.length
        ? `Found ${filteredRows.length} relationship edge(s)${edgeTypes.length ? ` filtered to ${edgeTypes.join(", ")}` : ""}.`
        : "No relationships matched.",
      confidence: filteredRows.length ? 0.9 : 0,
      evidence: [
        ...(datatypeProjectUsage ? [datatypeProjectUsage] : []),
        ...(datatypeRoleSummary ? [datatypeRoleSummary] : []),
        ...(datatypeTagSummary ? [datatypeTagSummary] : []),
        ...(datatypeMemberSummary ? [datatypeMemberSummary] : []),
        ...(expandedRows.length ? [{
          recordType: "contextExpansion",
          context: this.queryContext?.name,
          edgeTypes: expandedTypes,
          message: `Included ${expandedRows.length} directly connected edge(s) outside seed context ${this.queryContext?.name}: ${formatCountMap(expandedTypes)}.`
        }] : []),
        ...(edgeTypes.length ? [{
          recordType: "relationshipFilter",
          edgeTypes,
          message: `Showing only relationship types: ${edgeTypes.join(", ")}.`
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
      symbols: uniqueStrings(filteredRows.flatMap((row) => [stringValue(row.from), stringValue(row.to)]).filter((value) => value.startsWith("symbol:"))),
      files: relationshipFiles(filteredRows),
      nextQueries: relationshipNextQueries(filteredRows)
    });
  }

  private buildNodeMemberSummary(symbolIds: string[]): Record<string, unknown> | undefined {
    if (symbolIds.length === 0) {
      return undefined;
    }

    try {
      const rows = this.execRows(
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

      const memberCounts = this.execRows(
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

  private buildNodeRoleSummary(symbolIds: string[]): Record<string, unknown> | undefined {
    if (symbolIds.length === 0) {
      return undefined;
    }

    try {
      const rows = this.execRows(
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

  private buildNodeTagSummary(symbolIds: string[]): Record<string, unknown> | undefined {
    if (symbolIds.length === 0) {
      return undefined;
    }

    try {
      const rows = this.execRows(
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

  private buildDatatypeProjectUsage(query: string, symbolIds: string[]): Record<string, unknown> | undefined {
    if (symbolIds.length === 0) {
      return undefined;
    }

    const symbols = this.execJson(
      `SELECT json FROM symbols WHERE id IN (${placeholders(symbolIds.length)}) LIMIT 80;`,
      symbolIds
    );
    const csharpSymbols = symbols.filter((symbol) => stringValue(symbol.language) === "csharp");
    if (csharpSymbols.length === 0) {
      return undefined;
    }

    const enrichedProjectUsage = this.readNodeProjectUsage(symbolIds);
    if (enrichedProjectUsage) {
      return enrichedProjectUsage;
    }

    const declarationProjects = countByValues(csharpSymbols.map((symbol) => inferProjectNameFromFile(stringValue(symbol.file)) ?? "").filter(Boolean));
    const referenceRows = this.execRows(
      `SELECT file FROM references_map
       WHERE resolved_symbol_id IN (${placeholders(symbolIds.length)})
          OR resolved_symbol_id LIKE ?
          OR symbol_name LIKE ?
       LIMIT 500;`,
      [...symbolIds, `%${query}%`, `%${query}%`]
    );
    const relationshipRows = this.execRows(
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

  private readNodeProjectUsage(symbolIds: string[]): Record<string, unknown> | undefined {
    try {
      const rows = this.execRows(
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

  public findPatterns(query: string): QueryResponse {
    const ambiguity = this.ambiguousContextResponse("pattern", query);
    if (ambiguity) {
      return ambiguity;
    }

    const like = `%${query}%`;
    const rows = this.execJson(
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
      nextQueries: rows.flatMap((row) => (row.instances as any[] | undefined)?.slice(0, 3).flatMap((instance) => (instance.symbols ?? []).map((symbol: string) => `kraken-atlas query relationships "${symbol}"`)) ?? []).slice(0, 6)
    });
  }

  public findPatternMap(query = "pattern-map"): QueryResponse {
    const ambiguity = this.ambiguousContextResponse("pattern-map", query);
    if (ambiguity) {
      return ambiguity;
    }

    const rows = this.scopePatternsToContext(this.execJson(
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

  public findArchitectureHotspots(query = "hotspots"): QueryResponse {
    const ambiguity = this.ambiguousContextResponse("hotspots", query);
    if (ambiguity) {
      return ambiguity;
    }

    const terms = queryTerms(query).filter((term) => !["hotspot", "hotspots", "architecture", "central", "shared"].includes(term));
    const precomputedHotspots = this.findPrecomputedArchitectureHotspots(terms);
    const activeRows = precomputedHotspots ? [] : this.findHotspotRelationshipRows(terms);
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

  private findHotspotRelationshipRows(terms: string[]): Array<Record<string, unknown>> {
    const context = this.relationshipContextWhere("WHERE");
    const rows = this.execJson(
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

  private findPrecomputedArchitectureHotspots(terms: string[]): Array<Record<string, unknown>> | undefined {
    try {
      const rows = this.readUsageHotspotRows(terms);
      const activeRows = rows.length || !terms.length ? rows : this.readUsageHotspotRows([]);
      if (activeRows.length === 0) {
        return [];
      }

      const files = activeRows.map((row) => stringValue(row.file));
      const typesByFile = this.readTopRelationshipTypesForFiles(files);
      return buildPrecomputedArchitectureHotspots(activeRows, typesByFile);
    } catch {
      return undefined;
    }
  }

  private readUsageHotspotRows(terms: string[]): Array<Record<string, unknown>> {
    const contextSql = this.queryContext ? "AND f.path LIKE ?" : "";
    const contextParams = this.queryContext ? [`${this.queryContext.filePrefix}%`] : [];
    const termSql = terms.length ? `AND (${terms.map(() => "f.path LIKE ?").join(" OR ")})` : "";
    const termParams = terms.map((term) => `%${term}%`);
    return this.execRows(
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

  private readTopRelationshipTypesForFiles(files: string[]): Map<string, Array<Record<string, unknown>>> {
    if (files.length === 0) {
      return new Map();
    }

    const rows = this.execRows(
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

  public findOrphans(query = ""): QueryResponse {
    return this.findCodeHealthFindings("orphan-callable", query);
  }

  public findDuplicates(query = ""): QueryResponse {
    return this.findCodeHealthFindings("duplicate-code-block", query);
  }

  public findDrift(query = ""): QueryResponse {
    return this.findCodeHealthFindings("pattern-drift", query);
  }

  private findCodeHealthFindings(kind: "orphan-callable" | "duplicate-code-block" | "pattern-drift", query: string): QueryResponse {
    const queryType = kind === "orphan-callable" ? "orphans" : kind === "duplicate-code-block" ? "duplicates" : "drift";
    const ambiguity = this.ambiguousContextResponse(queryType, query || "all");
    if (ambiguity) {
      return ambiguity;
    }

    const term = query.trim();
    const queryFilter = term ? "AND (title LIKE ? OR json LIKE ? OR file LIKE ?)" : "";
    const params = term ? [`%${term}%`, `%${term}%`, `%${term}%`] : [];
    const candidateRows = this.execJson(
      `SELECT json FROM findings
       WHERE kind = ?
       ${queryFilter}
       ORDER BY confidence DESC, file, start_line
       LIMIT 1000;`,
      [kind, ...params]
    );
    const rows = candidateRows
      .map((row) => this.scopeFindingToContext(row))
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

  public findFlow(query: string): QueryResponse {
    const ambiguity = this.ambiguousContextResponse("flow", query);
    if (ambiguity) {
      return ambiguity;
    }

    const semanticAnchors = semanticFlowAnchors(query);
    const exactAnchors = uniqueStrings([...exactIdentifierAnchors(query), ...semanticAnchors]);
    const discoveredSemanticAnchorEdges = this.findSemanticAnchorEdges(semanticAnchors);
    const javascriptIntent = queryWantsJavaScriptInteraction(query.toLowerCase());
    const discoveredStrongAnchors = this.findStrongSymbolAnchors(query);
    const javascriptStrongAnchors = uniqueById([
      ...discoveredStrongAnchors.filter((anchor) => isJavaScriptAnchor(anchor)),
      ...this.findJavaScriptInteractionAnchors(query)
    ]);
    const preferJavaScript = javascriptIntent && javascriptStrongAnchors.length > 0;
    const semanticAnchorEdges = preferJavaScript ? [] : discoveredSemanticAnchorEdges;
    const semanticFiles = new Set(semanticAnchorEdges.map((edge) => stringValue(edge.file)).filter(Boolean));
    const preferredStrongAnchors = preferJavaScript ? javascriptStrongAnchors : discoveredStrongAnchors;
    const strongAnchors = preferJavaScript
      ? preferredStrongAnchors
      : semanticFiles.size
        ? preferredStrongAnchors.filter((anchor) => semanticFiles.has(stringValue(anchor.file)))
        : preferredStrongAnchors;
    const discoveredFlowSeeds = this.findFlowSeeds(query);
    const flowSeeds = preferJavaScript ? [] : discoveredFlowSeeds;
    const seeds = uniqueStrings([
      ...semanticAnchorEdges.flatMap((edge) => [stringValue(edge.from), stringValue(edge.to)]),
      ...strongAnchors.map((anchor) => stringValue(anchor.id)),
      ...flowSeeds
    ]).slice(0, 40);
    const crossContextAnchors = new Set(strongAnchors
      .filter((anchor) => !this.matchesContextFile(stringValue(anchor.file)))
      .map((anchor) => stringValue(anchor.id)));
    const edges = uniqueById([
      ...semanticAnchorEdges,
      ...this.traverseEdges(seeds, preferJavaScript ? 5 : 3, preferJavaScript ? 300 : 100, crossContextAnchors)
    ]);
    const terms = queryTerms(query);
    const coreFlowCandidates = rankFlowEdges(edges).filter((edge) => isRelevantFlowEdge(edge, terms, seeds));
    const interactionCore = preferJavaScript ? promoteJavaScriptInteractionPath(coreFlowCandidates) : [];
    const coreFlow = uniqueById([...interactionCore, ...anchorFlowEdges(coreFlowCandidates, exactAnchors)]).slice(0, 20);
    const layeredContext = preferJavaScript ? [] : this.findLayeredFlowContext(query, coreFlow, terms);
    const configurationContext = preferJavaScript ? [] : this.findConfigurationContext(coreFlow, terms);
    const propertyBridgeContext = preferJavaScript ? [] : this.findPropertyBridgeContext([...coreFlow, ...layeredContext]);
    const requestedPropertyContext = preferJavaScript ? [] : this.findRequestedPropertyContext(exactAnchors);
    const dataFlowContext = preferJavaScript ? [] : this.findDataFlowContext([...coreFlow, ...propertyBridgeContext], terms);
    const projectReferences = preferJavaScript ? [] : this.findProjectReferenceContext(coreFlow);
    const flowEdges = composeFlowEdges(query, [
      ...coreFlow,
      ...requestedPropertyContext,
      ...layeredContext,
      ...propertyBridgeContext,
      ...configurationContext,
      ...dataFlowContext,
      ...projectReferences
    ], exactAnchors);
    const flow = this.withEndpointLocations(flowEdges).map(relationshipEvidence);

    if (flow.length === 0) {
      const search = this.search(query);
      return {
        ...search,
        answer: `No connected feature flow found for "${query}". Returning search hits instead.`
      };
    }

    const coverage = assessFlowCoverage(query, flow, exactAnchors);

    return compactResponse({
      query,
      answer: `${coverage.confidence < 0.6 ? "Partial feature-flow" : "Feature-flow"} slice for "${query}" with ${flow.length} connected edge(s).`,
      confidence: coverage.confidence,
      evidence: [
        coverage.evidence,
        ...coverage.caveats,
        ...buildFlowCoverageCaveats(query, flow, exactAnchors),
        ...strongAnchors.map(strongAnchorEvidence),
        ...flow
      ],
      flow,
      relationships: flow,
      symbols: uniqueStrings(flow.flatMap((edge) => [stringValue(edge.from), stringValue(edge.to)]).filter((value) => value.startsWith("symbol:"))),
      files: relationshipFiles(flow),
      nextQueries: uniqueStrings([
        ...strongAnchors.map((anchor) => `kraken-atlas query relationships "${stringValue(anchor.id)}"`),
        ...relationshipNextQueries(flow)
      ]).slice(0, 10)
    });
  }

  public search(query: string): QueryResponse {
    const ambiguity = this.ambiguousContextResponse("search", query);
    if (ambiguity) {
      return ambiguity;
    }

    const exactFileResponse = this.exactFileSearch(query);
    if (exactFileResponse) {
      return exactFileResponse;
    }

    const candidateRows = rankSearchRowsForAgent(query, this.findSearchRowsByTerms(query, 80));
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

  private exactFileSearch(query: string): QueryResponse | undefined {
    const normalized = query.trim().replace(/\\/g, "/");
    if (!looksLikeFileQuery(normalized)) {
      return undefined;
    }

    const context = this.fileContextWhere("AND");
    const rows = this.execRows(
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

  public whereToAdd(query: string): QueryResponse {
    const ambiguity = this.ambiguousContextResponse("where-to-add", query);
    if (ambiguity) {
      return ambiguity;
    }

    const searchRows = mergeSearchRows(this.findSearchRowsByTerms(query, 60), this.findRankedSearchRowsByTerms(query, 20));
    const flow = this.findFlow(query);
    const patterns = this.scopePatternsToContext(this.findRelevantPatterns(query));
    const strongAnchors = flow.evidence.filter((item) => item.recordType === "strongAnchor");
    const rankedRecommendations = enrichRecommendationsWithNodeGuidance(
      query,
      this.enrichRecommendationsWithNodeTags(
        query,
        this.enrichRecommendationsWithUsageSummary(
          query,
          rankFileRecommendations(query, searchRows, flow.relationships, patterns, strongAnchors)
        )
      ),
      (sql, params = []) => this.execRows(sql, params),
      (sql, params = []) => this.execJson(sql, params)
    );
    const browserStateFiles = new Set(flow.relationships
      .filter((relationship) => ["READS_QUERY_STRING", "WRITES_QUERY_STRING", "WRITES_BROWSER_HISTORY"].includes(stringValue(relationship.type)))
      .map((relationship) => stringValue(relationship.file))
      .filter(Boolean));
    const candidateRecommendations = queryWantsBrowserQueryState(query.toLowerCase()) && browserStateFiles.size
      ? rankedRecommendations.filter((recommendation) => browserStateFiles.has(recommendation.file))
      : rankedRecommendations;
    const recommendations = includeViewSurfaceRecommendation(query, candidateRecommendations.slice(0, 8), candidateRecommendations);
    const capabilityAssessment = assessExistingCapabilityEvidence(query, flow.relationships);
    const patternFit = buildPatternFitEvidence(patterns, recommendations);
    const sharedContractBoundaries = this.buildSharedContractBoundaryEvidence(query, recommendations, flow.relationships, strongAnchors);
    const contextPruning = this.pruneRelationshipsForContext(query, recommendations.map((recommendation) => recommendation.file), recommendations, sharedContractBoundaries, flow.relationships.slice(0, 12));
    const caveats = buildWhereToAddCaveats(query, recommendations, flow.relationships);
    const files = recommendations.map((recommendation) => recommendation.file);
    const confidence = Math.min(calculateWhereToAddConfidence(query, recommendations, flow.relationships), flow.confidence);

    return compactResponse({
      query,
      answer: recommendations.length
        ? `${capabilityAssessment.answerPrefix}Likely edit locations for "${query}" ranked by text matches, feature-flow edges, and detected project patterns.`
        : `No strong edit-location recommendation found for "${query}". Start with search and project queries.`,
      confidence,
      evidence: [...recommendations, ...sharedContractBoundaries, ...contextPruning.evidence, ...capabilityAssessment.evidence, ...patternFit, ...strongAnchors, ...patterns.slice(0, 4).map(patternEvidence), ...caveats],
      files,
      symbols: uniqueStrings(flow.symbols),
      relationships: contextPruning.relationships,
      patterns: patterns.slice(0, 5).map(patternEvidence),
      nextQueries: uniqueStrings([
        ...files.slice(0, 5).map((file) => `kraken-atlas query relationships "${file}"`),
        ...flow.nextQueries,
        ...patterns.flatMap((pattern) => (pattern.instances as any[] | undefined)?.slice(0, 2).flatMap((instance) => (instance.symbols ?? []).map((symbol: string) => `kraken-atlas query relationships "${symbol}"`)) ?? [])
      ]).slice(0, 8)
    });
  }

  private pruneRelationshipsForContext(
    query: string,
    files: string[],
    recommendations: FileRecommendation[],
    boundaries: Array<Record<string, unknown>>,
    relationships: Array<Record<string, unknown>>
  ): { relationships: Array<Record<string, unknown>>; evidence: Array<Record<string, unknown>> } {
    const nodeIds = contextPruningNodeIds(relationships, boundaries);
    if (nodeIds.length === 0) {
      return { relationships, evidence: [] };
    }

    try {
      const tagRows: ContextTagRow[] = this.execRows(
        `SELECT node_id, tag
         FROM node_tags
         WHERE node_id IN (${placeholders(nodeIds.length)})
         ORDER BY node_id, tag;`,
        nodeIds
      ).map((row) => ({
        nodeId: stringValue(row.node_id),
        tag: stringValue(row.tag)
      }));
      const projectRows: ContextProjectRow[] = this.execRows(
        `SELECT node_id, project
         FROM node_projects
         WHERE node_id IN (${placeholders(nodeIds.length)})
         ORDER BY node_id, project;`,
        nodeIds
      ).map((row) => ({
        nodeId: stringValue(row.node_id),
        project: stringValue(row.project)
      }));
      return buildContextPruningResult(query, files, recommendations, boundaries, relationships, tagRows, projectRows);
    } catch {
      return { relationships, evidence: [] };
    }
  }

  private buildSharedContractBoundaryEvidence(
    query: string,
    recommendations: FileRecommendation[],
    relationships: Array<Record<string, unknown>>,
    strongAnchors: Array<Record<string, unknown>>
  ): Array<Record<string, unknown>> {
    const nodeIds = sharedContractCandidateNodeIds(recommendations, relationships, strongAnchors);
    if (nodeIds.length === 0) {
      return [];
    }

    try {
      const roleRows: NodeRoleEvidenceRow[] = this.execRows(
        `SELECT node_id, role, MAX(confidence) AS confidence
         FROM node_roles
         WHERE node_id IN (${placeholders(nodeIds.length)})
         GROUP BY node_id, role;`,
        nodeIds
      ).map((row) => ({
        nodeId: stringValue(row.node_id),
        role: stringValue(row.role),
        confidence: numberValue(row.confidence)
      }));
      const projectRows: NodeProjectEvidenceRow[] = this.execRows(
        `SELECT node_id, project, role, SUM(evidence_count) AS evidence_count
         FROM node_projects
         WHERE node_id IN (${placeholders(nodeIds.length)})
         GROUP BY node_id, project, role;`,
        nodeIds
      ).map((row) => ({
        nodeId: stringValue(row.node_id),
        project: stringValue(row.project),
        role: stringValue(row.role),
        evidenceCount: numberValue(row.evidence_count)
      }));
      const memberRows: NodeMemberEvidenceRow[] = this.execRows(
        `SELECT node_id, member_name
         FROM node_members
         WHERE node_id IN (${placeholders(nodeIds.length)})
         ORDER BY node_id, member_name
         LIMIT 120;`,
        nodeIds
      ).map((row) => ({
        nodeId: stringValue(row.node_id),
        name: stringValue(row.member_name)
      }));
      const symbolRows: SymbolEvidenceRow[] = this.execJson(
        `SELECT json FROM symbols WHERE id IN (${placeholders(nodeIds.length)}) LIMIT 120;`,
        nodeIds
      ).map((row) => ({
        id: stringValue(row.id),
        name: stringValue(row.name),
        file: stringValue(row.file),
        kind: stringValue(row.kind)
      }));

      return buildSharedContractBoundaryRecords(query, nodeIds, roleRows, projectRows, memberRows, symbolRows);
    } catch {
      return [];
    }
  }

  private enrichRecommendationsWithUsageSummary(query: string, recommendations: FileRecommendation[]): FileRecommendation[] {
    if (recommendations.length === 0) {
      return recommendations;
    }

    try {
      const nodeIds = recommendations.map((recommendation) => `file:${recommendation.file}`);
      const rows = this.execRows(
        `SELECT node_id,
                incoming_count,
                outgoing_count,
                reference_count,
                project_count,
                hotspot_score,
                edit_likelihood,
                avoid_initially
         FROM node_usage_summary
         WHERE node_id IN (${placeholders(nodeIds.length)});`,
        nodeIds
      );
      const byFile = new Map(rows.map((row) => [stringValue(row.node_id).replace(/^file:/u, ""), row]));
      const lowerQuery = query.toLowerCase();
      const queryAcceptsCentralFiles = queryWantsCompositionRoot(lowerQuery)
        || /\b(shared|startup|routing|middleware|configuration|config|options|dependency injection|di)\b/iu.test(lowerQuery);

      for (const recommendation of recommendations) {
        const row = byFile.get(recommendation.file);
        if (!row) {
          continue;
        }

        const hotspotScore = numberValue(row.hotspot_score);
        const editLikelihood = numberValue(row.edit_likelihood);
        const avoidInitially = booleanValue(row.avoid_initially) === true;
        recommendation.usageSummary = {
          incomingCount: numberValue(row.incoming_count),
          outgoingCount: numberValue(row.outgoing_count),
          referenceCount: numberValue(row.reference_count),
          projectCount: numberValue(row.project_count),
          hotspotScore,
          editLikelihood,
          avoidInitially
        };

        if (avoidInitially && !queryAcceptsCentralFiles) {
          recommendation.score -= Math.min(8, 3 + hotspotScore / 10);
          addRecommendationReason(recommendation, "Usage summary marks this as central/shared; avoid initially unless changing cross-cutting behavior.");
        } else if (editLikelihood >= 0.5) {
          recommendation.score += Math.min(3, editLikelihood * 3);
          addRecommendationReason(recommendation, "Usage summary suggests this is a plausible edit surface.");
        }

        sortRecommendationReasons(recommendation);
      }

      return recommendations
        .filter((recommendation) => recommendation.score > 0)
        .sort((left, right) => Number(Boolean(right.strongAnchor)) - Number(Boolean(left.strongAnchor)) || right.score - left.score || left.file.localeCompare(right.file));
    } catch {
      return recommendations;
    }
  }

  private enrichRecommendationsWithNodeTags(query: string, recommendations: FileRecommendation[]): FileRecommendation[] {
    if (recommendations.length === 0) {
      return recommendations;
    }

    try {
      const nodeIds = recommendations.map((recommendation) => `file:${recommendation.file}`);
      const rows = this.execRows(
        `SELECT node_id,
                tag,
                MAX(confidence) AS confidence,
                GROUP_CONCAT(DISTINCT source) AS sources
         FROM node_tags
         WHERE node_id IN (${placeholders(nodeIds.length)})
         GROUP BY node_id, tag
         ORDER BY confidence DESC, tag;`,
        nodeIds
      );
      const tagsByFile = new Map<string, NodeTagEvidence[]>();
      for (const row of rows) {
        const file = stringValue(row.node_id).replace(/^file:/u, "");
        const tag = stringValue(row.tag);
        if (!file || !tag) {
          continue;
        }

        const entries = tagsByFile.get(file) ?? [];
        entries.push({
          tag,
          confidence: numberValue(row.confidence),
          sources: stringValue(row.sources).split(",").filter(Boolean)
        });
        tagsByFile.set(file, entries);
      }

      for (const recommendation of recommendations) {
        const tagEvidence = buildRecommendationNodeTagEvidence(query, tagsByFile.get(recommendation.file) ?? []);
        if (tagEvidence.nodeTags.length === 0) {
          continue;
        }

        recommendation.nodeTags = tagEvidence.nodeTags;
        recommendation.matchedTags = tagEvidence.matchedTags;
        recommendation.matchedTerms = uniqueStrings([...recommendation.matchedTerms, ...tagEvidence.matchedTerms]).slice(0, 8);
        if (tagEvidence.scoreBoost > 0) {
          recommendation.score += tagEvidence.scoreBoost;
        }
        if (tagEvidence.reason) {
          addRecommendationReason(recommendation, tagEvidence.reason);
        }
        sortRecommendationReasons(recommendation);
      }

      return recommendations
        .filter((recommendation) => recommendation.score > 0)
        .sort((left, right) => Number(Boolean(right.strongAnchor)) - Number(Boolean(left.strongAnchor)) || right.score - left.score || left.file.localeCompare(right.file));
    } catch {
      return recommendations;
    }
  }

  public planChange(query: string): QueryResponse {
    const ambiguity = this.ambiguousContextResponse("plan-change", query);
    if (ambiguity) {
      return ambiguity;
    }

    const where = this.whereToAdd(query);
    const hotspots = this.findArchitectureHotspots(query);
    const drift = this.findDrift(query);
    return buildPlanChangeResponse(
      query,
      where,
      hotspots,
      drift,
      (planQuery, files, fileRecommendations, sharedContractBoundaries, relationships) =>
        this.pruneRelationshipsForContext(planQuery, files, fileRecommendations, sharedContractBoundaries, relationships)
    );
  }

  private findSearchRowsByTerms(query: string, limit: number): Array<Record<string, unknown>> {
    const terms = queryTerms(query);
    if (terms.length === 0) {
      return [];
    }

    const clauses = terms.map(() => "(title LIKE ? OR body LIKE ? OR path LIKE ?)").join(" OR ");
    const params = terms.flatMap((term) => [`%${term}%`, `%${term}%`, `%${term}%`]);
    const context = this.searchContextWhere("AND");
    return this.execRows(
      `SELECT record_id, record_type, title, body, path FROM code_search
       WHERE (${clauses})
       ${context.sql}
       LIMIT ${limit};`,
      [...params, ...context.params]
    );
  }

  private findRankedSearchRowsByTerms(query: string, limit: number): Array<Record<string, unknown>> {
    const terms = queryTerms(query);
    if (terms.length === 0) {
      return [];
    }

    const clauses = terms.map(() => "(title LIKE ? OR body LIKE ? OR path LIKE ?)").join(" OR ");
    const params = terms.flatMap((term) => [`%${term}%`, `%${term}%`, `%${term}%`]);
    const context = this.searchContextWhere("AND");
    const poolLimit = Math.max(200, Math.min(limit * 10, 1000));
    const rows = this.execRows(
      `SELECT record_id, record_type, title, body, path FROM code_search
       WHERE (${clauses})
       ${context.sql}
       LIMIT ${poolLimit};`,
      [...params, ...context.params]
    );
    return rankSearchRowsForAgent(query, rows).slice(0, limit);
  }

  private findRelevantPatterns(query: string): Array<Record<string, unknown>> {
    const terms = queryTerms(query);
    const allPatterns = this.execJson(
      `SELECT json FROM patterns
       ORDER BY confidence DESC, frequency DESC
       LIMIT 30;`
    );

    return allPatterns
      .map((pattern) => ({ pattern, score: scorePattern(pattern, terms) }))
      .filter((entry) => entry.score > 0 || terms.length === 0)
      .sort((left, right) => right.score - left.score || numberValue(right.pattern.confidence) - numberValue(left.pattern.confidence))
      .map((entry) => entry.pattern)
      .slice(0, 8);
  }

  private findSymbolIds(query: string): string[] {
    const like = `%${query}%`;
    const context = this.symbolContextWhere("AND");
    const symbolIds = this.execRows(
      `SELECT id FROM symbols WHERE (id = ? OR name LIKE ? OR fully_qualified_name LIKE ?) ${context.sql} LIMIT 20;`,
      [query, like, like, ...context.params]
    ).map((row) => stringValue(row.id));

    return uniqueStrings([...symbolIds, ...this.findImplementationSymbolIds(symbolIds)]);
  }

  private findStrongSymbolAnchors(query: string): Array<Record<string, unknown>> {
    const concepts = queryCoreTerms(query);
    if (concepts.length === 0) {
      return [];
    }

    const terms = queryTerms(query);
    const clauses = terms.map(() => "(name LIKE ? OR fully_qualified_name LIKE ? OR file LIKE ?)").join(" OR ");
    const params = terms.flatMap((term) => [`%${term}%`, `%${term}%`, `%${term}%`]);
    const context = this.symbolContextWhere("AND");
    const scopedRows = this.execJson(
      `SELECT json FROM symbols
       WHERE (${clauses})
       ${context.sql}
       ORDER BY file, start_line
       LIMIT 400;`,
      [...params, ...context.params]
    );
    const crossContextRows = this.queryContext ? uniqueById(terms.flatMap((term) => this.execJson(
      `SELECT json FROM symbols
       WHERE name LIKE ? OR fully_qualified_name LIKE ? OR file LIKE ?
       ORDER BY file, start_line
       LIMIT 120;`,
      [`%${term}%`, `%${term}%`, `%${term}%`]
    ))).filter((row) => !this.matchesContextFile(stringValue(row.file))) : [];
    const rows = uniqueById([...scopedRows, ...crossContextRows]);

    return rows
      .map((row): Record<string, unknown> => {
        const name = stringValue(row.name).toLowerCase();
        const fullyQualifiedName = stringValue(row.fullyQualifiedName).toLowerCase();
        const file = stringValue(row.file).toLowerCase();
        const matchedConcepts = concepts.filter((concept) => conceptMatchesText(concept, `${name} ${fullyQualifiedName} ${file}`));
        const nameMatchedConcepts = concepts.filter((concept) => conceptMatchesText(concept, name));
        const nameMatches = nameMatchedConcepts.length;
        const kind = stringValue(row.kind);
        const kindBoost = ["method", "class", "interface", "function", "eventHandler"].includes(kind) ? 4 : 1;
        const crossContext = !this.matchesContextFile(stringValue(row.file));
        const score = matchedConcepts.length * 5 + nameMatches * 4 + kindBoost + strongAnchorRoleBoost(row) - (crossContext ? 1 : 0);
        return { ...row, matchedConcepts, nameMatchedConcepts, anchorScore: score, crossContext };
      })
      .filter((row) => {
        if (row.crossContext && concepts.length < 3) {
          return false;
        }
        const requiredMatches = row.crossContext ? 3 : Math.min(2, concepts.length);
        return (row.matchedConcepts as string[]).length >= requiredMatches && (row.nameMatchedConcepts as string[]).length >= 1;
      })
      .sort((left, right) => numberValue(right.anchorScore) - numberValue(left.anchorScore) || stringValue(left.file).localeCompare(stringValue(right.file)))
      .slice(0, 6);
  }

  private findJavaScriptInteractionAnchors(query: string): Array<Record<string, unknown>> {
    const concepts = queryCoreTerms(query);
    const terms = queryTerms(query);
    if (!concepts.length || !terms.length) {
      return [];
    }
    const clauses = terms.map(() => "(name LIKE ? OR fully_qualified_name LIKE ? OR file LIKE ?)").join(" OR ");
    const params = terms.flatMap((term) => [`%${term}%`, `%${term}%`, `%${term}%`]);
    const context = this.symbolContextWhere("AND");
    return this.execJson(
      `SELECT json FROM symbols
       WHERE language = 'javascript' AND (${clauses})
       ${context.sql}
       ORDER BY file, start_line
       LIMIT 400;`,
      [...params, ...context.params]
    ).map((row): Record<string, unknown> => {
      const name = stringValue(row.name).toLowerCase();
      const text = `${name} ${stringValue(row.fullyQualifiedName).toLowerCase()} ${stringValue(row.file).toLowerCase()}`;
      const matchedConcepts = concepts.filter((concept) => conceptMatchesText(concept, text));
      const nameMatchedConcepts = concepts.filter((concept) => conceptMatchesText(concept, name));
      const kind = stringValue(row.kind);
      return {
        ...row,
        matchedConcepts,
        nameMatchedConcepts,
        anchorScore: matchedConcepts.length * 3 + nameMatchedConcepts.length * 7 + (["method", "function"].includes(kind) ? 6 : 1),
        interactionKindRank: ["method", "function"].includes(kind) ? 0 : kind === "eventHandler" ? 1 : 2,
        crossContext: false
      };
    })
      .filter((row) => {
        const nameMatches = row.nameMatchedConcepts as string[];
        const kind = stringValue(row.kind);
        const hasDistinctiveMatch = nameMatches.some((term) => !["map", "search"].includes(term));
        return hasDistinctiveMatch && (["method", "function", "eventHandler"].includes(kind) || nameMatches.length >= 2);
      })
      .sort((left, right) => numberValue(left.interactionKindRank) - numberValue(right.interactionKindRank) || numberValue(right.anchorScore) - numberValue(left.anchorScore) || stringValue(left.file).localeCompare(stringValue(right.file)))
      .slice(0, 4);
  }

  private findSemanticAnchorEdges(anchors: string[]): Array<Record<string, unknown>> {
    if (anchors.length === 0) {
      return [];
    }

    const clauses = anchors.map(() => "(from_id LIKE ? OR to_id LIKE ? OR json LIKE ?)").join(" OR ");
    const params = anchors.flatMap((anchor) => [`%${anchor}%`, `%${anchor}%`, `%${anchor}%`]);
    const context = this.relationshipContextWhere("AND");
    return this.execJson(
      `SELECT json FROM relationships
       WHERE (${clauses})
       ${context.sql}
       ORDER BY
         CASE type
           WHEN 'WRITES_QUERY_STRING' THEN 0
           WHEN 'READS_QUERY_STRING' THEN 1
           WHEN 'WRITES_BROWSER_HISTORY' THEN 2
           ELSE 9
         END,
         file,
         start_line
       LIMIT 40;`,
      [...params, ...context.params]
    );
  }

  private findImplementationSymbolIds(symbolIds: string[]): string[] {
    const implementationIds: string[] = [];
    for (const symbolId of symbolIds) {
      const method = parseCSharpMethodSymbolId(symbolId);
      if (!method || !method.typeName.split(".").pop()?.startsWith("I")) {
        continue;
      }

      const implementers = this.execRows(
        `SELECT from_id FROM relationships WHERE type = 'IMPLEMENTS' AND to_id = ? LIMIT 20;`,
        [`symbol:csharp:${method.typeName}`]
      ).map((row) => stringValue(row.from_id));

      for (const implementer of implementers) {
        const implementationType = implementer.replace(/^symbol:csharp:/, "");
        implementationIds.push(`symbol:csharp:${implementationType}.${method.signature}`);
      }
    }

    return implementationIds;
  }

  private findFlowSeeds(query: string): string[] {
    const like = `%${query}%`;
    const variants = queryVariants(query);
    const symbolIds = this.findSymbolIds(query);
    const variantSearchRows = variants.flatMap((variant) => this.execRows(
      `SELECT record_id FROM code_search
       WHERE (title LIKE ? OR body LIKE ? OR path LIKE ?)
       ${this.searchContextWhere("AND").sql}
       LIMIT 20;`,
      [`%${variant}%`, `%${variant}%`, `%${variant}%`, ...this.searchContextWhere("AND").params]
    ).map((row) => stringValue(row.record_id)));
    const searchRows = uniqueStrings([
      ...variantSearchRows,
      ...this.execRows(
        `SELECT record_id FROM code_search
         WHERE (title LIKE ? OR body LIKE ? OR path LIKE ?)
         ${this.searchContextWhere("AND").sql}
         LIMIT 20;`,
        [like, like, like, ...this.searchContextWhere("AND").params]
      ).map((row) => stringValue(row.record_id)),
      ...this.findRankedSearchRowsByTerms(query, 30).map((row) => stringValue(row.record_id))
    ]);

    const exactEdgeRows = [
      ...variants.flatMap((variant) => this.execRows(
        `SELECT from_id, to_id FROM relationships
         WHERE (from_id LIKE ? OR to_id LIKE ? OR file LIKE ? OR json LIKE ?)
         ${this.relationshipContextWhere("AND").sql}
         LIMIT 20;`,
        [`%${variant}%`, `%${variant}%`, `%${variant}%`, `%${variant}%`, ...this.relationshipContextWhere("AND").params]
      )),
      ...this.execRows(
      `SELECT from_id, to_id FROM relationships
       WHERE (from_id LIKE ? OR to_id LIKE ? OR file LIKE ? OR json LIKE ?)
       ${this.relationshipContextWhere("AND").sql}
       LIMIT 20;`,
      [like, like, like, like, ...this.relationshipContextWhere("AND").params]
    )];
    const termEdgeRows = this.findRelationshipRowsByTerms(query, 30);
    const edgeRows = uniqueStrings([...exactEdgeRows, ...termEdgeRows].flatMap((row) => [stringValue(row.from_id), stringValue(row.to_id)]));

    const fallbackSeeds = this.queryContext ? [] : [...variants, query];
    return uniqueStrings([...edgeRows.slice(0, 6), ...searchRows, ...edgeRows.slice(6), ...symbolIds, ...fallbackSeeds]).filter(Boolean).slice(0, 40);
  }

  private findProjectReferenceContext(flow: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    const projectIds = this.inferProjectIds(flow);
    if (projectIds.length < 2) {
      return [];
    }

    return this.execJson(
      `SELECT json FROM relationships
       WHERE type = 'PROJECT_REFERENCES'
         AND (from_id IN (${placeholders(projectIds.length)}) OR to_id IN (${placeholders(projectIds.length)}))
       ORDER BY file, start_line
       LIMIT 8;`,
      [...projectIds, ...projectIds]
    ).filter((relationship) => {
      const from = stringValue(relationship.from);
      const to = stringValue(relationship.to);
      return projectIds.includes(from) && projectIds.includes(to);
    });
  }

  private withEndpointLocations(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    return rows.map((row) => ({
      ...row,
      fromLocation: this.resolveEndpointLocation(stringValue(row.from), row),
      toLocation: this.resolveEndpointLocation(stringValue(row.to), row)
    }));
  }

  private resolveEndpointLocation(endpointId: string, relationship: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!endpointId) {
      return undefined;
    }

    const symbol = this.execJson("SELECT json FROM symbols WHERE id = ? LIMIT 1;", [endpointId])[0];
    if (symbol) {
      return nodeLocation(endpointId, "symbol", stringValue(symbol.file), symbol.range, stringValue(symbol.kind), false);
    }

    if (endpointId.startsWith("file:")) {
      const file = endpointId.slice("file:".length);
      return nodeLocation(endpointId, "file", file, firstLineRange(), "file", true);
    }

    const file = stringValue(relationship.file);
    if (file) {
      return nodeLocation(endpointId, inferSyntheticNodeKind(endpointId), file, relationship.range, "relationship", true);
    }

    return {
      recordType: "nodeLocation",
      id: endpointId,
      nodeKind: inferSyntheticNodeKind(endpointId),
      approximate: true
    };
  }

  private findConfigurationContext(flow: Array<Record<string, unknown>>, terms: string[]): Array<Record<string, unknown>> {
    const flowSymbols = uniqueStrings(flow.flatMap((edge) => [stringValue(edge.from), stringValue(edge.to)]).filter(Boolean));
    if (flowSymbols.length === 0) {
      return [];
    }

    const optionEdges = this.execJson(
      `SELECT json FROM relationships
       WHERE type IN ('USES_OPTIONS', 'BINDS_OPTIONS', 'USES_CONFIG_KEY')
         AND (from_id IN (${placeholders(flowSymbols.length)}) OR to_id IN (${placeholders(flowSymbols.length)}))
       ORDER BY type, file, start_line
       LIMIT 8;`,
      [...flowSymbols, ...flowSymbols]
    );
    const optionTargets = uniqueStrings(optionEdges.flatMap((edge) => [stringValue(edge.from), stringValue(edge.to)]).filter((id) => id.startsWith("symbol:") || id.startsWith("config:")));

    if (optionTargets.length === 0) {
      return optionEdges;
    }

    const adjacentOptions = this.execJson(
      `SELECT json FROM relationships
       WHERE type IN ('USES_OPTIONS', 'BINDS_OPTIONS', 'USES_CONFIG_KEY')
         AND (from_id IN (${placeholders(optionTargets.length)}) OR to_id IN (${placeholders(optionTargets.length)}))
       ORDER BY type, file, start_line
       LIMIT 8;`,
      [...optionTargets, ...optionTargets]
    );

    return uniqueById([...optionEdges, ...adjacentOptions]).filter((edge) => terms.length === 0 || isRelevantFlowEdge(edge, terms, flowSymbols));
  }

  private findDataFlowContext(flow: Array<Record<string, unknown>>, terms: string[]): Array<Record<string, unknown>> {
    const flowSymbols = uniqueStrings(flow.flatMap((edge) => [stringValue(edge.from), stringValue(edge.to)]).filter(Boolean));
    if (flowSymbols.length === 0) {
      return [];
    }

    const repositoryEdges = this.execJson(
      `SELECT json FROM relationships
       WHERE type IN ('CALLS_REPOSITORY', 'QUERIES', 'WRITES', 'USES_DBSET', 'MAPS_PROPERTY', 'BINDS_MODEL_PROPERTY', 'WRITES_FIELD')
         AND (from_id IN (${placeholders(flowSymbols.length)}) OR to_id IN (${placeholders(flowSymbols.length)}))
       ORDER BY type, file, start_line
       LIMIT 10;`,
      [...flowSymbols, ...flowSymbols]
    );
    const repositoryTargets = uniqueStrings(repositoryEdges.flatMap((edge) => [stringValue(edge.from), stringValue(edge.to)]).filter((id) => id.startsWith("symbol:")));

    if (repositoryTargets.length === 0) {
      return repositoryEdges;
    }

    const adjacentDataEdges = this.execJson(
      `SELECT json FROM relationships
       WHERE type IN ('CALLS_REPOSITORY', 'QUERIES', 'WRITES', 'USES_DBSET', 'DBSET_FOR', 'MAPS_PROPERTY', 'BINDS_MODEL_PROPERTY', 'WRITES_FIELD')
         AND (from_id IN (${placeholders(repositoryTargets.length)}) OR to_id IN (${placeholders(repositoryTargets.length)}))
       ORDER BY type, file, start_line
       LIMIT 10;`,
      [...repositoryTargets, ...repositoryTargets]
    );

    return uniqueById([...repositoryEdges, ...adjacentDataEdges]).filter((edge) => terms.length === 0 || isRelevantFlowEdge(edge, terms, flowSymbols));
  }

  private findPropertyBridgeContext(flow: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    const propertyNames = propertyNamesFromFlow(flow).slice(0, 8);
    if (propertyNames.length === 0) {
      return [];
    }

    const clauses = propertyNames.map(() => "json LIKE ?").join(" OR ");
    const context = this.relationshipContextWhere("AND");
    return rankFlowEdges(this.execJson(
      `SELECT json FROM relationships
       WHERE type IN ('MAPS_PROPERTY', 'BINDS_MODEL_PROPERTY', 'WRITES_FIELD')
         AND (${clauses})
       ${context.sql}
       ORDER BY confidence DESC, file, start_line
       LIMIT 20;`,
      [...propertyNames.map((name) => `%${name}%`), ...context.params]
    )).slice(0, 8);
  }

  private findRequestedPropertyContext(exactAnchors: string[]): Array<Record<string, unknown>> {
    const propertyAnchors = exactAnchors
      .filter((anchor) => /[a-z][A-Z]/.test(anchor) || /(?:title|description|keywords?|summary|tags?|date|time|slug|path)$/i.test(anchor))
      .slice(0, 8);
    if (propertyAnchors.length === 0) {
      return [];
    }

    const clauses = propertyAnchors.map(() => "(from_id LIKE ? OR to_id LIKE ? OR json LIKE ?)").join(" OR ");
    const context = this.relationshipContextWhere("AND");
    return anchorFlowEdges(rankFlowEdges(this.execJson(
      `SELECT json FROM relationships
       WHERE type IN ('MAPS_PROPERTY', 'BINDS_MODEL_PROPERTY', 'WRITES_FIELD', 'WRITES', 'QUERIES')
         AND (${clauses})
       ${context.sql}
       ORDER BY type, file, start_line
       LIMIT 80;`,
      [...propertyAnchors.flatMap((anchor) => [`%${anchor}%`, `%${anchor}%`, `%${anchor}%`]), ...context.params]
    )), propertyAnchors).slice(0, 12);
  }

  private findLayeredFlowContext(query: string, flow: Array<Record<string, unknown>>, terms: string[]): Array<Record<string, unknown>> {
    const domainTerms = domainFlowTerms(terms);
    if (domainTerms.length === 0) {
      return [];
    }
    const exactAnchors = uniqueStrings([...exactIdentifierAnchors(query), ...semanticFlowAnchors(query)]);

    const clauses = domainTerms.map(() => "(from_id LIKE ? OR to_id LIKE ? OR file LIKE ? OR json LIKE ?)").join(" OR ");
    const params = domainTerms.flatMap((term) => [`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`]);
    const context = this.relationshipContextWhere("AND");
    const directEdges = this.execJson(
      `SELECT json FROM relationships
       WHERE (${clauses})
       ${context.sql}
       ORDER BY confidence DESC, type, file, start_line
       LIMIT 300;`,
      [...params, ...context.params]
    ).filter((edge) => !isLowValueRelationshipEdge(edge));

    const flowSymbols = uniqueStrings([...flow, ...directEdges].flatMap((edge) => [stringValue(edge.from), stringValue(edge.to)]).filter((id) => id.startsWith("symbol:") || id.startsWith("file:") || id.startsWith("route:")));
    if (flowSymbols.length === 0) {
      return rankFlowEdges(directEdges).slice(0, 14);
    }

    const adjacent = this.execJson(
      `SELECT json FROM relationships
       WHERE type IN ('INVOKES_VIEW_COMPONENT', 'RENDERS_VIEW', 'USES_CSHARP_SYMBOL', 'WRITES_FIELD', 'BINDS_MODEL_PROPERTY', 'MAPS_PROPERTY', 'READS_QUERY_STRING', 'WRITES_QUERY_STRING', 'WRITES_BROWSER_HISTORY', 'POSTS_TO', 'CALLS', 'CALLS_REPOSITORY', 'WRITES', 'QUERIES', 'USES_DBSET', 'PROJECT_REFERENCES')
         AND (from_id IN (${placeholders(flowSymbols.length)}) OR to_id IN (${placeholders(flowSymbols.length)}))
       ${context.sql}
       ORDER BY type, file, start_line
       LIMIT 80;`,
      [...flowSymbols, ...flowSymbols, ...context.params]
    ).filter((edge) => !isLowValueRelationshipEdge(edge));

    return anchorFlowEdges(rankFlowEdges(uniqueById([...directEdges, ...adjacent])), exactAnchors).slice(0, 14);
  }

  private inferProjectIds(flow: Array<Record<string, unknown>>): string[] {
    const projectSymbols = this.execRows(
      `SELECT id, name, file FROM symbols WHERE kind = 'project' LIMIT 200;`
    ).map((row) => ({
      id: stringValue(row.id),
      name: stringValue(row.name),
      file: stringValue(row.file)
    }));
    const byName = new Map(projectSymbols.map((project) => [project.name, project.id]));
    const inferredNames = new Set<string>();

    for (const edge of flow) {
      for (const file of [stringValue(edge.file)]) {
        const name = inferProjectNameFromFile(file);
        if (name) {
          inferredNames.add(name);
        }
      }

      for (const symbolId of [stringValue(edge.from), stringValue(edge.to)]) {
        const name = inferProjectNameFromSymbol(symbolId);
        if (name) {
          inferredNames.add(name);
        }
      }
    }

    return uniqueStrings([...inferredNames].map((name) => byName.get(name) ?? ""));
  }

  private findRelationshipRowsByTerms(query: string, limit: number): Array<Record<string, unknown>> {
    const terms = queryTerms(query);
    if (terms.length === 0) {
      return [];
    }

    const clauses = terms.map(() => "(from_id LIKE ? OR to_id LIKE ? OR file LIKE ? OR json LIKE ?)").join(" OR ");
    const params = terms.flatMap((term) => [`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`]);
    const context = this.relationshipContextWhere("AND");
    const poolLimit = Math.max(120, Math.min(limit * 8, 800));
    const rows = this.execRows(
      `SELECT from_id, to_id, type, file, json FROM relationships
       WHERE (${clauses})
       ${context.sql}
       LIMIT ${poolLimit};`,
      [...params, ...context.params]
    );
    return rows
      .map((row, index) => ({ row, index, score: relationshipTermScore(row, terms) }))
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, limit)
      .map((entry) => entry.row);
  }

  private findReferenceFallbackRows(query: string, limit: number): Array<Record<string, unknown>> {
    return rankSearchRowsForAgent(query, this.findSearchRowsByTerms(query, Math.max(limit * 3, 12))).slice(0, limit);
  }

  private searchContextWhere(prefix: "AND" | "WHERE"): { sql: string; params: string[] } {
    if (!this.queryContext) {
      return { sql: "", params: [] };
    }

    return {
      sql: `${prefix} (path LIKE ? OR record_id LIKE ? OR record_id LIKE ?)`,
      params: [`${this.queryContext.filePrefix}%`, `${this.queryContext.symbolPrefix}%`, `${this.queryContext.projectSymbolPrefix}%`]
    };
  }

  private fileContextWhere(prefix: "AND" | "WHERE"): { sql: string; params: string[] } {
    if (!this.queryContext) {
      return { sql: "", params: [] };
    }

    return {
      sql: `${prefix} path LIKE ?`,
      params: [`${this.queryContext.filePrefix}%`]
    };
  }

  private scopeFindingToContext(finding: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!this.queryContext) {
      return finding;
    }
    const locations = Array.isArray(finding.locations)
      ? (finding.locations as Array<Record<string, unknown>>).filter((location) => this.matchesContextFile(stringValue(location.file)))
      : [];
    if (!locations.length) {
      return undefined;
    }
    if (finding.kind === "duplicate-code-block") {
      const allLocations = finding.locations as Array<Record<string, unknown>>;
      return {
        ...finding,
        contextLocationCount: locations.length,
        crossContextLocationCount: allLocations.length - locations.length
      };
    }
    return { ...finding, locations };
  }

  private symbolContextWhere(prefix: "AND" | "WHERE"): { sql: string; params: string[] } {
    if (!this.queryContext) {
      return { sql: "", params: [] };
    }

    return {
      sql: `${prefix} (file LIKE ? OR id LIKE ? OR id LIKE ?)`,
      params: [`${this.queryContext.filePrefix}%`, `${this.queryContext.symbolPrefix}%`, `${this.queryContext.projectSymbolPrefix}%`]
    };
  }

  private referenceContextWhere(prefix: "AND" | "WHERE"): { sql: string; params: string[] } {
    if (!this.queryContext) {
      return { sql: "", params: [] };
    }

    return {
      sql: `${prefix} (file LIKE ? OR resolved_symbol_id LIKE ? OR resolved_symbol_id LIKE ?)`,
      params: [`${this.queryContext.filePrefix}%`, `${this.queryContext.symbolPrefix}%`, `${this.queryContext.projectSymbolPrefix}%`]
    };
  }

  private relationshipContextWhere(prefix: "AND" | "WHERE"): { sql: string; params: string[] } {
    if (!this.queryContext) {
      return { sql: "", params: [] };
    }

    return {
      sql: `${prefix} (file LIKE ? OR from_id LIKE ? OR to_id LIKE ? OR from_id LIKE ? OR to_id LIKE ?)`,
      params: [
        `${this.queryContext.filePrefix}%`,
        `${this.queryContext.symbolPrefix}%`,
        `${this.queryContext.symbolPrefix}%`,
        `${this.queryContext.projectSymbolPrefix}%`,
        `${this.queryContext.projectSymbolPrefix}%`
      ]
    };
  }

  private scopePatternsToContext(patterns: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    if (!this.queryContext) {
      return patterns;
    }

    return patterns
      .map((pattern) => {
        const instances = Array.isArray(pattern.instances) ? pattern.instances as Array<Record<string, unknown>> : [];
        const scopedInstances = instances.filter((instance) => this.instanceMatchesContext(instance));
        return {
          ...pattern,
          instances: scopedInstances
        };
      })
      .filter((pattern) => Array.isArray(pattern.instances) && pattern.instances.length > 0);
  }

  private instanceMatchesContext(instance: Record<string, unknown>): boolean {
    const files = Array.isArray(instance.files) ? instance.files : [];
    const symbols = Array.isArray(instance.symbols) ? instance.symbols : [];
    return files.some((file) => this.matchesContextFile(stringValue(file))) || symbols.some((symbol) => this.matchesContextSymbol(stringValue(symbol)));
  }

  private matchesContextFile(file: string): boolean {
    return !this.queryContext || file.replace(/\\/g, "/").startsWith(`${this.queryContext.filePrefix}/`) || file.replace(/\\/g, "/") === this.queryContext.filePrefix;
  }

  private matchesContextSymbol(symbol: string): boolean {
    return !this.queryContext || symbol.startsWith(this.queryContext.symbolPrefix) || symbol.startsWith(this.queryContext.projectSymbolPrefix);
  }

  private traverseEdges(seeds: string[], maxDepth: number, limit: number, crossContextNodes = new Set<string>()): Array<Record<string, unknown>> {
    const seenNodes = new Set<string>();
    const seenEdges = new Set<string>();
    const queue = seeds.map((seed) => ({ id: seed, depth: 0 }));
    const edges: Array<Record<string, unknown>> = [];

    while (queue.length > 0 && edges.length < limit) {
      const current = queue.shift()!;
      if (current.depth > maxDepth || seenNodes.has(`${current.id}:${current.depth}`)) {
        continue;
      }
      seenNodes.add(`${current.id}:${current.depth}`);

      const adjacent = this.execJson(
        `SELECT json FROM relationships
         WHERE from_id = ? OR to_id = ? OR from_id LIKE ? OR to_id LIKE ?
         ORDER BY
           CASE type
             WHEN 'POSTS_TO' THEN 0
             WHEN 'HANDLES_EVENT' THEN 1
             WHEN 'SELECTS_ELEMENT' THEN 2
             WHEN 'CALLS' THEN 3
             WHEN 'MAPS_ROUTE' THEN 4
             WHEN 'INJECTS' THEN 5
             WHEN 'IMPLEMENTS' THEN 6
             ELSE 9
           END,
           file,
           start_line
         LIMIT 20;`,
        [current.id, current.id, `%${current.id}%`, `%${current.id}%`]
      ).filter((edge) => this.relationshipMatchesContext(edge) || relationshipMatchesCrossContextAnchor(edge, crossContextNodes));

      for (const edge of adjacent) {
        const edgeId = stringValue(edge.id);
        if (seenEdges.has(edgeId)) {
          continue;
        }
        seenEdges.add(edgeId);
        edges.push(edge);

        const from = stringValue(edge.from);
        const to = stringValue(edge.to);
        if (relationshipMatchesCrossContextAnchor(edge, crossContextNodes)) {
          if (from) {
            crossContextNodes.add(from);
          }
          if (to) {
            crossContextNodes.add(to);
          }
        }
        if (current.depth < maxDepth) {
          if (from && !isCommonExternalSymbol(from) && !seenNodes.has(`${from}:${current.depth + 1}`)) {
            queue.push({ id: from, depth: current.depth + 1 });
          }
          if (to && !isCommonExternalSymbol(to) && !seenNodes.has(`${to}:${current.depth + 1}`)) {
            queue.push({ id: to, depth: current.depth + 1 });
          }
        }
      }
    }

    return edges;
  }

  private execJson(sql: string, params: unknown[] = []): Array<Record<string, unknown>> {
    return this.execRows(sql, params).map((row) => JSON.parse(String(row.json)) as Record<string, unknown>);
  }

  private relationshipMatchesContext(edge: Record<string, unknown>): boolean {
    if (!this.queryContext) {
      return true;
    }

    return this.matchesContextFile(stringValue(edge.file))
      || this.matchesContextSymbol(stringValue(edge.from))
      || this.matchesContextSymbol(stringValue(edge.to));
  }

  private ambiguousContextResponse(queryType: string, query: string): QueryResponse | undefined {
    if (!this.queryContextAmbiguity) {
      return undefined;
    }

    const candidates = this.queryContextAmbiguity.candidates.slice(0, 6);
    return compactResponse({
      query,
      answer: `Ambiguous --context "${this.queryContextAmbiguity.requested}". Retry with an exact context candidate.`,
      confidence: 0.1,
      evidence: candidates.map((candidate) => ({
        recordType: "contextCandidate",
        context: candidate.filePrefix,
        message: `Use --context ${candidate.filePrefix}`
      })),
      nextQueries: candidates.map((candidate) => `kraken-atlas query ${queryType} "${query || "project"}" --context "${candidate.filePrefix}"`)
    });
  }

  private resolveQueryContext(projectContext: string | undefined): { context?: QueryContext; ambiguity?: QueryContextAmbiguity } {
    const requested = normalizeQueryContext(projectContext);
    if (!requested) {
      return {};
    }

    const candidates = this.contextCandidates();
    const resolved = resolveContextCandidate(requested, candidates);
    if (resolved.ambiguity) {
      return { ambiguity: { requested: projectContext?.trim() ?? requested.input, candidates: resolved.ambiguity } };
    }

    return { context: resolved.context ? normalizeQueryContext(resolved.context.filePrefix) : requested };
  }

  private contextCandidates(): QueryContext[] {
    const projectSymbols = this.execRows(
      `SELECT id, name, file FROM symbols WHERE kind = 'project' ORDER BY file, name LIMIT 500;`
    ).map((row) => contextFromProjectSymbol(stringValue(row.name), stringValue(row.file)));
    const topLevelFolders = this.execRows(
      `SELECT DISTINCT substr(path, 1, instr(path || '/', '/') - 1) AS folder
       FROM files
       WHERE instr(path, '/') > 0
       ORDER BY folder
       LIMIT 500;`
    ).map((row) => normalizeQueryContext(stringValue(row.folder)));

    return uniqueContexts([...projectSymbols, ...topLevelFolders].filter((context): context is QueryContext => Boolean(context)));
  }

  private execRows(sql: string, params: unknown[] = []): Array<Record<string, unknown>> {
    const statement = this.database.prepare(sql);
    try {
      statement.bind(params as any[]);
      const rows: Array<Record<string, unknown>> = [];
      while (statement.step()) {
        rows.push(statement.getAsObject() as Record<string, unknown>);
      }
      return rows;
    } finally {
      statement.free();
    }
  }
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

function relationshipNextQueries(rows: Array<Record<string, unknown>>): string[] {
  return uniqueStrings(
    rows
      .flatMap((row) => [stringValue(row.from), stringValue(row.to)])
      .filter((id) => id && !isCommonExternalSymbol(id))
      .slice(0, 10)
      .map((id) => `kraken-atlas query relationships "${id}"`)
  );
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

function parseCSharpMethodSymbolId(symbolId: string): { typeName: string; signature: string } | undefined {
  const prefix = "symbol:csharp:";
  if (!symbolId.startsWith(prefix) || !symbolId.includes("(")) {
    return undefined;
  }

  const body = symbolId.slice(prefix.length);
  const methodStart = body.lastIndexOf(".", body.indexOf("("));
  if (methodStart < 0) {
    return undefined;
  }

  return {
    typeName: body.slice(0, methodStart),
    signature: body.slice(methodStart + 1)
  };
}

function countByValues(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values.filter(Boolean)) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function formatCountMap(counts: Record<string, number>): string {
  return Object.entries(counts).map(([key, count]) => `${key}=${count}`).join(", ");
}

function isJavaScriptAnchor(anchor: Record<string, unknown>): boolean {
  return stringValue(anchor.id).startsWith("symbol:javascript:")
    || /\.(?:js|mjs|cjs)$/iu.test(stringValue(anchor.file));
}
