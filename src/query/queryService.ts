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

interface QueryContext {
  input: string;
  name: string;
  filePrefix: string;
  symbolPrefix: string;
  projectSymbolPrefix: string;
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

  public constructor(private readonly database: Database, options: QueryServiceOptions = {}) {
    this.queryContext = this.resolveQueryContext(options.projectContext);
  }

  public getProject(query = "project"): QueryResponse {
    const rows = this.execJson("SELECT json FROM metadata WHERE key = 'project';");
    const project = rows[0] ?? null;

    return compactResponse({
      query,
      answer: project ? "Project metadata summary." : "No project metadata found.",
      confidence: project ? 1 : 0,
      evidence: project ? [project] : [],
      nextQueries: ["kraken-atlas query symbols", "kraken-atlas query relationships", "kraken-atlas query pattern controller-service-flow"]
    });
  }

  public findSymbols(query: string): QueryResponse {
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

    return compactResponse({
      query,
      answer: rows.length ? `Found ${rows.length} reference match(es).` : "No references matched.",
      confidence: rows.length ? 0.85 : 0,
      evidence: rows.map(referenceEvidence),
      symbols: uniqueStrings(rows.map((row) => stringValue(row.resolvedSymbolId))),
      files: uniqueStrings(rows.map((row) => stringValue(row.file))),
      nextQueries: [`kraken-atlas query relationships "${query}"`]
    });
  }

  public findRelationships(query: string): QueryResponse {
    const symbolIds = this.findSymbolIds(query);
    const terms = [query, ...symbolIds];
    const context = this.relationshipContextWhere("AND");
    const rows = this.execJson(
      `SELECT json FROM relationships
       WHERE (from_id IN (${placeholders(terms.length)})
          OR to_id IN (${placeholders(terms.length)})
          OR from_id LIKE ?
          OR to_id LIKE ?
          OR file LIKE ?
          OR type LIKE ?)
       ${context.sql}
       ORDER BY type, file, start_line
       LIMIT 30;`,
      [...terms, ...terms, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, ...context.params]
    );

    return compactResponse({
      query,
      answer: rows.length ? `Found ${rows.length} relationship edge(s).` : "No relationships matched.",
      confidence: rows.length ? 0.9 : 0,
      evidence: rows.map(relationshipEvidence),
      relationships: rows.map(relationshipEvidence),
      symbols: uniqueStrings(rows.flatMap((row) => [stringValue(row.from), stringValue(row.to)]).filter((value) => value.startsWith("symbol:"))),
      files: uniqueStrings(rows.map((row) => stringValue(row.file))),
      nextQueries: relationshipNextQueries(rows)
    });
  }

