import { queryTerms } from "./queryText";
import { numberValue, stringValue, uniqueStrings } from "./queryUtils";
import type { FileRecommendation } from "./whereToAddRanking";

export interface NodeProjectEvidenceRow {
  nodeId: string;
  project: string;
  role: string;
  evidenceCount: number;
}

export interface NodeRoleEvidenceRow {
  nodeId: string;
  role: string;
  confidence: number;
}

export interface NodeMemberEvidenceRow {
  nodeId: string;
  name: string;
}

export interface SymbolEvidenceRow {
  id: string;
  name: string;
  file: string;
  kind: string;
}

interface SharedContractBoundaryRecord extends Record<string, unknown> {
  nodeId: string;
  score: number;
}

interface SharedContractChecklistItem extends Record<string, unknown> {
  area: string;
  label: string;
  files: string[];
  message: string;
}

const sharedContractRoles = new Set(["domain-contract", "request-dto", "response-dto"]);

export function sharedContractCandidateNodeIds(
  recommendations: FileRecommendation[],
  relationships: Array<Record<string, unknown>>,
  strongAnchors: Array<Record<string, unknown>>
): string[] {
  const nodeIds: string[] = [];
  const addEndpoint = (value: unknown): void => {
    const nodeId = stringValue(value);
    if (!nodeId.startsWith("symbol:csharp:")) {
      return;
    }

    nodeIds.push(nodeId);
    const parent = parentCSharpSymbolId(nodeId);
    if (parent) {
      nodeIds.push(parent);
    }
  };

  for (const anchor of strongAnchors) {
    addEndpoint(anchor.id);
  }
  for (const relationship of relationships) {
    addEndpoint(relationship.from);
    addEndpoint(relationship.to);
  }
  for (const recommendation of recommendations) {
    for (const relationship of recommendation.relationshipDetails) {
      addEndpoint(relationship.from);
      addEndpoint(relationship.to);
    }
    for (const anchor of recommendation.anchorDetails) {
      addEndpoint(anchor.id);
    }
  }

  return uniqueStrings(nodeIds).slice(0, 80);
}

export function buildSharedContractBoundaryRecords(
  query: string,
  nodeIds: string[],
  roleRows: NodeRoleEvidenceRow[],
  projectRows: NodeProjectEvidenceRow[],
  memberRows: NodeMemberEvidenceRow[],
  symbolRows: SymbolEvidenceRow[]
): Array<Record<string, unknown>> {
  const rolesByNode = groupRows(roleRows, (row) => row.nodeId);
  const projectsByNode = groupRows(projectRows, (row) => row.nodeId);
  const membersByNode = groupRows(memberRows, (row) => row.nodeId);
  const symbolById = new Map(symbolRows.map((symbol) => [symbol.id, symbol]));
  const queryTermSet = new Set(queryTerms(query));
  const candidates = nodeIds
    .map((nodeId): SharedContractBoundaryRecord | undefined => {
      const roles = uniqueStrings((rolesByNode.get(nodeId) ?? []).map((row) => row.role));
      const contractRoles = roles.filter((role) => sharedContractRoles.has(role));
      if (!contractRoles.length) {
        return undefined;
      }

      const projectRowsForNode = projectsByNode.get(nodeId) ?? [];
      const declaredIn = projectCounts(projectRowsForNode, "declared");
      const referencedFrom = projectCounts(projectRowsForNode, "referenced");
      const relationshipEvidenceFrom = projectCounts(projectRowsForNode, "related");
      const projects = uniqueStrings(projectRowsForNode.map((row) => row.project).filter(Boolean));
      if (projects.length <= 1 || (!Object.keys(referencedFrom).length && !Object.keys(relationshipEvidenceFrom).length)) {
        return undefined;
      }

      const symbol = symbolById.get(nodeId);
      const members = uniqueStrings((membersByNode.get(nodeId) ?? []).map((row) => row.name).filter(Boolean)).slice(0, 8);
      const usedFrom = uniqueStrings([
        ...Object.keys(referencedFrom),
        ...Object.keys(relationshipEvidenceFrom)
      ].filter((project) => !Object.prototype.hasOwnProperty.call(declaredIn, project) || projects.length > 1));
      const score = boundaryScore(nodeId, symbol, contractRoles, projects, queryTermSet, members.length);

      return {
        recordType: "sharedContractBoundary",
        nodeId,
        name: symbol?.name || compactNodeName(nodeId),
        file: symbol?.file,
        kind: symbol?.kind,
        roles: contractRoles,
        declaredIn,
        referencedFrom,
        relationshipEvidenceFrom,
        projects,
        usedFrom,
        memberCount: members.length,
        members,
        score,
        message: sharedContractMessage(symbol?.name || compactNodeName(nodeId), declaredIn, usedFrom, contractRoles)
      };
    })
    .filter((value): value is SharedContractBoundaryRecord => Boolean(value));

  const candidateNodeSet = new Set(candidates.map((candidate) => stringValue(candidate.nodeId)));
  return candidates
    .filter((candidate) => {
      const parent = parentCSharpSymbolId(stringValue(candidate.nodeId));
      return !parent || !candidateNodeSet.has(parent);
    })
    .sort((left, right) => numberValue(right.score) - numberValue(left.score) || stringValue(left.nodeId).localeCompare(stringValue(right.nodeId)))
    .slice(0, 3);
}

