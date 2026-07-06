import { hasPathSegment } from "./queryPath";
import {
  conceptMatchesText,
  queryCoreTerms,
  queryTerms,
  queryWantsBrowserQueryState
} from "./queryText";
import { stringValue, uniqueById, uniqueStrings } from "./queryUtils";

export interface FlowCoverage {
  confidence: number;
  evidence: Record<string, unknown>;
  caveats: Array<Record<string, unknown>>;
}

export function rankFlowEdges(edges: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
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

export function propertyNamesFromFlow(edges: Array<Record<string, unknown>>): string[] {
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

export function isRelevantFlowEdge(edge: Record<string, unknown>, terms: string[], seeds: string[]): boolean {
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

export function relationshipMatchesCrossContextAnchor(edge: Record<string, unknown>, anchors: Set<string>): boolean {
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

export function isCommonExternalSymbol(id: string): boolean {
  return /^symbol:csharp:(string|int|long|double|decimal|bool|object|task|task<|ienumerable<|ilist<|list<|dictionary<|datetime|guid|iconfiguration|ihttpclientfactory|ilogger|ilogger<|iserviceprovider|pagemodel|controller|controllerbase)(\.|$|<)/i.test(id);
}

export function isLowValueRelationshipEdge(row: Record<string, unknown>): boolean {
  const type = stringValue(row.type);
  const from = stringValue(row.from);
  const to = stringValue(row.to);

  if (type === "CALLS" && isCommonExternalSymbol(to)) {
    return true;
  }

  return isCommonExternalSymbol(from) || (type !== "RETURNS_TYPE" && isCommonExternalSymbol(to) && type !== "IMPLEMENTS");
}

export function assessFlowCoverage(query: string, flow: Array<Record<string, unknown>>, exactAnchors: string[]): FlowCoverage {
  const concepts = queryCoreTerms(query);
  const haystack = `${JSON.stringify(flow).toLowerCase()} ${flowSemanticCoverageTerms(flow)}`;
  const matchedConcepts = concepts.filter((concept) => conceptMatchesText(concept, haystack));
  const missingConcepts = concepts.filter((concept) => !conceptMatchesText(concept, haystack));
  const featureCoverage = concepts.length ? matchedConcepts.length / concepts.length : 0;
  const perEdgeCoverage = flow.map((edge) => {
    const edgeText = JSON.stringify(edge).toLowerCase();
    return concepts.length ? concepts.filter((concept) => conceptMatchesText(concept, edgeText)).length / concepts.length : 0;
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

export function buildFlowCoverageCaveats(query: string, flow: Array<Record<string, unknown>>, exactAnchors: string[]): Array<Record<string, unknown>> {
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

export function composeFlowEdges(query: string, edges: Array<Record<string, unknown>>, exactAnchors: string[]): Array<Record<string, unknown>> {
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

export function promoteJavaScriptInteractionPath(edges: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
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

export function anchorFlowEdges(edges: Array<Record<string, unknown>>, exactAnchors: string[]): Array<Record<string, unknown>> {
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

export function exactIdentifierAnchors(query: string): string[] {
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

export function semanticFlowAnchors(query: string): string[] {
  const lower = query.toLowerCase();
  const anchors: string[] = [];
  if (/\b(query string|query-string|location search|browser history|url search params)\b/.test(lower)) {
    anchors.push("browser-state:query-string");
  }
  return anchors;
}

export function hasIncompleteBrowserQueryState(query: string, relationships: Array<Record<string, unknown>>): boolean {
  if (!queryWantsBrowserQueryState(query.toLowerCase())) {
    return false;
  }

  const types = new Set(relationships.map((relationship) => stringValue(relationship.type)));
  return types.has("READS_QUERY_STRING") && !types.has("WRITES_QUERY_STRING");
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

function isLowValueFrameworkLeaf(edge: Record<string, unknown>, terms: string[]): boolean {
  const type = stringValue(edge.type);
  const to = stringValue(edge.to);
  if (type !== "CALLS" || !isCommonExternalSymbol(to)) {
    return false;
  }

  const target = to.toLowerCase();
  return !terms.some((term) => target.includes(term));
}

function flowSemanticCoverageTerms(flow: Array<Record<string, unknown>>): string {
  const types = new Set(flow.map((edge) => stringValue(edge.type)));
  const text = JSON.stringify(flow).toLowerCase();
  return [
    types.has("UPDATES_ELEMENT_STATE") ? "highlight highlighted selected selection dom element state" : "",
    types.has("SUBSCRIBES_EVENT") ? "event listener subscription click selection" : "",
    types.has("EMITS_EVENT") ? "event emission selection change" : "",
    /\b(pagepart|partrequest|componenttypes|composableeditorpart|composableeditordocument)\b/i.test(text) ? "block content part component" : ""
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

function relationshipContainsText(edge: Record<string, unknown>, text: string): boolean {
  return JSON.stringify(edge).toLowerCase().includes(text.toLowerCase());
}

function fileOrEndpointContainsAnchor(edge: Record<string, unknown>, anchor: string): boolean {
  const lowerAnchor = anchor.toLowerCase();
  return [edge.file, edge.from, edge.to].some((value) => stringValue(value).toLowerCase().includes(lowerAnchor));
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
