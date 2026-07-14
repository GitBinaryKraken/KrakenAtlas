import * as path from "path";
import { Database } from "sql.js";
import { openSqliteIndex } from "../storage/sqliteIndex";
import { findSymbolsQuery, getProjectQuery } from "./queryBasic";
import {
  contextFromProjectSymbol,
  normalizeQueryContext,
  resolveContextCandidate,
  uniqueContexts
} from "./queryContext";
import {
  compactResponse,
  relationshipEvidence,
  relationshipFiles,
  strongAnchorEvidence
} from "./queryEvidence";
import {
  anchorFlowEdges,
  assessFlowCoverage,
  buildFlowCoverageCaveats,
  composeFlowEdges,
  exactIdentifierAnchors,
  hasIncompleteBrowserQueryState,
  isCommonExternalSymbol,
  isRelevantFlowEdge,
  promoteJavaScriptInteractionPath,
  rankFlowEdges,
  relationshipMatchesCrossContextAnchor,
  semanticFlowAnchors
} from "./queryFlow";
import {
  findConfigurationFlowContext,
  findDataFlowContext,
  findLayeredFlowContext,
  findProjectReferenceFlowContext,
  findPropertyBridgeFlowContext,
  findRequestedPropertyFlowContext
} from "./queryFlowContext";
import { withEndpointLocations } from "./queryNodeLocations";
import {
  findReferencesQuery,
  findRelationshipsQuery,
  relationshipNextQueries
} from "./queryRelationships";
import { strongAnchorRoleBoost } from "./queryScoring";
import {
  findSearchQuery,
  rankSearchRowsForAgent,
  relationshipTermScore
} from "./querySearch";
import {
  conceptMatchesText,
  queryCoreTerms,
  queryTerms,
  queryVariants,
  queryWantsBrowserQueryState,
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
  numberValue,
  placeholders,
  stringValue,
  uniqueById,
  uniqueStrings
} from "./queryUtils";

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
    return getProjectQuery(query, {
      ambiguousContextResponse: (queryType, currentQuery) => this.ambiguousContextResponse(queryType, currentQuery),
      execJson: (sql, params) => this.execJson(sql, params),
      execRows: (sql, params) => this.execRows(sql, params)
    });
  }

  public findSymbols(query: string): QueryResponse {
    return findSymbolsQuery(query, {
      ambiguousContextResponse: (queryType, currentQuery) => this.ambiguousContextResponse(queryType, currentQuery),
      execJson: (sql, params) => this.execJson(sql, params),
      symbolContextWhere: (prefix) => this.symbolContextWhere(prefix)
    });
  }

  public findReferences(query: string): QueryResponse {
    return findReferencesQuery(query, this.relationshipQueryDependencies());
  }

  public findRelationships(query: string, options: RelationshipQueryOptions = {}): QueryResponse {
    return findRelationshipsQuery(query, options, this.relationshipQueryDependencies());
  }

  private relationshipQueryDependencies() {
    return {
      ambiguousContextResponse: (queryType: string, currentQuery: string) => this.ambiguousContextResponse(queryType, currentQuery),
      execJson: (sql: string, params?: unknown[]) => this.execJson(sql, params),
      execRows: (sql: string, params?: unknown[]) => this.execRows(sql, params),
      findSearchRowsByTerms: (currentQuery: string, limit: number) => this.findSearchRowsByTerms(currentQuery, limit),
      findSymbolIds: (currentQuery: string) => this.findSymbolIds(currentQuery),
      hasQueryContext: Boolean(this.queryContext),
      queryContextName: this.queryContext?.name,
      referenceContextWhere: (prefix: "AND" | "WHERE") => this.referenceContextWhere(prefix),
      relationshipContextWhere: (prefix: "AND" | "WHERE") => this.relationshipContextWhere(prefix),
      relationshipMatchesContext: (row: Record<string, unknown>) => this.relationshipMatchesContext(row),
      withEndpointLocations: (rows: Array<Record<string, unknown>>) => withEndpointLocations(rows, this.endpointLocationDependencies())
    };
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
    const flowContext = this.flowContextDependencies();
    const layeredContext = preferJavaScript ? [] : findLayeredFlowContext(query, coreFlow, terms, flowContext);
    const configurationContext = preferJavaScript ? [] : findConfigurationFlowContext(coreFlow, terms, flowContext);
    const propertyBridgeContext = preferJavaScript ? [] : findPropertyBridgeFlowContext([...coreFlow, ...layeredContext], flowContext);
    const requestedPropertyContext = preferJavaScript ? [] : findRequestedPropertyFlowContext(exactAnchors, flowContext);
    const dataFlowContext = preferJavaScript ? [] : findDataFlowContext([...coreFlow, ...propertyBridgeContext], terms, flowContext);
    const projectReferences = preferJavaScript ? [] : findProjectReferenceFlowContext(coreFlow, flowContext);
    const flowEdges = composeFlowEdges(query, [
      ...coreFlow,
      ...requestedPropertyContext,
      ...layeredContext,
      ...propertyBridgeContext,
      ...configurationContext,
      ...dataFlowContext,
      ...projectReferences
    ], exactAnchors);
    const flow = withEndpointLocations(flowEdges, this.endpointLocationDependencies()).map(relationshipEvidence);

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

  private flowContextDependencies() {
    return {
      execJson: (sql: string, params?: unknown[]) => this.execJson(sql, params),
      execRows: (sql: string, params?: unknown[]) => this.execRows(sql, params),
      relationshipContextWhere: (prefix: "AND" | "WHERE") => this.relationshipContextWhere(prefix)
    };
  }

  private endpointLocationDependencies() {
    return {
      execJson: (sql: string, params?: unknown[]) => this.execJson(sql, params)
    };
  }

  public search(query: string): QueryResponse {
    return findSearchQuery(query, this.searchQueryDependencies());
  }

  private searchQueryDependencies() {
    return {
      ambiguousContextResponse: (queryType: string, currentQuery: string) => this.ambiguousContextResponse(queryType, currentQuery),
      execRows: (sql: string, params?: unknown[]) => this.execRows(sql, params),
      fileContextWhere: (prefix: "AND" | "WHERE") => this.fileContextWhere(prefix),
      findSearchRowsByTerms: (currentQuery: string, limit: number) => this.findSearchRowsByTerms(currentQuery, limit)
    };
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

function isJavaScriptAnchor(anchor: Record<string, unknown>): boolean {
  return stringValue(anchor.id).startsWith("symbol:javascript:")
    || /\.(?:js|mjs|cjs)$/iu.test(stringValue(anchor.file));
}