export function buildSharedContractEditChecklists(
  boundaries: Array<Record<string, unknown>>,
  recommendations: FileRecommendation[],
  relationships: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  return boundaries.map((boundary) => {
    const nodeId = stringValue(boundary.nodeId);
    const name = stringValue(boundary.name) || compactNodeName(nodeId);
    const contractFile = stringValue(boundary.file);
    const projects = Array.isArray(boundary.projects) ? boundary.projects.filter((value): value is string => typeof value === "string") : [];
    const usedFrom = Array.isArray(boundary.usedFrom) ? boundary.usedFrom.filter((value): value is string => typeof value === "string") : [];
    const relatedRelationships = relationships.filter((relationship) => relationshipTouchesNode(relationship, nodeId));
    const relatedRecommendationFiles = recommendations
      .filter((recommendation) => recommendationTouchesBoundary(recommendation, nodeId))
      .map((recommendation) => recommendation.file);
    const relatedFiles = uniqueStrings([
      contractFile,
      ...relatedRecommendationFiles,
      ...relatedRelationships.map((relationship) => stringValue(relationship.file))
    ].filter(Boolean));
    const mapperFiles = selectFiles(relatedFiles, /(adapter|mapper|mapping|service|webui|ui|client)/iu, contractFile);
    const apiFiles = selectFiles(relatedFiles, /(api|controller|endpoint|handler|minimalapi)/iu, contractFile);
    const validationFiles = selectFiles(relatedFiles, /(valid|validator|rules?|binding|model)/iu, "");
    const items: SharedContractChecklistItem[] = [
      {
        area: "contract",
        label: "Contract shape",
        files: contractFile ? [contractFile] : [],
        message: "Add or update the DTO member, defaults, nullability, and serialization shape in the declaring contract project."
      },
      {
        area: "mapping",
        label: "Producer mappings",
        files: mapperFiles,
        message: "Update adapters, mappers, or services that populate the shared contract from UI/domain models."
      },
      {
        area: "api-handler",
        label: "API consumers",
        files: apiFiles,
        message: "Update API handlers/controllers and request handling paths that consume the shared contract."
      },
      {
        area: "validation",
        label: "Validation and binding",
        files: validationFiles,
        message: "Check validators, model binding, required-field handling, and backward compatibility for existing callers."
      },
      {
        area: "client-or-serialization",
        label: "Client/serialization impact",
        files: [],
        message: "Check connectors, generated clients, JSON serialization, and any external contract consumers before assuming this is local only."
      },
      {
        area: "tests",
        label: "Tests",
        files: [],
        message: "Add or update tests across the declaring contract project and each consuming project touched by the change."
      }
    ];

    return {
      recordType: "sharedContractChecklist",
      nodeId,
      name,
      projects,
      usedFrom,
      items,
      message: `${name} crosses ${projects.length || usedFrom.length || 1} project boundary/boundaries; use this checklist before implementation.`
    };
  });
}

function projectCounts(rows: NodeProjectEvidenceRow[], role: string): Record<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.role !== role || !row.project) {
      continue;
    }
    counts.set(row.project, (counts.get(row.project) ?? 0) + row.evidenceCount);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function recommendationTouchesBoundary(recommendation: FileRecommendation, nodeId: string): boolean {
  const endpoints = [
    ...recommendation.relationshipDetails.flatMap((relationship) => [stringValue(relationship.from), stringValue(relationship.to)]),
    ...recommendation.anchorDetails.map((anchor) => stringValue(anchor.id))
  ];
  return endpoints.some((endpoint) => endpointTouchesNode(endpoint, nodeId));
}

function relationshipTouchesNode(relationship: Record<string, unknown>, nodeId: string): boolean {
  return [stringValue(relationship.from), stringValue(relationship.to)].some((endpoint) => endpointTouchesNode(endpoint, nodeId));
}

function endpointTouchesNode(endpoint: string, nodeId: string): boolean {
  return endpoint === nodeId || endpoint.startsWith(`${nodeId}.`) || nodeId.startsWith(`${endpoint}.`);
}

function selectFiles(files: string[], pattern: RegExp, exclude: string): string[] {
  return uniqueStrings(files
    .filter((file) => file && file !== exclude && pattern.test(file))
    .slice(0, 4));
}

function boundaryScore(
  nodeId: string,
  symbol: SymbolEvidenceRow | undefined,
  roles: string[],
  projects: string[],
  queryTerms: Set<string>,
  memberCount: number
): number {
  const roleScore = roles.reduce((score, role) => score + (role === "request-dto" || role === "response-dto" ? 6 : 4), 0);
  const kindScore = ["class", "record", "struct", "interface"].includes(symbol?.kind ?? "") ? 4 : 0;
  const text = `${nodeId} ${symbol?.name ?? ""} ${symbol?.file ?? ""}`.toLowerCase();
  const queryScore = [...queryTerms].filter((term) => text.includes(term)).length * 2;
  return roleScore + projects.length * 3 + kindScore + queryScore + Math.min(2, memberCount * 0.25);
}

function sharedContractMessage(name: string, declaredIn: Record<string, number>, usedFrom: string[], roles: string[]): string {
  const declared = Object.keys(declaredIn);
  const declaredText = declared.length ? declared.join(", ") : "a shared project";
  const usedText = usedFrom.length ? usedFrom.join(", ") : "other indexed projects";
  const roleText = roles.includes("request-dto")
    ? "request DTO"
    : roles.includes("response-dto")
      ? "response DTO"
      : "domain contract";
  return `${name} is a shared ${roleText}: declared in ${declaredText} and used from ${usedText}. Update the contract and consuming projects together.`;
}

function compactNodeName(nodeId: string): string {
  return nodeId
    .replace(/^symbol:csharp:/u, "")
    .split(/[.]/u)
    .slice(-1)[0] || nodeId;
}

function groupRows<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const groupKey = key(row);
    const group = grouped.get(groupKey) ?? [];
    group.push(row);
    grouped.set(groupKey, group);
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
