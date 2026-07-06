import { stringValue, uniqueStrings } from "./queryUtils";
import type { FileRecommendation } from "./whereToAddRanking";

export interface ContextTagRow {
  nodeId: string;
  tag: string;
}

export interface ContextProjectRow {
  nodeId: string;
  project: string;
}

export interface ContextPruningResult {
  relationships: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
}

export function contextPruningNodeIds(relationships: Array<Record<string, unknown>>, boundaries: Array<Record<string, unknown>>): string[] {
  return uniqueStrings([
    ...boundaries.map((boundary) => stringValue(boundary.nodeId)),
    ...relationships.flatMap((relationship) => [
      stringValue(relationship.from),
      parentCSharpSymbolId(stringValue(relationship.from)) ?? "",
      stringValue(relationship.to),
      parentCSharpSymbolId(stringValue(relationship.to)) ?? ""
    ])
  ].filter((nodeId) => nodeId.startsWith("symbol:csharp:"))).slice(0, 120);
}

export function buildContextPruningResult(
  query: string,
  files: string[],
  recommendations: FileRecommendation[],
  boundaries: Array<Record<string, unknown>>,
  relationships: Array<Record<string, unknown>>,
  tagRows: ContextTagRow[],
  projectRows: ContextProjectRow[]
): ContextPruningResult {
  if (relationships.length === 0) {
    return { relationships, evidence: [] };
  }

  const selectedFiles = new Set(files.filter(Boolean));
  const boundaryNodes = boundaries.map((boundary) => stringValue(boundary.nodeId)).filter(Boolean);
  const targetTags = uniqueStrings(recommendations.flatMap((recommendation) =>
    Array.isArray(recommendation.matchedTags) ? recommendation.matchedTags.filter((tag): tag is string => typeof tag === "string") : []
  )).filter(isFocusedContextTag).slice(0, 12);
  const targetProjects = uniqueStrings([
    ...files.map(projectFromFile).filter((project): project is string => Boolean(project)),
    ...boundaries.flatMap((boundary) => [
      ...(Array.isArray(boundary.projects) ? boundary.projects.filter((project): project is string => typeof project === "string") : []),
      ...(Array.isArray(boundary.usedFrom) ? boundary.usedFrom.filter((project): project is string => typeof project === "string") : [])
    ])
  ]).slice(0, 12);

  if (selectedFiles.size === 0 && boundaryNodes.length === 0 && targetTags.length === 0) {
    return { relationships, evidence: [] };
  }

  const tagsByNode = groupValues(tagRows, (row) => row.nodeId, (row) => row.tag);
  const projectsByNode = groupValues(projectRows, (row) => row.nodeId, (row) => row.project);
  const ranked = relationships
    .map((relationship, index) => {
      const file = stringValue(relationship.file);
      const nodeIds = relationshipNodeIds(relationship);
      const endpointTags = uniqueStrings(nodeIds.flatMap((nodeId) => tagsByNode.get(nodeId) ?? []));
      const endpointProjects = uniqueStrings(nodeIds.flatMap((nodeId) => projectsByNode.get(nodeId) ?? []));
      const fileProject = projectFromFile(file);
      const projects = uniqueStrings([fileProject ?? "", ...endpointProjects].filter(Boolean));
      const selectedFile = selectedFiles.has(file);
      const boundaryMatch = boundaryNodes.some((nodeId) => relationshipTouchesNode(relationship, nodeId));
      const tagMatch = targetTags.length > 0 && endpointTags.some((tag) => targetTags.some((targetTag) => tagsMatch(tag, targetTag)));
      const projectMatch = targetProjects.length === 0 || projects.some((project) => targetProjects.includes(project));
      const keep = selectedFile || boundaryMatch || (tagMatch && projectMatch);
      const score = Number(selectedFile) * 30 + Number(boundaryMatch) * 25 + Number(tagMatch) * 12 + Number(projectMatch) * 5;
      return { relationship, index, keep, score };
    })
    .filter((entry) => entry.keep)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const kept = ranked.length ? ranked.map((entry) => entry.relationship) : relationships;
  const pruned = kept.length < relationships.length;
  if (!pruned) {
    return { relationships: kept, evidence: [] };
  }

  return {
    relationships: kept,
    evidence: [{
      recordType: "contextPruning",
      originalRelationshipCount: relationships.length,
      keptRelationshipCount: kept.length,
      tags: targetTags.slice(0, 8),
      projects: targetProjects.slice(0, 8),
      files: files.slice(0, 8),
      message: `Context relationships pruned from ${relationships.length} to ${kept.length} using selected files, matched tags, and project boundaries for "${query}".`
    }]
  };
}

