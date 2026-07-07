import {
  buildContextPruningResult,
  ContextProjectRow,
  ContextTagRow,
  contextPruningNodeIds
} from "./queryContextPruning";
import {
  compactResponse,
  patternEvidence
} from "./queryEvidence";
import { buildRecommendationNodeTagEvidence, NodeTagEvidence } from "./queryNodeTags";
import { enrichRecommendationsWithNodeGuidance } from "./queryRecommendationGuidance";
import {
  buildSharedContractBoundaryRecords,
  NodeMemberEvidenceRow,
  NodeProjectEvidenceRow,
  NodeRoleEvidenceRow,
  sharedContractCandidateNodeIds,
  SymbolEvidenceRow
} from "./querySharedContracts";
import {
  queryWantsBrowserQueryState,
  queryWantsCompositionRoot
} from "./queryText";
import { QueryResponse } from "./queryTypes";
import {
  booleanValue,
  mergeSearchRows,
  numberValue,
  placeholders,
  stringValue,
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

export interface WhereToAddDependencies {
  ambiguousContextResponse(queryType: string, query: string): QueryResponse | undefined;
  execJson(sql: string, params?: unknown[]): Array<Record<string, unknown>>;
  execRows(sql: string, params?: unknown[]): Array<Record<string, unknown>>;
  findFlow(query: string): QueryResponse;
  findRankedSearchRowsByTerms(query: string, limit: number): Array<Record<string, unknown>>;
  findRelevantPatterns(query: string): Array<Record<string, unknown>>;
  findSearchRowsByTerms(query: string, limit: number): Array<Record<string, unknown>>;
  scopePatternsToContext(patterns: Array<Record<string, unknown>>): Array<Record<string, unknown>>;
}

export function findWhereToAddQuery(query: string, dependencies: WhereToAddDependencies): QueryResponse {
  const ambiguity = dependencies.ambiguousContextResponse("where-to-add", query);
  if (ambiguity) {
    return ambiguity;
  }

  const searchRows = mergeSearchRows(dependencies.findSearchRowsByTerms(query, 60), dependencies.findRankedSearchRowsByTerms(query, 20));
  const flow = dependencies.findFlow(query);
  const patterns = dependencies.scopePatternsToContext(dependencies.findRelevantPatterns(query));
  const strongAnchors = flow.evidence.filter((item) => item.recordType === "strongAnchor");
  const rankedRecommendations = enrichRecommendationsWithNodeGuidance(
    query,
    enrichRecommendationsWithNodeTags(
      query,
      enrichRecommendationsWithUsageSummary(
        query,
        rankFileRecommendations(query, searchRows, flow.relationships, patterns, strongAnchors),
        dependencies
      ),
      dependencies
    ),
    (sql, params = []) => dependencies.execRows(sql, params),
    (sql, params = []) => dependencies.execJson(sql, params)
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
  const sharedContractBoundaries = buildSharedContractBoundaryEvidence(query, recommendations, flow.relationships, strongAnchors, dependencies);
  const contextPruning = pruneWhereToAddRelationshipsForContext(query, recommendations.map((recommendation) => recommendation.file), recommendations, sharedContractBoundaries, flow.relationships.slice(0, 12), dependencies);
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

export function pruneWhereToAddRelationshipsForContext(
  query: string,
  files: string[],
  recommendations: FileRecommendation[],
  boundaries: Array<Record<string, unknown>>,
  relationships: Array<Record<string, unknown>>,
  dependencies: Pick<WhereToAddDependencies, "execRows">
): { relationships: Array<Record<string, unknown>>; evidence: Array<Record<string, unknown>> } {
  const nodeIds = contextPruningNodeIds(relationships, boundaries);
  if (nodeIds.length === 0) {
    return { relationships, evidence: [] };
  }

  try {
    const tagRows: ContextTagRow[] = dependencies.execRows(
      `SELECT node_id, tag
       FROM node_tags
       WHERE node_id IN (${placeholders(nodeIds.length)})
       ORDER BY node_id, tag;`,
      nodeIds
    ).map((row) => ({
      nodeId: stringValue(row.node_id),
      tag: stringValue(row.tag)
    }));
    const projectRows: ContextProjectRow[] = dependencies.execRows(
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

function buildSharedContractBoundaryEvidence(
  query: string,
  recommendations: FileRecommendation[],
  relationships: Array<Record<string, unknown>>,
  strongAnchors: Array<Record<string, unknown>>,
  dependencies: Pick<WhereToAddDependencies, "execJson" | "execRows">
): Array<Record<string, unknown>> {
  const nodeIds = sharedContractCandidateNodeIds(recommendations, relationships, strongAnchors);
  if (nodeIds.length === 0) {
    return [];
  }

  try {
    const roleRows: NodeRoleEvidenceRow[] = dependencies.execRows(
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
    const projectRows: NodeProjectEvidenceRow[] = dependencies.execRows(
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
    const memberRows: NodeMemberEvidenceRow[] = dependencies.execRows(
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
    const symbolRows: SymbolEvidenceRow[] = dependencies.execJson(
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

function enrichRecommendationsWithUsageSummary(
  query: string,
  recommendations: FileRecommendation[],
  dependencies: Pick<WhereToAddDependencies, "execRows">
): FileRecommendation[] {
  if (recommendations.length === 0) {
    return recommendations;
  }

  try {
    const nodeIds = recommendations.map((recommendation) => `file:${recommendation.file}`);
    const rows = dependencies.execRows(
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

function enrichRecommendationsWithNodeTags(
  query: string,
  recommendations: FileRecommendation[],
  dependencies: Pick<WhereToAddDependencies, "execRows">
): FileRecommendation[] {
  if (recommendations.length === 0) {
    return recommendations;
  }

  try {
    const nodeIds = recommendations.map((recommendation) => `file:${recommendation.file}`);
    const rows = dependencies.execRows(
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
