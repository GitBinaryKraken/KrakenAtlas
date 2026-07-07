import {
  inferProjectNameFromFile,
  inferProjectNameFromSymbol
} from "./queryContext";
import {
  anchorFlowEdges,
  exactIdentifierAnchors,
  isLowValueRelationshipEdge,
  isRelevantFlowEdge,
  propertyNamesFromFlow,
  rankFlowEdges,
  semanticFlowAnchors
} from "./queryFlow";
import { domainFlowTerms } from "./queryText";
import {
  placeholders,
  stringValue,
  uniqueById,
  uniqueStrings
} from "./queryUtils";

interface QueryWhere {
  sql: string;
  params: string[];
}

export interface FlowContextDependencies {
  execJson(sql: string, params?: unknown[]): Array<Record<string, unknown>>;
  execRows(sql: string, params?: unknown[]): Array<Record<string, unknown>>;
  relationshipContextWhere(prefix: "AND" | "WHERE"): QueryWhere;
}

export function findConfigurationFlowContext(
  flow: Array<Record<string, unknown>>,
  terms: string[],
  dependencies: FlowContextDependencies
): Array<Record<string, unknown>> {
  const flowSymbols = uniqueStrings(flow.flatMap((edge) => [stringValue(edge.from), stringValue(edge.to)]).filter(Boolean));
  if (flowSymbols.length === 0) {
    return [];
  }

  const optionEdges = dependencies.execJson(
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

  const adjacentOptions = dependencies.execJson(
    `SELECT json FROM relationships
     WHERE type IN ('USES_OPTIONS', 'BINDS_OPTIONS', 'USES_CONFIG_KEY')
       AND (from_id IN (${placeholders(optionTargets.length)}) OR to_id IN (${placeholders(optionTargets.length)}))
     ORDER BY type, file, start_line
     LIMIT 8;`,
    [...optionTargets, ...optionTargets]
  );

  return uniqueById([...optionEdges, ...adjacentOptions]).filter((edge) => terms.length === 0 || isRelevantFlowEdge(edge, terms, flowSymbols));
}

export function findDataFlowContext(
  flow: Array<Record<string, unknown>>,
  terms: string[],
  dependencies: FlowContextDependencies
): Array<Record<string, unknown>> {
  const flowSymbols = uniqueStrings(flow.flatMap((edge) => [stringValue(edge.from), stringValue(edge.to)]).filter(Boolean));
  if (flowSymbols.length === 0) {
    return [];
  }

  const repositoryEdges = dependencies.execJson(
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

  const adjacentDataEdges = dependencies.execJson(
    `SELECT json FROM relationships
     WHERE type IN ('CALLS_REPOSITORY', 'QUERIES', 'WRITES', 'USES_DBSET', 'DBSET_FOR', 'MAPS_PROPERTY', 'BINDS_MODEL_PROPERTY', 'WRITES_FIELD')
       AND (from_id IN (${placeholders(repositoryTargets.length)}) OR to_id IN (${placeholders(repositoryTargets.length)}))
     ORDER BY type, file, start_line
     LIMIT 10;`,
    [...repositoryTargets, ...repositoryTargets]
  );

  return uniqueById([...repositoryEdges, ...adjacentDataEdges]).filter((edge) => terms.length === 0 || isRelevantFlowEdge(edge, terms, flowSymbols));
}

export function findPropertyBridgeFlowContext(
  flow: Array<Record<string, unknown>>,
  dependencies: FlowContextDependencies
): Array<Record<string, unknown>> {
  const propertyNames = propertyNamesFromFlow(flow).slice(0, 8);
  if (propertyNames.length === 0) {
    return [];
  }

  const clauses = propertyNames.map(() => "json LIKE ?").join(" OR ");
  const context = dependencies.relationshipContextWhere("AND");
  return rankFlowEdges(dependencies.execJson(
    `SELECT json FROM relationships
     WHERE type IN ('MAPS_PROPERTY', 'BINDS_MODEL_PROPERTY', 'WRITES_FIELD')
       AND (${clauses})
     ${context.sql}
     ORDER BY confidence DESC, file, start_line
     LIMIT 20;`,
    [...propertyNames.map((name) => `%${name}%`), ...context.params]
  )).slice(0, 8);
}

export function findRequestedPropertyFlowContext(
  exactAnchors: string[],
  dependencies: FlowContextDependencies
): Array<Record<string, unknown>> {
  const propertyAnchors = exactAnchors
    .filter((anchor) => /[a-z][A-Z]/.test(anchor) || /(?:title|description|keywords?|summary|tags?|date|time|slug|path)$/i.test(anchor))
    .slice(0, 8);
  if (propertyAnchors.length === 0) {
    return [];
  }

  const clauses = propertyAnchors.map(() => "(from_id LIKE ? OR to_id LIKE ? OR json LIKE ?)").join(" OR ");
  const context = dependencies.relationshipContextWhere("AND");
  return anchorFlowEdges(rankFlowEdges(dependencies.execJson(
    `SELECT json FROM relationships
     WHERE type IN ('MAPS_PROPERTY', 'BINDS_MODEL_PROPERTY', 'WRITES_FIELD', 'WRITES', 'QUERIES')
       AND (${clauses})
     ${context.sql}
     ORDER BY type, file, start_line
     LIMIT 80;`,
    [...propertyAnchors.flatMap((anchor) => [`%${anchor}%`, `%${anchor}%`, `%${anchor}%`]), ...context.params]
  )), propertyAnchors).slice(0, 12);
}

export function findLayeredFlowContext(
  query: string,
  flow: Array<Record<string, unknown>>,
  terms: string[],
  dependencies: FlowContextDependencies
): Array<Record<string, unknown>> {
  const domainTerms = domainFlowTerms(terms);
  if (domainTerms.length === 0) {
    return [];
  }
  const exactAnchors = uniqueStrings([...exactIdentifierAnchors(query), ...semanticFlowAnchors(query)]);

  const clauses = domainTerms.map(() => "(from_id LIKE ? OR to_id LIKE ? OR file LIKE ? OR json LIKE ?)").join(" OR ");
  const params = domainTerms.flatMap((term) => [`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`]);
  const context = dependencies.relationshipContextWhere("AND");
  const directEdges = dependencies.execJson(
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

  const adjacent = dependencies.execJson(
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

export function findProjectReferenceFlowContext(
  flow: Array<Record<string, unknown>>,
  dependencies: FlowContextDependencies
): Array<Record<string, unknown>> {
  const projectIds = inferProjectIds(flow, dependencies);
  if (projectIds.length < 2) {
    return [];
  }

  return dependencies.execJson(
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

function inferProjectIds(flow: Array<Record<string, unknown>>, dependencies: FlowContextDependencies): string[] {
  const projectSymbols = dependencies.execRows(
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