function relationshipNodeIds(relationship: Record<string, unknown>): string[] {
  return uniqueStrings([stringValue(relationship.from), stringValue(relationship.to)]
    .flatMap((nodeId) => [nodeId, parentCSharpSymbolId(nodeId) ?? ""])
    .filter((nodeId) => nodeId.startsWith("symbol:csharp:")));
}

function relationshipTouchesNode(relationship: Record<string, unknown>, nodeId: string): boolean {
  return [stringValue(relationship.from), stringValue(relationship.to)].some((endpoint) =>
    endpoint === nodeId || endpoint.startsWith(`${nodeId}.`) || nodeId.startsWith(`${endpoint}.`)
  );
}

function tagsMatch(tag: string, targetTag: string): boolean {
  if (tag === targetTag) {
    return true;
  }

  if (!isFocusedContextTag(tag) || !isFocusedContextTag(targetTag)) {
    return false;
  }

  if (tag.includes(targetTag) || targetTag.includes(tag)) {
    return true;
  }

  const tagTerms = normalizedTagTerms(tag);
  const targetTerms = new Set(normalizedTagTerms(targetTag));
  return tagTerms.filter((term) => targetTerms.has(term)).length >= 2;
}

function isFocusedContextTag(tag: string): boolean {
  const normalized = tag.trim().toLowerCase();
  if (!normalized.includes("-") || normalized.length < 8) {
    return false;
  }

  return !genericSingleTagTerms.has(normalized);
}

function normalizedTagTerms(tag: string): string[] {
  return uniqueStrings(tag
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .map((term) => term.replace(/s$/u, ""))
    .filter((term) => term.length >= 3));
}

function projectFromFile(file: string): string | undefined {
  const normalized = file.replace(/\\/g, "/").replace(/^\/+/u, "");
  const [project] = normalized.split("/");
  return project || undefined;
}

function groupValues<T>(rows: T[], key: (row: T) => string, value: (row: T) => string): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const groupKey = key(row);
    const groupValue = value(row);
    if (!groupKey || !groupValue) {
      continue;
    }

    grouped.set(groupKey, uniqueStrings([...(grouped.get(groupKey) ?? []), groupValue]));
  }
  return grouped;
}

function parentCSharpSymbolId(nodeId: string): string | undefined {
  const prefix = "symbol:csharp:";
  if (!nodeId.startsWith(prefix)) {
    return undefined;
  }

  const body = nodeId.slice(prefix.length);
  const memberBoundary = body.includes("(")
    ? body.lastIndexOf(".", body.indexOf("("))
    : body.lastIndexOf(".");
  if (memberBoundary <= 0) {
    return undefined;
  }

  return `${prefix}${body.slice(0, memberBoundary)}`;
}

const genericSingleTagTerms = new Set([
  "account",
  "accounts",
  "admin",
  "api",
  "controller",
  "controllers",
  "data",
  "description",
  "domain",
  "draft",
  "edit",
  "editor",
  "identity",
  "login",
  "model",
  "models",
  "page",
  "pages",
  "request",
  "response",
  "service",
  "services",
  "view",
  "views",
  "web",
  "webui"
]);