  public findPatterns(query: string): QueryResponse {
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

  public findFlow(query: string): QueryResponse {
    const seeds = this.findFlowSeeds(query);
    const edges = this.traverseEdges(seeds, 3, 100);
    const terms = queryTerms(query);
    const coreFlow = rankFlowEdges(edges).filter((edge) => isRelevantFlowEdge(edge, terms, seeds)).slice(0, 20);
    const configurationContext = this.findConfigurationContext(coreFlow, terms);
    const dataFlowContext = this.findDataFlowContext(coreFlow, terms);
    const projectReferences = this.findProjectReferenceContext(coreFlow);
    const flow = capRepeatedFlowNoise(uniqueById([...coreFlow.slice(0, 12), ...configurationContext, ...dataFlowContext, ...projectReferences, ...coreFlow.slice(12)])).slice(0, 20).map(relationshipEvidence);

    if (flow.length === 0) {
      const search = this.search(query);
      return {
        ...search,
        answer: `No connected feature flow found for "${query}". Returning search hits instead.`
      };
    }

    return compactResponse({
      query,
      answer: `Feature-flow slice for "${query}" with ${flow.length} connected edge(s).`,
      confidence: 0.82,
      evidence: flow,
      flow,
      relationships: flow,
      symbols: uniqueStrings(flow.flatMap((edge) => [stringValue(edge.from), stringValue(edge.to)]).filter((value) => value.startsWith("symbol:"))),
      files: uniqueStrings(flow.map((edge) => stringValue(edge.file))),
      nextQueries: relationshipNextQueries(flow)
    });
  }

  public search(query: string): QueryResponse {
    const rows = this.findSearchRowsByTerms(query, 20);
    const evidence = rows.map((row) => ({
      recordId: row.record_id,
      recordType: row.record_type,
      title: row.title,
      path: row.path
    }));

    return compactResponse({
      query,
      answer: rows.length ? `Found ${rows.length} search result(s).` : "No search results matched.",
      confidence: rows.length ? 0.7 : 0,
      evidence,
      files: uniqueStrings(rows.map((row) => stringValue(row.path))),
      nextQueries: rows.slice(0, 5).map((row) => `kraken-atlas query relationships "${row.record_id}"`)
    });
  }

  public whereToAdd(query: string): QueryResponse {
    const searchRows = this.findSearchRowsByTerms(query, 60);
    const flow = this.findFlow(query);
    const patterns = this.scopePatternsToContext(this.findRelevantPatterns(query));
    const recommendations = rankFileRecommendations(query, searchRows, flow.relationships, patterns).slice(0, 8);
    const caveats = buildWhereToAddCaveats(recommendations, flow.relationships);
    const files = recommendations.map((recommendation) => recommendation.file);

    return compactResponse({
      query,
      answer: recommendations.length
        ? `Likely edit locations for "${query}" ranked by text matches, feature-flow edges, and detected project patterns.`
        : `No strong edit-location recommendation found for "${query}". Start with search and project queries.`,
      confidence: recommendations.length ? Math.min(0.9, 0.45 + recommendations[0].score / 20) : 0.2,
      evidence: [...recommendations, ...patterns.slice(0, 4).map(patternEvidence), ...caveats],
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
      ...this.findSearchRowsByTerms(query, 30).map((row) => stringValue(row.record_id))
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
    return uniqueStrings([...searchRows, ...edgeRows, ...symbolIds, ...fallbackSeeds]).filter(Boolean).slice(0, 40);
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
       WHERE type IN ('CALLS_REPOSITORY', 'QUERIES', 'WRITES', 'USES_DBSET')
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
       WHERE type IN ('CALLS_REPOSITORY', 'QUERIES', 'WRITES', 'USES_DBSET', 'DBSET_FOR')
         AND (from_id IN (${placeholders(repositoryTargets.length)}) OR to_id IN (${placeholders(repositoryTargets.length)}))
       ORDER BY type, file, start_line
       LIMIT 10;`,
      [...repositoryTargets, ...repositoryTargets]
    );

    return uniqueById([...repositoryEdges, ...adjacentDataEdges]).filter((edge) => terms.length === 0 || isRelevantFlowEdge(edge, terms, flowSymbols));
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
    return this.execRows(
      `SELECT from_id, to_id FROM relationships
       WHERE (${clauses})
       ${context.sql}
       LIMIT ${limit};`,
      [...params, ...context.params]
    );
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

  private traverseEdges(seeds: string[], maxDepth: number, limit: number): Array<Record<string, unknown>> {
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
      ).filter((edge) => this.relationshipMatchesContext(edge));

      for (const edge of adjacent) {
        const edgeId = stringValue(edge.id);
        if (seenEdges.has(edgeId)) {
          continue;
        }
        seenEdges.add(edgeId);
        edges.push(edge);

        const from = stringValue(edge.from);
        const to = stringValue(edge.to);
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

  private resolveQueryContext(projectContext: string | undefined): QueryContext | undefined {
    const requested = normalizeQueryContext(projectContext);
    if (!requested) {
      return undefined;
    }

    const candidates = this.contextCandidates();
    const resolved = bestContextCandidate(requested, candidates);
    return resolved ? normalizeQueryContext(resolved.filePrefix) : requested;
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

function referenceEvidence(row: Record<string, unknown>): Record<string, unknown> {
  return {
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

function relationshipEvidence(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    type: row.type,
    from: row.from,
    to: row.to,
    file: row.file,
    range: row.range,
    evidence: row.evidence,
    confidence: row.confidence
  };
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

function relationshipNextQueries(rows: Array<Record<string, unknown>>): string[] {
  return uniqueStrings(
    rows
      .flatMap((row) => [stringValue(row.from), stringValue(row.to)])
      .filter(Boolean)
      .slice(0, 10)
      .map((id) => `kraken-atlas query relationships "${id}"`)
  );
}

function rankFlowEdges(edges: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const weight: Record<string, number> = {
    POSTS_TO: 0,
    HANDLES_EVENT: 1,
    SELECTS_ELEMENT: 2,
    LOADS_SCRIPT: 3,
    CALLS: 4,
    MAPS_ROUTE: 5,
    INJECTS: 6,
    REGISTERS: 7,
    IMPLEMENTS: 8,
    USES_DBSET: 9,
    QUERIES: 10,
    WRITES: 11,
    CALLS_REPOSITORY: 12,
    DBSET_FOR: 13,
    VALIDATES: 14,
    USES_VALIDATOR: 15,
    REQUIRES_AUTH: 16,
    HANDLES_REQUEST: 17,
    RUNS_HOSTED_SERVICE: 18,
    USES_MIDDLEWARE: 19,
    BINDS_OPTIONS: 20,
    USES_OPTIONS: 21,
    USES_CONFIG_KEY: 22,
    PROJECT_REFERENCES: 23,
    RETURNS_TYPE: 24,
    USES_CONFIG: 25
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
}

function rankFileRecommendations(
  query: string,
  searchRows: Array<Record<string, unknown>>,
  relationships: Array<Record<string, unknown>>,
  patterns: Array<Record<string, unknown>>
): FileRecommendation[] {
  const terms = queryTerms(query);
  const recommendations = new Map<string, FileRecommendation>();
  const searchHitCounts = new Map<string, number>();

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
    recommendation.score += previousHits === 0 ? 3 + matchedTerms.length : Math.min(2, 0.75 + matchedTerms.length * 0.25);
    addReason(recommendation, `Search match in ${stringValue(row.recordType) || "record"} ${stringValue(row.recordId) || stringValue(row.title)}.`);
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
    addReason(recommendation, `Participates in ${type || "relationship"} feature-flow evidence.`);
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
    recommendation.reasons = recommendation.reasons.slice(0, 4);
    recommendation.patternsToFollow = recommendation.patternsToFollow.slice(0, 3);
    recommendation.matchedTerms = recommendation.matchedTerms.slice(0, 8);
  }

  return [...recommendations.values()]
    .filter((recommendation) => recommendation.score > 0)
    .sort((left, right) => right.score - left.score || left.file.localeCompare(right.file));
}

function buildWhereToAddCaveats(recommendations: FileRecommendation[], relationships: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const caveats: Array<Record<string, unknown>> = [];
  if (recommendations.length === 0) {
    caveats.push({
      recordType: "caveat",
      message: "No high-confidence edit location found. Run broader project and search queries before editing."
    });
  }

  if (!relationships.some((relationship) => ["CALLS", "POSTS_TO", "MAPS_ROUTE", "INJECTS"].includes(stringValue(relationship.type)))) {
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

  return caveats;
}

function queryTerms(query: string): string[] {
  const stopWords = new Set(["add", "new", "the", "for", "and", "with", "field", "property", "feature", "change", "update"]);
  return uniqueStrings(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3 && !stopWords.has(term))
  );
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

function bestContextCandidate(requested: QueryContext, candidates: QueryContext[]): QueryContext | undefined {
  const scored = candidates
    .map((candidate) => ({ candidate, score: contextMatchScore(requested, candidate) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.candidate.filePrefix.length - right.candidate.filePrefix.length);

  return scored[0]?.candidate;
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
    patternsToFollow: []
  };
  recommendations.set(file, recommendation);
  return recommendation;
}

function addReason(recommendation: FileRecommendation, reason: string): void {
  if (!recommendation.reasons.includes(reason)) {
    recommendation.reasons.push(reason);
  }
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
    SELECTS_ELEMENT: 2,
    LOADS_SCRIPT: 2,
    CONTAINS: 1
  };
  return weights[type] ?? 1;
}

function roleWeight(file: string, query: string): number {
  const normalized = file.replace(/\\/g, "/").toLowerCase();
  const lowerQuery = query.toLowerCase();
  let score = 0;

  if (hasPathSegment(normalized, "controllers")) {
    score += lowerQuery.includes("endpoint") || lowerQuery.includes("route") || lowerQuery.includes("api") ? 4 : 2;
  }
  if (isIdentityAccountPageModel(normalized)) {
    score += queryWantsIdentityAccountFlow(lowerQuery) ? 24 : 2;
  }
  if (hasPathSegment(normalized, "services")) {
    score += 3;
  }
  if (hasPathSegment(normalized, "validation") || hasPathSegment(normalized, "validators") || normalized.endsWith("validator.cs")) {
    score += lowerQuery.includes("valid") || lowerQuery.includes("request") || lowerQuery.includes("rule") ? 80 : 3;
  }
  if (hasPathSegment(normalized, "handlers") || normalized.endsWith("handler.cs")) {
    score += lowerQuery.includes("handler") || lowerQuery.includes("command") || lowerQuery.includes("query") ? 70 : lowerQuery.includes("request") ? 35 : 2;
  }
  if (hasPathSegment(normalized, "background") || normalized.endsWith("worker.cs") || normalized.endsWith("hostedservice.cs")) {
    score += lowerQuery.includes("background") || lowerQuery.includes("hosted") || lowerQuery.includes("worker") || lowerQuery.includes("digest") || lowerQuery.includes("sync") ? 70 : 2;
  }
  if (hasPathSegment(normalized, "middleware") || normalized.endsWith("middleware.cs")) {
    score += lowerQuery.includes("middleware") || lowerQuery.includes("pipeline") ? 70 : lowerQuery.includes("request") ? 35 : 2;
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
  if (normalized.endsWith("program.cs")) {
    score += queryWantsCompositionRoot(lowerQuery) ? 28 : 1;
  }
  if (hasPathSegment(normalized, "views") || normalized.endsWith(".cshtml") || normalized.endsWith(".html")) {
    score += lowerQuery.includes("form") || lowerQuery.includes("field") || lowerQuery.includes("ui") ? 25 : 1;
  }
  if (hasPathSegment(normalized, "wwwroot") || normalized.endsWith(".js")) {
    score += lowerQuery.includes("button") || lowerQuery.includes("form") || lowerQuery.includes("ajax") || lowerQuery.includes("fetch") ? 3 : 1;
  }

  return score;
}

function isIdentityAccountPageModel(normalizedFile: string): boolean {
  return /(^|\/)areas\/identity\/pages\/account\//.test(normalizedFile) && normalizedFile.endsWith(".cshtml.cs");
}

function queryWantsIdentityAccountFlow(lowerQuery: string): boolean {
  return /\b(user|account|identity|register|registration|login|external|profile|persona|create|creation|initial|setup|sign)\b/i.test(lowerQuery);
}

function compositionRootPenalty(file: string, query: string): number {
  const normalized = file.replace(/\\/g, "/").toLowerCase();
  if (!/(^|\/)(program|startup)\.cs$/.test(normalized)) {
    return 0;
  }

  return queryWantsCompositionRoot(query.toLowerCase()) ? 0 : 28;
}

function queryWantsCompositionRoot(lowerQuery: string): boolean {
  if (/\b(startup|program|middleware|pipeline|route|routing|endpoint|config|configuration|setting|settings|option|options|hosted|worker)\b/i.test(lowerQuery)) {
    return true;
  }

  const mentionsRegistration = /\b(register|registered|registering|registration)\b/i.test(lowerQuery);
  const mentionsComposition = /\b(di|dependency|dependencies|inject|injection|service|services|container|composition)\b/i.test(lowerQuery);
  return mentionsRegistration && mentionsComposition;
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
