import * as path from "path";
import { Database } from "sql.js";
import { openSqliteIndex } from "../storage/sqliteIndex";

export interface QueryResponse {
  query: string;
  answer: string;
  confidence: number;
  evidence: Array<Record<string, unknown>>;
  files: string[];
  symbols: string[];
  relationships: Array<Record<string, unknown>>;
  patterns: Array<Record<string, unknown>>;
  flow: Array<Record<string, unknown>>;
  nextQueries: string[];
  estimatedContextSavings: string;
}

export interface QueryServiceOptions {
  projectContext?: string;
}

export interface RelationshipQueryOptions {
  edgeTypes?: string[];
  limit?: number;
}

interface QueryContext {
  input: string;
  name: string;
  filePrefix: string;
  symbolPrefix: string;
  projectSymbolPrefix: string;
}

interface QueryContextAmbiguity {
  requested: string;
  candidates: QueryContext[];
}

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

    const filteredRows = this.withEndpointLocations(filterRelationshipRowsForQuery(rows, query));
    const omittedCount = Math.max(0, rows.length - filteredRows.length);
    const expandedRows = this.queryContext ? filteredRows.filter((row) => !this.relationshipMatchesContext(row)) : [];
    const expandedTypes = countByValues(expandedRows.map((row) => stringValue(row.type)));

    return compactResponse({
      query,
      answer: filteredRows.length
        ? `Found ${filteredRows.length} relationship edge(s)${edgeTypes.length ? ` filtered to ${edgeTypes.join(", ")}` : ""}.`
        : "No relationships matched.",
      confidence: filteredRows.length ? 0.9 : 0,
      evidence: [
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

    const context = this.relationshipContextWhere("WHERE");
    const rows = this.execJson(
      `SELECT json FROM relationships
       ${context.sql}
       ORDER BY file, start_line
       LIMIT 5000;`,
      context.params
    );
    const terms = queryTerms(query).filter((term) => !["hotspot", "hotspots", "architecture", "central", "shared"].includes(term));
    const scopedRows = terms.length
      ? rows.filter((row) => terms.some((term) => JSON.stringify(row).toLowerCase().includes(term)))
      : rows;
    const activeRows = scopedRows.length || !terms.length ? scopedRows : rows;
    const hotspots = buildArchitectureHotspots(activeRows).slice(0, 8);
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
          message: "Hotspots are ranked from relationship volume, relationship-type diversity, and shared graph endpoints. They are useful for architecture awareness and risk checks."
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
    const dataFlowContext = preferJavaScript ? [] : this.findDataFlowContext([...coreFlow, ...propertyBridgeContext], terms);
    const projectReferences = preferJavaScript ? [] : this.findProjectReferenceContext(coreFlow);
    const flowEdges = composeFlowEdges(query, [
      ...coreFlow,
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
    const rankedRecommendations = rankFileRecommendations(query, searchRows, flow.relationships, patterns, strongAnchors);
    const browserStateFiles = new Set(flow.relationships
      .filter((relationship) => ["READS_QUERY_STRING", "WRITES_QUERY_STRING", "WRITES_BROWSER_HISTORY"].includes(stringValue(relationship.type)))
      .map((relationship) => stringValue(relationship.file))
      .filter(Boolean));
    const recommendations = (queryWantsBrowserQueryState(query.toLowerCase()) && browserStateFiles.size
      ? rankedRecommendations.filter((recommendation) => browserStateFiles.has(recommendation.file))
      : rankedRecommendations).slice(0, 8);
    const capabilityAssessment = assessExistingCapabilityEvidence(query, flow.relationships);
    const patternFit = buildPatternFitEvidence(patterns, recommendations);
    const caveats = buildWhereToAddCaveats(query, recommendations, flow.relationships);
    const files = recommendations.map((recommendation) => recommendation.file);
    const confidence = Math.min(calculateWhereToAddConfidence(query, recommendations, flow.relationships), flow.confidence);

    return compactResponse({
      query,
      answer: recommendations.length
        ? `${capabilityAssessment.answerPrefix}Likely edit locations for "${query}" ranked by text matches, feature-flow edges, and detected project patterns.`
        : `No strong edit-location recommendation found for "${query}". Start with search and project queries.`,
      confidence,
      evidence: [...recommendations, ...capabilityAssessment.evidence, ...patternFit, ...strongAnchors, ...patterns.slice(0, 4).map(patternEvidence), ...caveats],
      files,
      symbols: uniqueStrings(flow.symbols),
      relationships: flow.relationships.slice(0, 12),
      patterns: patterns.slice(0, 5).map(patternEvidence),
      nextQueries: uniqueStrings([
        ...files.slice(0, 5).map((file) => `kraken-atlas query relationships "${file}"`),
        ...flow.nextQueries,
        ...patterns.flatMap((pattern) => (pattern.instances as any[] | undefined)?.slice(0, 2).flatMap((instance) => (instance.symbols ?? []).map((symbol: string) => `kraken-atlas query relationships "${symbol}"`)) ?? [])
      ]).slice(0, 8)
    });
  }

  public planChange(query: string): QueryResponse {
    const ambiguity = this.ambiguousContextResponse("plan-change", query);
    if (ambiguity) {
      return ambiguity;
    }

    const where = this.whereToAdd(query);
    const hotspots = this.findArchitectureHotspots(query);
    const drift = this.findDrift(query);
    const files = where.files.slice(0, 6);
    const fileSet = new Set(files);
    const fileRecommendations = where.evidence
      .filter((item) => item.recordType === "fileRecommendation" && fileSet.has(stringValue(item.file)))
      .slice(0, 6);
    const patternFit = where.evidence.filter((item) => item.recordType === "patternFit").slice(0, 2);
    const caveats = where.evidence.filter((item) => item.recordType === "caveat").slice(0, 2);
    const avoidHotspots = hotspots.evidence
      .filter((item) => item.recordType === "architectureHotspot" && !fileSet.has(stringValue(item.file)))
      .slice(0, 3)
      .map((item) => ({
        recordType: "planAvoidFile",
        file: item.file,
        role: item.role,
        reason: "Central/shared hotspot. Inspect only if this change touches shared setup, configuration, routing, or cross-cutting behavior."
      }));
    const driftFindings = drift.evidence
      .filter((item) => item.recordType === "finding")
      .slice(0, 3);
    const contextCommand = `kraken-atlas context plan-change "${query.replace(/"/g, '\\"')}"`;

    return compactResponse({
      query,
      answer: files.length
        ? `Implementation plan for "${query}" with likely edit files, pattern guidance, risk checks, and a bounded context command.`
        : `No implementation plan found for "${query}". Start with search and project queries.`,
      confidence: Math.min(where.confidence + (patternFit.length ? 0.05 : 0), 0.92),
      evidence: [
        {
          recordType: "changePlanSummary",
          editFileCount: files.length,
          patternFitCount: patternFit.length,
          driftCount: driftFindings.length,
          avoidFileCount: avoidHotspots.length,
          message: "Open likely edit files first, copy the local pattern, avoid central files initially, then export context only after the plan is accepted."
        },
        ...caveats,
        ...patternFit,
        ...fileRecommendations,
        ...avoidHotspots,
        ...driftFindings,
        {
          recordType: "contextPackCommand",
          command: contextCommand,
          message: "Use this after reviewing the plan to create a bounded context pack for implementation."
        }
      ],
      files,
      symbols: where.symbols,
      relationships: where.relationships,
      patterns: where.patterns,
      nextQueries: uniqueStrings([
        contextCommand,
        ...where.nextQueries.slice(0, 4),
        "kraken-atlas query hotspots",
        "kraken-atlas query drift"
      ]).slice(0, 8)
    });
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

function compactResponse(input: Partial<QueryResponse> & { query: string; answer: string; confidence: number }): QueryResponse {
  return {
    query: input.query,
    answer: input.answer,
    confidence: input.confidence,
    evidence: input.evidence ?? [],
    files: uniqueStrings(input.files ?? []),
    symbols: uniqueStrings(input.symbols ?? []),
    relationships: input.relationships ?? [],
    patterns: input.patterns ?? [],
    flow: input.flow ?? [],
    nextQueries: uniqueStrings(input.nextQueries ?? []).slice(0, 10),
    estimatedContextSavings: "Returns graph records and line ranges instead of full source files."
  };
}

function symbolEvidence(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    file: row.file,
    range: row.range,
    confidence: row.confidence
  };
}

function strongAnchorEvidence(row: Record<string, unknown>): Record<string, unknown> {
  return {
    recordType: "strongAnchor",
    id: row.id,
    name: row.name,
    kind: row.kind,
    file: row.file,
    range: row.range,
    matchedConcepts: row.matchedConcepts,
    score: row.anchorScore,
    crossContext: row.crossContext,
    message: `Strong exact${row.crossContext ? " cross-project" : ""} anchor discovered from: ${(row.matchedConcepts as string[] | undefined)?.join(", ") ?? "query terms"}.`
  };
}

function strongAnchorRoleBoost(row: Record<string, unknown>): number {
  const file = stringValue(row.file).replace(/\\/g, "/").toLowerCase();
  const kind = stringValue(row.kind).toLowerCase();

  if (kind === "method" && file.includes("/controllers/")) {
    return 9;
  }
  if (kind === "method" && (file.includes("/services/") || file.includes("/repositories/"))) {
    return 5;
  }
  if (kind === "interface" || /\/(service|data|repository)definitions\//.test(file)) {
    return -2;
  }
  if (file.includes("/viewmodels/") || file.includes("/models/")) {
    return -1;
  }

  return 0;
}

function referenceEvidence(row: Record<string, unknown>): Record<string, unknown> {
  return {
    recordType: "reference",
    id: row.id,
    symbolName: row.symbolName,
    resolvedSymbolId: row.resolvedSymbolId,
    file: row.file,
    range: row.range,
    context: row.context,
    snippet: row.snippet,
    confidence: row.confidence
  };
}

function relationshipFiles(rows: Array<Record<string, unknown>>): string[] {
  return uniqueStrings(rows.flatMap((row) => {
    const files = [stringValue(row.file)];
    const to = stringValue(row.to);
    if (to.startsWith("file:")) {
      files.push(to.slice("file:".length));
    }
    const from = stringValue(row.from);
    if (from.startsWith("file:")) {
      files.push(from.slice("file:".length));
    }
    return files.filter(Boolean);
  }));
}

function searchEvidence(row: Record<string, unknown>): Record<string, unknown> {
  const body = stringValue(row.body);
  const matchKind = stringValue(row.record_type) === "reference" ? body.split(/\s+/u)[0] : stringValue(row.record_type);
  const snippet = matchKind && body.startsWith(matchKind) ? body.slice(matchKind.length).trim() : body;
  return {
    recordId: row.record_id,
    recordType: row.record_type,
    title: row.title,
    path: row.path,
    line: searchRecordLine(row),
    matchKind,
    snippet
  };
}

function buildReferenceSummary(
  sourceReferenceKinds: Record<string, number>,
  relationshipTypes: Record<string, number>,
  symbolIds: string[]
): Record<string, unknown> {
  return {
    recordType: "referenceSummary",
    sourceReferenceCount: sumCounts(sourceReferenceKinds),
    connectedRelationshipCount: sumCounts(relationshipTypes),
    resolvedAnchorCount: symbolIds.length,
    sourceReferenceKinds,
    relationshipTypes,
    message: "Source references include literal injections and semantically resolved calls. Connected edges are an expansion around all resolved anchors; an exact single-id relationship query can therefore have a different total. Compact agent output samples the evidence; use --format info or json for all records."
  };
}

function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function searchRecordLine(row: Record<string, unknown>): number | undefined {
  const recordId = stringValue(row.record_id);
  const file = stringValue(row.path);
  const referencePrefix = file ? `reference:web:${file}:` : "";
  if (referencePrefix && recordId.startsWith(referencePrefix)) {
    const line = Number.parseInt(recordId.slice(referencePrefix.length).split(":")[0], 10);
    return Number.isFinite(line) ? line : undefined;
  }
  return undefined;
}

function relationshipEvidence(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    type: row.type,
    from: row.from,
    to: row.to,
    fromLocation: row.fromLocation,
    toLocation: row.toLocation,
    file: row.file,
    range: row.range,
    evidence: row.evidence,
    confidence: row.confidence
  };
}

function nodeLocation(id: string, nodeKind: string, file: string, range: unknown, sourceKind: string, approximate: boolean): Record<string, unknown> {
  return {
    recordType: "nodeLocation",
    id,
    nodeKind,
    file,
    range: normalizeRange(range),
    sourceKind,
    approximate
  };
}

function normalizeRange(range: unknown): Record<string, number> {
  if (range && typeof range === "object" && typeof (range as { startLine?: unknown }).startLine === "number") {
    const typed = range as { startLine: number; startColumn?: number; endLine?: number; endColumn?: number };
    return {
      startLine: typed.startLine,
      startColumn: typeof typed.startColumn === "number" ? typed.startColumn : 1,
      endLine: typeof typed.endLine === "number" ? typed.endLine : typed.startLine,
      endColumn: typeof typed.endColumn === "number" ? typed.endColumn : 1
    };
  }

  return firstLineRange();
}

function firstLineRange(): Record<string, number> {
  return {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 1
  };
}

function inferSyntheticNodeKind(endpointId: string): string {
  const prefix = endpointId.split(":", 1)[0];
  if (prefix) {
    return prefix;
  }

  return "synthetic";
}

function patternEvidence(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    language: row.language,
    confidence: row.confidence,
    frequency: row.frequency,
    counterExampleCount: row.counterExampleCount,
    rulesObserved: row.rulesObserved,
    agentGuidance: row.agentGuidance,
    instances: row.instances
  };
}

function buildPatternMapSummaries(patterns: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const byCategory = new Map<string, Array<Record<string, unknown>>>();
  for (const pattern of patterns) {
    const category = stringValue(pattern.category) || "uncategorized";
    byCategory.set(category, [...(byCategory.get(category) ?? []), pattern]);
  }

  return [...byCategory.entries()]
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
    .map(([category, categoryPatterns]) => {
      const sorted = [...categoryPatterns].sort((left, right) =>
        numberValue(right.confidence) - numberValue(left.confidence) ||
        numberValue(right.frequency) - numberValue(left.frequency) ||
        stringValue(left.name).localeCompare(stringValue(right.name))
      );
      const totalFrequency = sorted.reduce((sum, pattern) => sum + numberValue(pattern.frequency), 0);
      return {
        recordType: "patternMapArea",
        category,
        patternCount: sorted.length,
        totalFrequency,
        averageConfidence: averagePatternConfidence(sorted),
        patterns: sorted.slice(0, 5).map((pattern) => ({
          id: pattern.id,
          name: pattern.name,
          confidence: pattern.confidence,
          frequency: pattern.frequency,
          guidance: pattern.agentGuidance
        })),
        message: `${category}: ${sorted.length} pattern(s), ${totalFrequency} observed edge(s).`
      };
    });
}

function buildArchitectureHotspots(relationships: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  interface HotspotStats {
    file: string;
    relationshipCount: number;
    types: Map<string, number>;
    endpoints: Set<string>;
  }

  const byFile = new Map<string, HotspotStats>();
  const endpointCounts = new Map<string, number>();

  for (const relationship of relationships) {
    const file = stringValue(relationship.file);
    if (!file || isLikelyTestFile(file)) {
      continue;
    }

    const stats = byFile.get(file) ?? {
      file,
      relationshipCount: 0,
      types: new Map<string, number>(),
      endpoints: new Set<string>()
    };
    stats.relationshipCount += 1;
    const type = stringValue(relationship.type) || "UNKNOWN";
    stats.types.set(type, (stats.types.get(type) ?? 0) + 1);
    for (const endpoint of [stringValue(relationship.from), stringValue(relationship.to)]) {
      if (endpoint && !isCommonExternalSymbol(endpoint)) {
        stats.endpoints.add(endpoint);
        endpointCounts.set(endpoint, (endpointCounts.get(endpoint) ?? 0) + 1);
      }
    }
    byFile.set(file, stats);
  }

  return [...byFile.values()]
    .map((stats) => {
      const sharedEndpointCount = [...stats.endpoints].filter((endpoint) => (endpointCounts.get(endpoint) ?? 0) > 1).length;
      const relationshipTypes = [...stats.types.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([type, count]) => ({ type, count }));
      const role = inferHotspotRole(stats.file, relationshipTypes.map((entry) => entry.type));
      const score = stats.relationshipCount + stats.types.size * 3 + sharedEndpointCount * 2 + hotspotRoleScore(role);
      return {
        recordType: "architectureHotspot",
        file: stats.file,
        score,
        role,
        relationshipCount: stats.relationshipCount,
        distinctRelationshipTypes: stats.types.size,
        sharedEndpointCount,
        topRelationshipTypes: relationshipTypes.slice(0, 5),
        guidance: hotspotGuidance(role)
      };
    })
    .filter((hotspot) => numberValue(hotspot.score) >= 4)
    .sort((left, right) =>
      numberValue(right.score) - numberValue(left.score) ||
      numberValue(right.relationshipCount) - numberValue(left.relationshipCount) ||
      stringValue(left.file).localeCompare(stringValue(right.file))
    );
}

function inferHotspotRole(file: string, relationshipTypes: string[]): string {
  const normalized = file.replace(/\\/g, "/");
  const basename = normalized.split("/").pop() ?? normalized;
  const types = new Set(relationshipTypes);

  if (/^(Program|Startup)\.cs$/iu.test(basename) || types.has("REGISTERS") || types.has("USES_MIDDLEWARE")) {
    return "composition-root";
  }
  if (/appsettings|config|options|settings/iu.test(normalized) || types.has("USES_CONFIG_KEY") || types.has("BINDS_OPTIONS")) {
    return "configuration";
  }
  if (/(Controller|PageModel|\.cshtml\.cs)$/iu.test(basename) || types.has("MAPS_ROUTE") || types.has("HANDLES_REQUEST")) {
    return "entry-point";
  }
  if (/(Service|Manager|Repository|Adapter)\.cs$/iu.test(basename) || types.has("CALLS_REPOSITORY") || types.has("USES_DBSET")) {
    return "service-layer";
  }
  if (/\.(js|ts|tsx)$/iu.test(basename) || types.has("HANDLES_EVENT") || types.has("WRITES_QUERY_STRING")) {
    return "client-flow";
  }
  return "shared-bridge";
}

function hotspotRoleScore(role: string): number {
  switch (role) {
    case "composition-root":
    case "configuration":
      return 4;
    case "entry-point":
    case "service-layer":
      return 2;
    default:
      return 0;
  }
}

function hotspotGuidance(role: string): string {
  switch (role) {
    case "composition-root":
      return "Avoid editing unless the task is explicitly startup, DI, routing, middleware, or shared setup. Use this for architecture context first.";
    case "configuration":
      return "Likely shared configuration/options surface. Check binding and usage before adding new keys or settings.";
    case "entry-point":
      return "Likely request or UI entry point. Use it to understand flow, then prefer the matching feature service/model/view files for edits.";
    case "service-layer":
      return "Likely shared behavior or data orchestration. Check callers before changing behavior.";
    case "client-flow":
      return "Likely browser interaction hub. Check related selectors, events, routes, and state writes before editing.";
    default:
      return "Likely bridge file across multiple graph relationships. Use for orientation and risk checks before editing.";
  }
}

function averagePatternConfidence(patterns: Array<Record<string, unknown>>): number {
  if (patterns.length === 0) {
    return 0;
  }

  const total = patterns.reduce((sum, pattern) => sum + numberValue(pattern.confidence), 0);
  return Math.round((total / patterns.length) * 100) / 100;
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

function referenceNextQueries(query: string, fallbackRows: Array<Record<string, unknown>>): string[] {
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

function buildReferenceCoverageCaveats(query: string, fallbackRows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
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

function filterRelationshipRowsForQuery(rows: Array<Record<string, unknown>>, query: string): Array<Record<string, unknown>> {
  const lowerQuery = query.toLowerCase();
  if (rows.length === 0 || queryTargetsCommonExternalSymbol(lowerQuery)) {
    return rows;
  }

  const filtered = rows.filter((row) => !isLowValueRelationshipEdge(row));
  return filtered.length > 0 ? filtered : rows;
}

function isLowValueRelationshipEdge(row: Record<string, unknown>): boolean {
  const type = stringValue(row.type);
  const from = stringValue(row.from);
  const to = stringValue(row.to);

  if (type === "CALLS" && isCommonExternalSymbol(to)) {
    return true;
  }

  return isCommonExternalSymbol(from) || (type !== "RETURNS_TYPE" && isCommonExternalSymbol(to) && type !== "IMPLEMENTS");
}

function queryTargetsCommonExternalSymbol(lowerQuery: string): boolean {
  return /\b(string|int|long|double|decimal|bool|object|task|ienumerable|ilist|list|dictionary|datetime|guid|iconfiguration|ihttpclientfactory|ilogger|iserviceprovider|pagemodel|controller|controllerbase)\b/i.test(lowerQuery);
}

function domainFlowTerms(terms: string[]): string[] {
  const generic = new Set([
    "image",
    "images",
    "render",
    "rendering",
    "edit",
    "editing",
    "editable",
    "make",
    "code",
    "data",
    "view",
    "views",
    "model",
    "models"
  ]);
  const domainTerms = terms.filter((term) => term.length >= 4 && !generic.has(term));
  return domainTerms.length ? domainTerms.slice(0, 5) : terms.filter((term) => term.length >= 4).slice(0, 3);
}

function rankFlowEdges(edges: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const weight: Record<string, number> = {
    POSTS_TO: 0,
    HANDLES_EVENT: 1,
    EMITS_EVENT: 31,
    SUBSCRIBES_EVENT: 32,
    WRITES_QUERY_STRING: 1.4,
    READS_QUERY_STRING: 1.5,
    WRITES_BROWSER_HISTORY: 1.6,
    SELECTS_ELEMENT: 2,
    UPDATES_ELEMENT_STATE: 33,
    WRITES_FIELD: 3,
    BINDS_MODEL_PROPERTY: 4,
    MAPS_PROPERTY: 5,
    LOADS_SCRIPT: 6,
    INVOKES_VIEW_COMPONENT: 7,
    RENDERS_VIEW: 8,
    CALLS: 9,
    MAPS_ROUTE: 10,
    INJECTS: 11,
    REGISTERS: 12,
    IMPLEMENTS: 13,
    WRITES: 14,
    CALLS_REPOSITORY: 15,
    USES_DBSET: 16,
    QUERIES: 17,
    DBSET_FOR: 18,
    VALIDATES: 19,
    USES_VALIDATOR: 20,
    REQUIRES_AUTH: 21,
    HANDLES_REQUEST: 22,
    RUNS_HOSTED_SERVICE: 23,
    USES_MIDDLEWARE: 24,
    BINDS_OPTIONS: 25,
    USES_OPTIONS: 26,
    USES_CONFIG_KEY: 27,
    PROJECT_REFERENCES: 28,
    RETURNS_TYPE: 29,
    USES_CONFIG: 30
  };

  return [...edges].sort((left, right) => {
    const leftWeight = weight[stringValue(left.type)] ?? 99;
    const rightWeight = weight[stringValue(right.type)] ?? 99;
    return leftWeight - rightWeight || flowFileWeight(stringValue(left.file)) - flowFileWeight(stringValue(right.file)) || stringValue(left.file).localeCompare(stringValue(right.file));
  });
}

function flowFileWeight(file: string): number {
  const normalized = file.replace(/\\/g, "/").toLowerCase();
  if (hasPathSegment(normalized, "views") || hasPathSegment(normalized, "pages") || hasPathSegment(normalized, "wwwroot")) {
    return 0;
  }
  if (hasPathSegment(normalized, "controllers")) {
    return 1;
  }
  if (hasPathSegment(normalized, "services")) {
    return 2;
  }
  if (hasPathSegment(normalized, "repositories")) {
    return 3;
  }
  if (hasPathSegment(normalized, "data")) {
    return 4;
  }
  if (hasPathSegment(normalized, "options") || normalized.endsWith("program.cs")) {
    return 5;
  }
  if (hasPathSegment(normalized, "validation") || hasPathSegment(normalized, "validators")) {
    return 6;
  }
  if (hasPathSegment(normalized, "handlers") || hasPathSegment(normalized, "background") || hasPathSegment(normalized, "middleware")) {
    return 7;
  }

  return 8;
}

function capRepeatedFlowNoise(edges: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const typeCounts = new Map<string, number>();
  return edges.filter((edge) => {
    const type = stringValue(edge.type);
    const count = typeCounts.get(type) ?? 0;
    typeCounts.set(type, count + 1);
    return type !== "SELECTS_ELEMENT" || count < 2;
  });
}

function propertyNamesFromFlow(edges: Array<Record<string, unknown>>): string[] {
  const names: string[] = [];
  const pattern = /\b[A-Z][A-Za-z0-9_]*(?:Json|Id|Sid|Url|Name|Title|Caption|Content|Config|Request|Response)\b/g;
  for (const edge of edges) {
    const text = [
      stringValue(edge.from),
      stringValue(edge.to),
      stringValue(edge.evidence)
    ].join(" ");
    for (const match of text.matchAll(pattern)) {
      names.push(match[0]);
    }
  }

  return uniqueStrings(names).filter((name) => !["String", "Task", "Guid", "Model", "View"].includes(name));
}

function isRelevantFlowEdge(edge: Record<string, unknown>, terms: string[], seeds: string[]): boolean {
  if (terms.length === 0) {
    return true;
  }

  const from = stringValue(edge.from);
  const to = stringValue(edge.to);
  const file = stringValue(edge.file).replace(/\\/g, "/").toLowerCase();
  const haystack = JSON.stringify(edge).toLowerCase();

  if (isLowValueFrameworkLeaf(edge, terms)) {
    return false;
  }

  if (terms.some((term) => haystack.includes(term))) {
    return true;
  }

  if (isCommonExternalSymbol(from) || isCommonExternalSymbol(to)) {
    return false;
  }

  return seeds.some((seed) => {
    const normalizedSeed = seed.toLowerCase();
    return normalizedSeed.length >= 3 && !isCommonExternalSymbol(seed) && (from.toLowerCase().includes(normalizedSeed) || to.toLowerCase().includes(normalizedSeed) || file.includes(normalizedSeed));
  });
}

function relationshipMatchesCrossContextAnchor(edge: Record<string, unknown>, anchors: Set<string>): boolean {
  if (anchors.size === 0) {
    return false;
  }

  const allowedTypes = new Set([
    "MAPS_ROUTE",
    "POSTS_TO",
    "CALLS",
    "REQUIRES_AUTH",
    "VALIDATES",
    "USES_VALIDATOR",
    "HANDLES_REQUEST",
    "IMPLEMENTS",
    "INJECTS",
    "CALLS_REPOSITORY",
    "QUERIES",
    "WRITES",
    "USES_DBSET",
    "PROJECT_REFERENCES"
  ]);
  return allowedTypes.has(stringValue(edge.type))
    && (anchors.has(stringValue(edge.from)) || anchors.has(stringValue(edge.to)));
}

function isCommonExternalSymbol(id: string): boolean {
  return /^symbol:csharp:(string|int|long|double|decimal|bool|object|task|task<|ienumerable<|ilist<|list<|dictionary<|datetime|guid|iconfiguration|ihttpclientfactory|ilogger|ilogger<|iserviceprovider|pagemodel|controller|controllerbase)(\.|$|<)/i.test(id);
}

function isLowValueFrameworkLeaf(edge: Record<string, unknown>, terms: string[]): boolean {
  const type = stringValue(edge.type);
  const to = stringValue(edge.to);
  if (type !== "CALLS" || !isCommonExternalSymbol(to)) {
    return false;
  }

  const target = to.toLowerCase();
  return !terms.some((term) => target.includes(term));
}

interface FileRecommendation extends Record<string, unknown> {
  recordType: "fileRecommendation";
  file: string;
  score: number;
  reasons: string[];
  matchedTerms: string[];
  patternsToFollow: string[];
  relationshipEvidenceCount: number;
  searchEvidenceCount: number;
  relationshipDetails: Array<Record<string, unknown>>;
  anchorDetails: Array<Record<string, unknown>>;
}

function rankFileRecommendations(
  query: string,
  searchRows: Array<Record<string, unknown>>,
  relationships: Array<Record<string, unknown>>,
  patterns: Array<Record<string, unknown>>,
  strongAnchors: Array<Record<string, unknown>> = []
): FileRecommendation[] {
  const terms = queryTerms(query);
  const coreTerms = queryCoreTerms(query);
  const recommendations = new Map<string, FileRecommendation>();
  const searchHitCounts = new Map<string, number>();
  const anchorHitCounts = new Map<string, number>();

  for (const anchor of strongAnchors) {
    const file = stringValue(anchor.file);
    if (!file) {
      continue;
    }

    const recommendation = getRecommendation(recommendations, file);
    recommendation.strongAnchor = genericBaseTypePenalty(file, query) === 0;
    const matchedConcepts = Array.isArray(anchor.matchedConcepts)
      ? anchor.matchedConcepts.filter((term): term is string => typeof term === "string")
      : [];
    const previousAnchors = anchorHitCounts.get(file) ?? 0;
    anchorHitCounts.set(file, previousAnchors + 1);
    recommendation.score += previousAnchors === 0
      ? 25 + matchedConcepts.length * 2 + strongAnchorRoleBoost(anchor)
      : 3;
    addReason(recommendation, `Strong symbol anchor: ${stringValue(anchor.name) || stringValue(anchor.id)}.`);
    recommendation.anchorDetails.push({ id: anchor.id, name: anchor.name, file: anchor.file, range: anchor.range });
    addTerms(recommendation, matchedConcepts);
  }

  for (const row of searchRows) {
    const file = stringValue(row.path);
    if (!file) {
      continue;
    }

    const recommendation = getRecommendation(recommendations, file);
    const haystack = [row.title, row.body, row.path].map(stringValue).join(" ").toLowerCase();
    const matchedTerms = terms.filter((term) => haystack.includes(term));
    const previousHits = searchHitCounts.get(file) ?? 0;
    searchHitCounts.set(file, previousHits + 1);
    recommendation.searchEvidenceCount += 1;
    recommendation.score += previousHits === 0 ? 3 + matchedTerms.length : Math.min(2, 0.75 + matchedTerms.length * 0.25);
    addReason(recommendation, `Search ${stringValue(row.recordType) || "record"}: ${stringValue(row.title) || stringValue(row.recordId)}${matchedTerms.length ? `; matched ${matchedTerms.join(", ")}` : ""}.`);
    addTerms(recommendation, matchedTerms);
  }

  for (const relationship of relationships) {
    const file = stringValue(relationship.file);
    if (!file) {
      continue;
    }

    const recommendation = getRecommendation(recommendations, file);
    const type = stringValue(relationship.type);
    recommendation.score += relationshipWeight(type);
    recommendation.relationshipEvidenceCount += 1;
    recommendation.relationshipDetails.push({
      type: relationship.type,
      from: relationship.from,
      to: relationship.to,
      file: relationship.file,
      range: relationship.range
    });
    addReason(recommendation, relationshipRecommendationReason(relationship));
    addTerms(recommendation, terms.filter((term) => JSON.stringify(relationship).toLowerCase().includes(term)));
  }

  for (const pattern of patterns) {
    const patternName = stringValue(pattern.name) || stringValue(pattern.id);
    const instances = Array.isArray(pattern.instances) ? pattern.instances as Array<Record<string, unknown>> : [];
    for (const instance of instances) {
      const files = Array.isArray(instance.files) ? instance.files.filter((file): file is string => typeof file === "string") : [];
      const instanceHaystack = JSON.stringify(instance).toLowerCase();
      for (const file of files) {
        if (!recommendations.has(file) && terms.length > 0 && !textMatchesAnyTerm(`${file} ${instanceHaystack}`, terms)) {
          continue;
        }

        const recommendation = getRecommendation(recommendations, file);
        recommendation.score += 3 + numberValue(pattern.confidence) * 2;
        addReason(recommendation, `Follows detected pattern: ${patternName}.`);
        addPattern(recommendation, `${patternName}: ${stringValue(pattern.agentGuidance)}`);
      }
    }
  }

  for (const recommendation of recommendations.values()) {
    const distinctCoreMatches = coreTerms.filter((term) => recommendation.matchedTerms.includes(term)).length;
    recommendation.score += distinctCoreMatches * 2.5 + (distinctCoreMatches >= 3 ? 4 : 0);
    recommendation.score += roleWeight(recommendation.file, query);
    const compositionPenalty = compositionRootPenalty(recommendation.file, query);
    if (compositionPenalty > 0) {
      recommendation.score -= compositionPenalty;
      addReason(recommendation, "Composition root; inspect only when the request is about startup, DI, routing, middleware, or config.");
    }
    if (isLikelyTestFile(recommendation.file)) {
      recommendation.score -= 3;
      addReason(recommendation, "Likely test file; use for validation unless the requested change is test-specific.");
    }
    const baseTypePenalty = genericBaseTypePenalty(recommendation.file, query);
    if (baseTypePenalty > 0) {
      recommendation.score -= baseTypePenalty;
      addReason(recommendation, "Shared base type; inspect after the feature-specific controller, view, model, or service unless changing shared behavior.");
    }
    recommendation.reasons = recommendation.reasons
      .sort((left, right) => reasonPriority(left) - reasonPriority(right))
      .slice(0, 4);
    recommendation.patternsToFollow = recommendation.patternsToFollow.slice(0, 3);
    recommendation.matchedTerms = recommendation.matchedTerms.slice(0, 8);
  }

  return [...recommendations.values()]
    .filter((recommendation) => recommendation.score > 0)
    .filter((recommendation) => Boolean(recommendation.strongAnchor) || recommendation.relationshipEvidenceCount > 0 || recommendation.searchEvidenceCount > 0)
    .filter((recommendation) => !/(^|\/)PageController\.cs$/i.test(recommendation.file) || recommendation.relationshipEvidenceCount > 0)
    .sort((left, right) => Number(Boolean(right.strongAnchor)) - Number(Boolean(left.strongAnchor)) || right.score - left.score || left.file.localeCompare(right.file));
}

function buildWhereToAddCaveats(query: string, recommendations: FileRecommendation[], relationships: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const caveats: Array<Record<string, unknown>> = [];
  if (isBroadWhereToAddQuery(query)) {
    caveats.push({
      recordType: "caveat",
      message: "Query is broad. Treat these as starting points and retry with a specific feature, field, route, error, or UI action before editing."
    });
  }

  if (recommendations.length === 0) {
    caveats.push({
      recordType: "caveat",
      message: "No high-confidence edit location found. Run broader project and search queries before editing."
    });
  }

  if (!hasConnectedFeatureEvidence(relationships)) {
    caveats.push({
      recordType: "caveat",
      message: "No connected controller/UI/service flow was found. Treat recommendations as text-and-pattern hints, not a complete feature path."
    });
  }

  const generatedFiles = recommendations.filter((recommendation) => /(^|\/)(bin|obj|dist|build|generated)(\/|$)/i.test(recommendation.file));
  if (generatedFiles.length > 0) {
    caveats.push({
      recordType: "caveat",
      message: `Avoid editing generated/build outputs: ${generatedFiles.map((file) => file.file).join(", ")}.`
    });
  }

  if (hasIncompleteBrowserQueryState(query, relationships)) {
    caveats.push({
      recordType: "caveat",
      message: "Query-string read behavior was found, but no query-string write edge was detected. Treat this as an incomplete browser-state lifecycle and inspect the top JavaScript file before editing."
    });
  }

  return caveats;
}

function buildPatternFitEvidence(patterns: Array<Record<string, unknown>>, recommendations: FileRecommendation[]): Array<Record<string, unknown>> {
  if (!patterns.length || !recommendations.length) {
    return [];
  }

  const recommendedFiles = new Set(recommendations.map((recommendation) => recommendation.file));
  const ranked = patterns
    .map((pattern) => {
      const instances = Array.isArray(pattern.instances) ? pattern.instances as Array<Record<string, unknown>> : [];
      const exampleFiles = uniqueStrings(instances.flatMap((instance) =>
        Array.isArray(instance.files) ? instance.files.filter((file): file is string => typeof file === "string") : []
      ));
      const matchedFiles = exampleFiles.filter((file) => recommendedFiles.has(file));
      const score = matchedFiles.length * 10 + numberValue(pattern.confidence) * 3 + Math.min(3, numberValue(pattern.frequency));
      return { pattern, exampleFiles, matchedFiles, score };
    })
    .filter((entry) => entry.exampleFiles.length > 0)
    .sort((left, right) =>
      right.score - left.score ||
      numberValue(right.pattern.confidence) - numberValue(left.pattern.confidence) ||
      stringValue(left.pattern.name).localeCompare(stringValue(right.pattern.name))
    );

  const best = ranked[0];
  if (!best) {
    return [];
  }

  return [{
    recordType: "patternFit",
    patternId: best.pattern.id,
    patternName: best.pattern.name,
    category: best.pattern.category,
    confidence: best.pattern.confidence,
    frequency: best.pattern.frequency,
    guidance: best.pattern.agentGuidance,
    matchedFiles: best.matchedFiles.slice(0, 5),
    exampleFiles: best.exampleFiles.slice(0, 5),
    message: best.matchedFiles.length
      ? `Recommended files overlap the ${stringValue(best.pattern.name) || "detected"} pattern.`
      : `Closest detected pattern is ${stringValue(best.pattern.name) || stringValue(best.pattern.id)}.`
  }];
}

function calculateWhereToAddConfidence(query: string, recommendations: FileRecommendation[], relationships: Array<Record<string, unknown>>): number {
  if (recommendations.length === 0) {
    return 0.2;
  }

  const terms = queryCoreTerms(query);
  const matched = new Set(recommendations[0].matchedTerms);
  const coveredTerms = terms.filter((term) => matched.has(term));
  const coverage = terms.length ? coveredTerms.length / terms.length : 0;
  let confidence = 0.4 + Math.min(0.25, recommendations[0].score / 50);

  if (coverage >= 0.6) {
    confidence += 0.15;
  } else if (coverage >= 0.35) {
    confidence += 0.05;
  } else {
    confidence -= 0.1;
  }

  if (hasConnectedFeatureEvidence(relationships)) {
    confidence += 0.1;
  } else {
    confidence = Math.min(confidence, 0.65);
  }

  if (isBroadWhereToAddQuery(query)) {
    confidence = Math.min(confidence, 0.6);
  }

  if (hasIncompleteBrowserQueryState(query, relationships)) {
    confidence = Math.min(confidence, 0.65);
  }

  return Math.max(0.25, Math.min(0.9, Math.round(confidence * 100) / 100));
}

function hasConnectedFeatureEvidence(relationships: Array<Record<string, unknown>>): boolean {
  const connectedTypes = new Set([
    "CALLS",
    "POSTS_TO",
    "MAPS_ROUTE",
    "INJECTS",
    "HANDLES_EVENT",
    "READS_QUERY_STRING",
    "WRITES_QUERY_STRING",
    "WRITES_BROWSER_HISTORY",
    "INVOKES_VIEW_COMPONENT",
    "RENDERS_VIEW"
  ]);
  return relationships.some((relationship) => connectedTypes.has(stringValue(relationship.type)));
}

function hasIncompleteBrowserQueryState(query: string, relationships: Array<Record<string, unknown>>): boolean {
  if (!queryWantsBrowserQueryState(query.toLowerCase())) {
    return false;
  }

  const types = new Set(relationships.map((relationship) => stringValue(relationship.type)));
  return types.has("READS_QUERY_STRING") && !types.has("WRITES_QUERY_STRING");
}

function assessExistingCapabilityEvidence(query: string, relationships: Array<Record<string, unknown>>): { answerPrefix: string; evidence: Array<Record<string, unknown>> } {
  const types = new Set(relationships.map((relationship) => stringValue(relationship.type)));
  if (queryWantsBrowserQueryWrite(query.toLowerCase()) && !types.has("WRITES_QUERY_STRING") && !types.has("WRITES_BROWSER_HISTORY")) {
    return {
      answerPrefix: "",
      evidence: [{
        recordType: "capabilityAssessment",
        status: "adjacent-only",
        message: "Related browser query-state reads were found, but no browser URL write operation was detected. Treat this as a missing capability, not an existing implementation.",
        layers: ["browser-query-read"]
      }]
    };
  }
  const haystack = relationships.map((relationship) => JSON.stringify(relationship).toLowerCase()).join("\n");
  const domainTerms = domainFlowTerms(queryTerms(query));
  const hasDomainEvidence = domainTerms.length === 0 || domainTerms.some((term) => haystack.includes(term));
  const hasUiEvidence = ["HANDLES_EVENT", "SELECTS_ELEMENT", "WRITES_FIELD", "BINDS_MODEL_PROPERTY"].some((type) => types.has(type));
  const hasMappingEvidence = ["USES_CSHARP_SYMBOL", "BINDS_MODEL_PROPERTY", "MAPS_PROPERTY", "WRITES_FIELD"].some((type) => types.has(type));
  const hasRenderEvidence = ["INVOKES_VIEW_COMPONENT", "RENDERS_VIEW"].some((type) => types.has(type));

  if (!hasDomainEvidence || !hasUiEvidence || !hasMappingEvidence || !hasRenderEvidence) {
    return { answerPrefix: "", evidence: [] };
  }

  return {
    answerPrefix: `Existing implementation evidence found for "${query}" across UI binding, model/config mapping, and rendering. Treat this as a gap-analysis query before adding duplicate behavior. `,
    evidence: [{
      recordType: "capabilityAssessment",
      status: "likely-existing-or-partial",
      message: "Atlas found connected UI, model/config, and rendering evidence. Inspect the recommended files for missing UX or integration gaps before creating a new implementation.",
      layers: ["ui-binding", "model-or-config-mapping", "rendering"]
    }]
  };
}

function rankSearchRowsForAgent(query: string, rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
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

function isWeakMultiTermSearch(query: string, rows: Array<Record<string, unknown>>): boolean {
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

function assessFlowCoverage(query: string, flow: Array<Record<string, unknown>>, exactAnchors: string[]): {
  confidence: number;
  evidence: Record<string, unknown>;
  caveats: Array<Record<string, unknown>>;
} {
  const concepts = queryCoreTerms(query);
  const haystack = `${JSON.stringify(flow).toLowerCase()} ${flowSemanticCoverageTerms(flow)}`;
  const matchedConcepts = concepts.filter((concept) => haystack.includes(concept));
  const missingConcepts = concepts.filter((concept) => !haystack.includes(concept));
  const featureCoverage = concepts.length ? matchedConcepts.length / concepts.length : 0;
  const perEdgeCoverage = flow.map((edge) => {
    const edgeText = JSON.stringify(edge).toLowerCase();
    return concepts.length ? concepts.filter((concept) => edgeText.includes(concept)).length / concepts.length : 0;
  }).sort((left, right) => right - left);
  const strongestEdges = perEdgeCoverage.slice(0, Math.min(3, perEdgeCoverage.length));
  const textSimilarity = strongestEdges.length ? strongestEdges.reduce((sum, score) => sum + score, 0) / strongestEdges.length : 0;
  const graphConnectivity = flowGraphConnectivity(flow);
  const missingAnchors = exactAnchors.filter((anchor) => !flow.some((edge) => relationshipContainsText(edge, anchor)));

  let confidence = 0.15 + featureCoverage * 0.45 + graphConnectivity * 0.2 + textSimilarity * 0.15;
  if (featureCoverage < 0.35) {
    confidence = Math.min(confidence, 0.4);
  } else if (featureCoverage < 0.6) {
    confidence = Math.min(confidence, 0.6);
  }
  if (missingAnchors.length) {
    confidence = Math.min(confidence, 0.4);
  }
  if (hasIncompleteBrowserQueryState(query, flow)) {
    confidence = Math.min(confidence, 0.65);
  }
  confidence = Math.max(0.2, Math.min(0.9, Math.round(confidence * 100) / 100));

  const scores = {
    textSimilarity: Math.round(textSimilarity * 100) / 100,
    graphConnectivity: Math.round(graphConnectivity * 100) / 100,
    featureCoverage: Math.round(featureCoverage * 100) / 100
  };
  const caveats: Array<Record<string, unknown>> = [];
  if (missingConcepts.length && featureCoverage < 0.75) {
    caveats.push({
      recordType: "caveat",
      message: `Flow matched ${matchedConcepts.length}/${concepts.length} requested concepts. Missing: ${missingConcepts.join(", ")}. Treat this as a partial slice, not proof of the requested behavior.`
    });
  }
  if (hasIncompleteBrowserQueryState(query, flow)) {
    caveats.push({
      recordType: "caveat",
      message: "Browser query-state reads were found, but no browser URL writer was detected. API request query construction does not satisfy browser URL mutation."
    });
  }

  return {
    confidence,
    evidence: {
      recordType: "flowCoverage",
      matchedConcepts,
      missingConcepts,
      scores,
      message: `Feature coverage ${matchedConcepts.length}/${concepts.length}; graph connectivity ${Math.round(graphConnectivity * 100)}%.`
    },
    caveats
  };
}

function flowSemanticCoverageTerms(flow: Array<Record<string, unknown>>): string {
  const types = new Set(flow.map((edge) => stringValue(edge.type)));
  return [
    types.has("UPDATES_ELEMENT_STATE") ? "highlight highlighted selected selection dom element state" : "",
    types.has("SUBSCRIBES_EVENT") ? "event listener subscription click selection" : "",
    types.has("EMITS_EVENT") ? "event emission selection change" : ""
  ].filter(Boolean).join(" ");
}

function flowGraphConnectivity(flow: Array<Record<string, unknown>>): number {
  if (flow.length <= 1) {
    return flow.length;
  }

  const parent = new Map<string, string>();
  const find = (value: string): string => {
    const current = parent.get(value) ?? value;
    if (current === value) {
      parent.set(value, value);
      return value;
    }
    const root = find(current);
    parent.set(value, root);
    return root;
  };
  const union = (left: string, right: string): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent.set(rightRoot, leftRoot);
    }
  };

  for (const edge of flow) {
    const from = stringValue(edge.from);
    const to = stringValue(edge.to);
    if (from && to) {
      union(from, to);
    }
  }

  const componentEdges = new Map<string, number>();
  for (const edge of flow) {
    const endpoint = stringValue(edge.from) || stringValue(edge.to) || stringValue(edge.id);
    const root = endpoint ? find(endpoint) : stringValue(edge.id);
    componentEdges.set(root, (componentEdges.get(root) ?? 0) + 1);
  }

  return Math.max(...componentEdges.values(), 0) / flow.length;
}

function buildFlowCoverageCaveats(query: string, flow: Array<Record<string, unknown>>, exactAnchors: string[]): Array<Record<string, unknown>> {
  const caveats: Array<Record<string, unknown>> = [];
  if (exactAnchors.length) {
    const missingAnchors = exactAnchors.filter((anchor) => !flow.some((edge) => relationshipContainsText(edge, anchor)));
    if (missingAnchors.length) {
      caveats.push({
        recordType: "caveat",
        message: `No visible flow edge matched exact anchor(s): ${missingAnchors.join(", ")}. Treat generic matches as incomplete and retry with a required term, exact file, symbol, or relationship query.`
      });
    }
  }

  const lowerQuery = query.toLowerCase();
  if (/\b(persist|persistence|save|model binding|binding|configjson)\b/i.test(lowerQuery)) {
    const types = new Set(flow.map((edge) => stringValue(edge.type)));
    const missingLayers = [
      types.has("WRITES_FIELD") ? "" : "browser field write",
      types.has("BINDS_MODEL_PROPERTY") ? "" : "model binding",
      types.has("MAPS_PROPERTY") || types.has("WRITES") || types.has("CALLS_REPOSITORY") ? "" : "adapter or persistence mapping"
    ].filter(Boolean);
    if (missingLayers.length) {
      caveats.push({
        recordType: "caveat",
        message: `Flow coverage is incomplete for ${missingLayers.join(", ")}. Do not treat this as proof of an end-to-end persistence path.`
      });
    }
  }

  return caveats;
}

function composeFlowEdges(query: string, edges: Array<Record<string, unknown>>, exactAnchors: string[]): Array<Record<string, unknown>> {
  const ranked = anchorFlowEdges(rankFlowEdges(uniqueById(edges)), exactAnchors);
  const lowerQuery = query.toLowerCase();
  const persistenceQuery = /\b(persist|persistence|save|model binding|binding|configjson)\b/i.test(lowerQuery);
  const promotedTypes = persistenceQuery
    ? ["WRITES_FIELD", "BINDS_MODEL_PROPERTY", "MAPS_PROPERTY", "CALLS", "INVOKES_VIEW_COMPONENT", "RENDERS_VIEW"]
    : queryWantsBrowserQueryState(lowerQuery)
      ? ["WRITES_QUERY_STRING", "READS_QUERY_STRING", "WRITES_BROWSER_HISTORY", "CALLS", "UPDATES_ELEMENT_STATE"]
      : ["SUBSCRIBES_EVENT", "CALLS", "EMITS_EVENT", "UPDATES_ELEMENT_STATE", "POSTS_TO", "HANDLES_EVENT", "WRITES_FIELD", "USES_OPTIONS", "INVOKES_VIEW_COMPONENT", "RENDERS_VIEW"];
  const promoted: Array<Record<string, unknown>> = [];

  promoted.push(...promoteJavaScriptInteractionPath(ranked));

  for (const type of promotedTypes) {
    const candidates = ranked.filter((edge) => stringValue(edge.type) === type);
    const exactMatch = candidates.find((edge) => exactAnchors.some((anchor) => relationshipContainsText(edge, anchor)));
    const candidate = exactMatch ?? candidates[0];
    if (candidate) {
      promoted.push(candidate);
    }
  }

  return capRepeatedFlowNoise(uniqueById([...promoted, ...ranked])).slice(0, 30);
}

function promoteJavaScriptInteractionPath(edges: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const calls = edges.filter((edge) => stringValue(edge.type) === "CALLS");
  const emitters = edges.filter((edge) => stringValue(edge.type) === "EMITS_EVENT");
  const clickSubscriptions = edges.filter((edge) =>
    stringValue(edge.type) === "SUBSCRIBES_EVENT" && /click/i.test(`${stringValue(edge.to)} ${stringValue(edge.evidence)}`)
  );
  if (!calls.length || !emitters.length || !clickSubscriptions.length) {
    return [];
  }

  const emitterByNode = new Map(emitters.map((edge) => [stringValue(edge.from), edge]));
  let bestPath: Array<Record<string, unknown>> = [];
  let bestStart: Record<string, unknown> | undefined;
  for (const start of clickSubscriptions) {
    const path = findCallPathToEmitter(stringValue(start.from), calls, emitterByNode, 4);
    if (path.length > bestPath.length) {
      bestPath = path;
      bestStart = start;
    }
  }
  if (!bestStart || !bestPath.length) {
    return [];
  }

  const terminalNode = stringValue(bestPath[bestPath.length - 1].to);
  const emitted = emitterByNode.get(terminalNode);
  const terminalCaller = stringValue(bestPath[bestPath.length - 1].from);
  const siblingCalls = calls.filter((edge) =>
    stringValue(edge.from) === terminalCaller && !bestPath.includes(edge)
  ).sort((left, right) => javascriptInteractionCallWeight(left) - javascriptInteractionCallWeight(right));
  const eventId = emitted ? stringValue(emitted.to) : "";
  const subscriptions = eventId
    ? edges.filter((edge) => stringValue(edge.type) === "SUBSCRIBES_EVENT" && stringValue(edge.to) === eventId && edge !== bestStart)
    : [];
  const subscriptionNodes = new Set(subscriptions.map((edge) => stringValue(edge.from)));
  const subscriptionCallers = calls.filter((edge) => subscriptionNodes.has(stringValue(edge.to)));
  const pathNodes = new Set([
    stringValue(bestStart.from),
    ...bestPath.flatMap((edge) => [stringValue(edge.from), stringValue(edge.to)]),
    ...subscriptionCallers.map((edge) => stringValue(edge.from))
  ]);
  const updates = edges.filter((edge) => stringValue(edge.type) === "UPDATES_ELEMENT_STATE" && pathNodes.has(stringValue(edge.from)));
  const updatingNodes = new Set(updates.map((edge) => stringValue(edge.from)));
  const prioritizedSubscriptionCallers = [...subscriptionCallers].sort((left, right) =>
    Number(updatingNodes.has(stringValue(right.from))) - Number(updatingNodes.has(stringValue(left.from)))
  );

  return uniqueById([bestStart, ...bestPath, ...siblingCalls.slice(0, 1), ...(emitted ? [emitted] : []), ...subscriptions.slice(0, 2), ...prioritizedSubscriptionCallers.slice(0, 1), ...updates.slice(0, 1)]);
}

function javascriptInteractionCallWeight(edge: Record<string, unknown>): number {
  const text = `${stringValue(edge.to)} ${stringValue(edge.evidence)}`;
  if (/\b(focus|select|highlight|toggle)/iu.test(text)) {
    return 0;
  }
  if (/\b(open|show|render|update)/iu.test(text)) {
    return 1;
  }
  return 5;
}

function findCallPathToEmitter(
  start: string,
  calls: Array<Record<string, unknown>>,
  emitters: Map<string, Record<string, unknown>>,
  maxDepth: number
): Array<Record<string, unknown>> {
  const queue: Array<{ node: string; path: Array<Record<string, unknown>> }> = [{ node: start, path: [] }];
  const visitedDepth = new Map<string, number>([[start, 0]]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.path.length > 0 && emitters.has(current.node)) {
      return current.path;
    }
    if (current.path.length >= maxDepth) {
      continue;
    }
    for (const edge of calls.filter((candidate) => stringValue(candidate.from) === current.node)) {
      const next = stringValue(edge.to);
      const depth = current.path.length + 1;
      if (!next || (visitedDepth.get(next) ?? Number.POSITIVE_INFINITY) <= depth) {
        continue;
      }
      visitedDepth.set(next, depth);
      queue.push({ node: next, path: [...current.path, edge] });
    }
  }
  return [];
}

function anchorFlowEdges(edges: Array<Record<string, unknown>>, exactAnchors: string[]): Array<Record<string, unknown>> {
  if (exactAnchors.length === 0 || edges.length === 0) {
    return edges;
  }

  const anchored = edges.filter((edge) => exactAnchors.some((anchor) => relationshipContainsText(edge, anchor)));
  if (anchored.length === 0) {
    return edges;
  }

  const anchoredEndpoints = new Set(anchored.flatMap((edge) => [stringValue(edge.from), stringValue(edge.to)]).filter(Boolean));
  const adjacent = edges.filter((edge) => !anchored.includes(edge) && (anchoredEndpoints.has(stringValue(edge.from)) || anchoredEndpoints.has(stringValue(edge.to))));
  return uniqueById([...anchored, ...adjacent, ...edges.filter((edge) => exactAnchors.some((anchor) => fileOrEndpointContainsAnchor(edge, anchor)))]);
}

function exactIdentifierAnchors(query: string): string[] {
  const rawTerms = query
    .split(/[^A-Za-z0-9_]+/u)
    .map((term) => term.trim())
    .filter(Boolean);
  const generic = new Set(["model", "binding", "persistence", "persist", "save", "rendering", "editing", "image", "images", "carousel", "carousels"]);
  return uniqueStrings(rawTerms.filter((term) => {
    const lower = term.toLowerCase();
    return !generic.has(lower) && (/[a-z][A-Z]/.test(term) || /json|config|sid|dto|viewmodel|request|response/i.test(term) || term.length >= 12);
  }));
}

function semanticFlowAnchors(query: string): string[] {
  const lower = query.toLowerCase();
  const anchors: string[] = [];
  if (/\b(query string|query-string|location search|browser history|url search params)\b/.test(lower)) {
    anchors.push("browser-state:query-string");
  }
  return anchors;
}

function relationshipContainsText(edge: Record<string, unknown>, text: string): boolean {
  return JSON.stringify(edge).toLowerCase().includes(text.toLowerCase());
}

function fileOrEndpointContainsAnchor(edge: Record<string, unknown>, anchor: string): boolean {
  const lowerAnchor = anchor.toLowerCase();
  return [edge.file, edge.from, edge.to].some((value) => stringValue(value).toLowerCase().includes(lowerAnchor));
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

function relationshipTermScore(row: Record<string, unknown>, terms: string[]): number {
  const haystack = [row.from_id, row.to_id, row.type, row.file, row.json].map(stringValue).join(" ").toLowerCase();
  const matchedTerms = terms.filter((term) => haystack.includes(term));
  return matchedTerms.length * 10 + relationshipWeight(stringValue(row.type));
}

function isBroadWhereToAddQuery(query: string): boolean {
  return queryTerms(query).length <= 1;
}

function queryCoreTerms(query: string): string[] {
  const stopWords = new Set(["add", "new", "the", "for", "and", "with", "field", "property", "feature", "change", "update", "keep", "when", "while", "truthful"]);
  if (queryWantsBrowserQueryState(query.toLowerCase())) {
    stopWords.add("string");
  }
  return uniqueStrings(query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !stopWords.has(term)));
}

function queryTerms(query: string): string[] {
  const terms = queryCoreTerms(query);
  return uniqueStrings(terms.flatMap((term) => [term, ...termVariants(term)]));
}

function termVariants(term: string): string[] {
  if (term.length > 4 && term.endsWith("ies")) {
    return [`${term.slice(0, -3)}y`];
  }
  if (term.length > 4 && term.length <= 10 && term.endsWith("s") && !term.endsWith("ss")) {
    return [term.slice(0, -1)];
  }

  return [];
}

function conceptMatchesText(concept: string, text: string): boolean {
  if (text.includes(concept)) {
    return true;
  }
  return termVariants(concept).some((variant) => text.includes(variant));
}

function queryVariants(query: string): string[] {
  const terms = queryTerms(query);
  if (terms.length <= 1) {
    return [query].filter(Boolean);
  }

  const dashed = terms.join("-");
  const compact = terms.join("");
  const pascal = terms.map((term) => `${term.slice(0, 1).toUpperCase()}${term.slice(1)}`).join("");
  return uniqueStrings([query, dashed, compact, pascal]);
}

function inferProjectNameFromFile(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, "/");
  const firstSegment = normalized.split("/")[0];
  return firstSegment && firstSegment !== normalized ? firstSegment : undefined;
}

function inferProjectNameFromSymbol(symbolId: string): string | undefined {
  if (symbolId.startsWith("symbol:csharp:")) {
    const body = symbolId.slice("symbol:csharp:".length);
    return body.split(".")[0] || undefined;
  }

  if (symbolId.startsWith("symbol:dotnet-project:")) {
    const projectPath = symbolId.slice("symbol:dotnet-project:".length);
    return projectPath.split("/")[0] || undefined;
  }

  return undefined;
}

function normalizeQueryContext(projectContext: string | undefined): QueryContext | undefined {
  const trimmed = projectContext?.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed.replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/+$/u, "");
  const lastSegment = normalized.split("/").filter(Boolean).pop() ?? normalized;
  const name = lastSegment.endsWith(".csproj") ? lastSegment.slice(0, -".csproj".length) : lastSegment;
  if (!name) {
    return undefined;
  }

  return {
    input: trimmed,
    name,
    filePrefix: normalized.endsWith(".csproj") ? normalized.split("/").slice(0, -1).join("/") || name : name,
    symbolPrefix: `symbol:csharp:${name}.`,
    projectSymbolPrefix: `symbol:dotnet-project:${name}/`
  };
}

function contextFromProjectSymbol(name: string, file: string): QueryContext | undefined {
  const normalizedFile = file.replace(/\\/g, "/");
  const folder = normalizedFile.endsWith(".csproj") ? normalizedFile.split("/").slice(0, -1).join("/") : "";
  return normalizeQueryContext(folder || name);
}

function uniqueContexts(contexts: QueryContext[]): QueryContext[] {
  const seen = new Set<string>();
  const unique: QueryContext[] = [];
  for (const context of contexts) {
    const key = context.filePrefix.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(context);
    }
  }

  return unique;
}

function resolveContextCandidate(requested: QueryContext, candidates: QueryContext[]): { context?: QueryContext; ambiguity?: QueryContext[] } {
  const scored = candidates
    .map((candidate) => ({ candidate, score: contextMatchScore(requested, candidate) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.candidate.filePrefix.length - right.candidate.filePrefix.length);

  const top = scored[0];
  if (!top) {
    return {};
  }

  const closeMatches = scored.filter((entry) => entry.score === top.score || top.score - entry.score <= 10);
  if (top.score < 100 && closeMatches.length > 1) {
    return { ambiguity: closeMatches.map((entry) => entry.candidate) };
  }

  const exactMatches = scored.filter((entry) => entry.score === 100);
  if (exactMatches.length > 1) {
    return { ambiguity: exactMatches.map((entry) => entry.candidate) };
  }

  return { context: top.candidate };
}

function contextMatchScore(requested: QueryContext, candidate: QueryContext): number {
  const requestedValues = contextMatchValues(requested);
  const candidateValues = contextMatchValues(candidate);
  let score = 0;

  for (const requestedValue of requestedValues) {
    for (const candidateValue of candidateValues) {
      if (requestedValue === candidateValue) {
        score = Math.max(score, 100);
      } else if (candidateValue.startsWith(requestedValue)) {
        score = Math.max(score, 80);
      } else if (candidateValue.includes(requestedValue)) {
        score = Math.max(score, 70);
      } else if (compactContextValue(candidateValue).includes(compactContextValue(requestedValue))) {
        score = Math.max(score, 60);
      }
    }
  }

  return score;
}

function contextMatchValues(context: QueryContext): string[] {
  return uniqueStrings([
    context.input,
    context.name,
    context.filePrefix,
    ...context.filePrefix.split("/"),
    path.basename(context.filePrefix)
  ].map((value) => value.toLowerCase()).filter(Boolean));
}

function compactContextValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
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

function scorePattern(pattern: Record<string, unknown>, terms: string[]): number {
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

function getRecommendation(recommendations: Map<string, FileRecommendation>, file: string): FileRecommendation {
  const existing = recommendations.get(file);
  if (existing) {
    return existing;
  }

  const recommendation: FileRecommendation = {
    recordType: "fileRecommendation",
    file,
    score: 0,
    reasons: [],
      matchedTerms: [],
      patternsToFollow: [],
      relationshipEvidenceCount: 0,
      searchEvidenceCount: 0,
      relationshipDetails: [],
      anchorDetails: []
  };
  recommendations.set(file, recommendation);
  return recommendation;
}

function looksLikeFileQuery(query: string): boolean {
  if (!query || /\s/u.test(query)) {
    return false;
  }
  if (query.includes("/")) {
    return true;
  }
  return /(?:^|\/)[^/]+\.(?:cs|cshtml|razor|js|mjs|cjs|jsx|ts|tsx|html?|css|scss|json|xml|csproj|sln|md|yml|yaml)$/iu.test(query);
}

function addReason(recommendation: FileRecommendation, reason: string): void {
  if (!recommendation.reasons.includes(reason)) {
    recommendation.reasons.push(reason);
  }
}

function reasonPriority(reason: string): number {
  if (/^[A-Z][A-Z_]+:/u.test(reason) || reason.startsWith("Strong symbol anchor:")) {
    return 0;
  }
  if (reason.startsWith("Search ")) {
    return 1;
  }
  if (reason.startsWith("Follows detected pattern:")) {
    return 3;
  }
  return 2;
}

function addPattern(recommendation: FileRecommendation, pattern: string): void {
  if (pattern && !recommendation.patternsToFollow.includes(pattern)) {
    recommendation.patternsToFollow.push(pattern);
  }
}

function addTerms(recommendation: FileRecommendation, terms: string[]): void {
  recommendation.matchedTerms = uniqueStrings([...recommendation.matchedTerms, ...terms]);
}

function textMatchesAnyTerm(text: string, terms: string[]): boolean {
  const haystack = text.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function relationshipWeight(type: string): number {
  const weights: Record<string, number> = {
    READS_QUERY_STRING: 6,
    WRITES_QUERY_STRING: 7,
    WRITES_BROWSER_HISTORY: 5,
    MAPS_ROUTE: 5,
    POSTS_TO: 5,
    CALLS: 4,
    INJECTS: 4,
    REGISTERS: 4,
    IMPLEMENTS: 3,
    USES_DBSET: 3,
    QUERIES: 4,
    WRITES: 5,
    CALLS_REPOSITORY: 4,
    VALIDATES: 5,
    USES_VALIDATOR: 4,
    REQUIRES_AUTH: 5,
    HANDLES_REQUEST: 5,
    RUNS_HOSTED_SERVICE: 5,
    USES_MIDDLEWARE: 4,
    DBSET_FOR: 3,
    BINDS_OPTIONS: 3,
    USES_OPTIONS: 3,
    USES_CONFIG_KEY: 2,
    PROJECT_REFERENCES: 3,
    HANDLES_EVENT: 3,
    EMITS_EVENT: 5,
    SUBSCRIBES_EVENT: 5,
    UPDATES_ELEMENT_STATE: 4,
    SELECTS_ELEMENT: 2,
    WRITES_FIELD: 4,
    BINDS_MODEL_PROPERTY: 4,
    MAPS_PROPERTY: 5,
    LOADS_SCRIPT: 2,
    CONTAINS: 1
  };
  return weights[type] ?? 1;
}

function relationshipRecommendationReason(relationship: Record<string, unknown>): string {
  const type = stringValue(relationship.type) || "RELATIONSHIP";
  const from = compactRelationshipEndpoint(stringValue(relationship.from));
  const to = compactRelationshipEndpoint(stringValue(relationship.to));
  const range = relationship.range && typeof relationship.range === "object" ? relationship.range as Record<string, unknown> : {};
  const line = numberValue(range.startLine);
  return `${type}: ${from} -> ${to}${line > 0 ? ` at line ${line}` : ""}.`;
}

function compactRelationshipEndpoint(value: string): string {
  const clean = value
    .replace(/^symbol:csharp:/u, "")
    .replace(/^symbol:(?:razor|javascript):/u, "")
    .replace(/^route:(?:csharp|web):/u, "");
  const parameterIndex = clean.indexOf("(");
  const withoutParameters = parameterIndex >= 0 ? clean.slice(0, parameterIndex) : clean;
  const parts = withoutParameters.split(/[/.]/u);
  const compact = parts.slice(-3).join(".") || value;
  return parameterIndex >= 0 ? `${compact}(...)` : compact;
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

function roleWeight(file: string, query: string): number {
  const normalized = file.replace(/\\/g, "/").toLowerCase();
  const lowerQuery = query.toLowerCase();
  const wantsValidation = queryWantsValidationOrAuth(lowerQuery);
  const wantsFormOrProfile = queryWantsFormOrProfile(lowerQuery);
  const wantsBrowserQueryState = queryWantsBrowserQueryState(lowerQuery);
  let score = 0;

  if (hasPathSegment(normalized, "controllers")) {
    score += lowerQuery.includes("endpoint") || lowerQuery.includes("route") || lowerQuery.includes("api") ? 8 : wantsValidation || wantsFormOrProfile ? 16 : 2;
  }
  if (isIdentityAccountPageModel(normalized)) {
    score += queryWantsIdentityAccountFlow(lowerQuery) ? 24 : 2;
  }
  if (hasPathSegment(normalized, "services")) {
    score += wantsValidation || wantsFormOrProfile ? 8 : 3;
  }
  if (hasPathSegment(normalized, "validation") || hasPathSegment(normalized, "validators") || normalized.endsWith("validator.cs")) {
    score += wantsValidation ? 80 : 3;
  }
  if (hasPathSegment(normalized, "handlers") || normalized.endsWith("handler.cs")) {
    score += lowerQuery.includes("handler") || lowerQuery.includes("command") || (lowerQuery.includes("query") && !wantsBrowserQueryState) ? 70 : lowerQuery.includes("request") ? 35 : 2;
  }
  if (hasPathSegment(normalized, "background") || normalized.endsWith("worker.cs") || normalized.endsWith("hostedservice.cs")) {
    score += lowerQuery.includes("background") || lowerQuery.includes("hosted") || lowerQuery.includes("worker") || lowerQuery.includes("digest") || lowerQuery.includes("sync") ? 70 : 2;
  }
  if (hasPathSegment(normalized, "middleware") || normalized.endsWith("middleware.cs")) {
    score += lowerQuery.includes("middleware") || lowerQuery.includes("pipeline") ? 70 : lowerQuery.includes("request") && !wantsValidation ? 12 : 2;
  }
  if (hasPathSegment(normalized, "repositories")) {
    score += lowerQuery.includes("field") || lowerQuery.includes("data") || lowerQuery.includes("persist") || lowerQuery.includes("save") ? 8 : 1;
  }
  if (hasPathSegment(normalized, "data")) {
    score += lowerQuery.includes("field") || lowerQuery.includes("data") || lowerQuery.includes("persist") || lowerQuery.includes("save") ? 36 : 1;
  }
  if (hasPathSegment(normalized, "options") || normalized.endsWith("options.cs")) {
    score += lowerQuery.includes("setting") || lowerQuery.includes("config") || lowerQuery.includes("option") ? 22 : 2;
  }
  if (wantsBrowserQueryState && /\.(?:js|mjs|cjs)$/i.test(normalized)) {
    score += 20;
  }
  if (normalized.endsWith("program.cs")) {
    score += queryWantsCompositionRoot(lowerQuery) ? 28 : 0;
  }
  if (hasPathSegment(normalized, "models") || /model\.cs$/i.test(normalized) || /request\.cs$/i.test(normalized)) {
    score += wantsValidation || wantsFormOrProfile ? 18 : 1;
  }
  if (wantsFormOrProfile && /(?:^|\/|\.)(forms?|profile|profiles|account|identity|registration|register)(?:\/|\.|$|[a-z])/i.test(normalized)) {
    score += 18;
  }
  if (hasPathSegment(normalized, "views") || normalized.endsWith(".cshtml") || normalized.endsWith(".html")) {
    score += wantsFormOrProfile ? 30 : lowerQuery.includes("form") || lowerQuery.includes("field") || lowerQuery.includes("ui") ? 25 : 1;
  }
  if (hasPathSegment(normalized, "wwwroot") || normalized.endsWith(".js")) {
    score += lowerQuery.includes("button") || lowerQuery.includes("form") || lowerQuery.includes("ajax") || lowerQuery.includes("fetch") ? 8 : 1;
  }

  return score;
}

function isIdentityAccountPageModel(normalizedFile: string): boolean {
  return /(^|\/)areas\/identity\/pages\/account\//.test(normalizedFile) && normalizedFile.endsWith(".cshtml.cs");
}

function queryWantsIdentityAccountFlow(lowerQuery: string): boolean {
  return /\b(user|account|identity|register|registration|login|external|profile|persona|create|creation|initial|setup|sign)\b/i.test(lowerQuery);
}

function queryWantsBrowserQueryState(lowerQuery: string): boolean {
  return /\b(query string|query-string|location search|browser history|url search params|urlsearchparams)\b/i.test(lowerQuery);
}

function queryWantsJavaScriptInteraction(lowerQuery: string): boolean {
  return /\b(click|highlight|dom|browser|javascript|client-side|event|selection|selected)\b/u.test(lowerQuery)
    && /\b(map|result|controller|button|element|search|selection|selected)\b/u.test(lowerQuery);
}

function isJavaScriptAnchor(anchor: Record<string, unknown>): boolean {
  return stringValue(anchor.id).startsWith("symbol:javascript:")
    || /\.(?:js|mjs|cjs)$/iu.test(stringValue(anchor.file));
}


function queryWantsBrowserQueryWrite(lowerQuery: string): boolean {
  return queryWantsBrowserQueryState(lowerQuery) && /\b(write|writes|writing|change|changes|update|updates|sync|store|persist|push|replace|add|set)\b/i.test(lowerQuery);
}

function compositionRootPenalty(file: string, query: string): number {
  const normalized = file.replace(/\\/g, "/").toLowerCase();
  if (!/(^|\/)(program|startup)\.cs$/.test(normalized)) {
    return 0;
  }

  const lowerQuery = query.toLowerCase();
  if (queryWantsCompositionRoot(lowerQuery)) {
    return 0;
  }

  return queryWantsValidationOrAuth(lowerQuery) || queryWantsFormOrProfile(lowerQuery) || queryWantsIdentityAccountFlow(lowerQuery) ? 90 : 28;
}

function genericBaseTypePenalty(file: string, query: string): number {
  const normalized = file.replace(/\\/g, "/").toLowerCase();
  if (!/(basecontroller|controllerbase|base\.cs$|base\/)/i.test(normalized)) {
    return 0;
  }

  return /\b(base|shared|abstract|infrastructure|framework|composable|editor)\b/i.test(query) ? 0 : 36;
}

function queryWantsCompositionRoot(lowerQuery: string): boolean {
  if (/\b(startup|program|middleware|pipeline|route|routing|endpoint|config|configuration|setting|settings|option|options|hosted|worker)\b/i.test(lowerQuery)) {
    return true;
  }

  const mentionsRegistration = /\b(register|registered|registering|registration)\b/i.test(lowerQuery);
  const mentionsComposition = /\b(di|dependency|dependencies|inject|injection|service|services|container|composition)\b/i.test(lowerQuery);
  return mentionsRegistration && mentionsComposition;
}

function queryWantsValidationOrAuth(lowerQuery: string): boolean {
  return /\b(valid|validate|validation|validator|rule|rules|auth|authorize|authorization|policy|permission|required)\b/i.test(lowerQuery);
}

function queryWantsFormOrProfile(lowerQuery: string): boolean {
  return /\b(form|forms|field|fields|input|inputs|view|views|ui|profile|persona|setup|registration|register|account)\b/i.test(lowerQuery);
}

function hasPathSegment(file: string, segment: string): boolean {
  return file.split("/").includes(segment);
}

function isLikelyTestFile(file: string): boolean {
  return /(^|\/)(test|tests|specs?)(\/|$)|(\.|-)(test|spec)\./i.test(file.replace(/\\/g, "/"));
}

function placeholders(count: number): string {
  return new Array(Math.max(count, 1)).fill("?").join(", ");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function mergeSearchRows(...groups: Array<Array<Record<string, unknown>>>): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  return groups.flat().filter((row) => {
    const id = stringValue(row.record_id);
    if (!id || seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

function uniqueById(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const unique: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const id = stringValue(row.id) || JSON.stringify(row);
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(row);
    }
  }

  return unique;
}
