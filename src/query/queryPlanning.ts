import { compactResponse } from "./queryEvidence";
import { buildSharedContractEditChecklists } from "./querySharedContracts";
import type { QueryResponse } from "./queryTypes";
import { stringValue, uniqueStrings } from "./queryUtils";
import type { FileRecommendation } from "./whereToAddRanking";

export interface PlanContextPruning {
  relationships: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
}

export type PlanRelationshipPruner = (
  query: string,
  files: string[],
  recommendations: FileRecommendation[],
  boundaries: Array<Record<string, unknown>>,
  relationships: Array<Record<string, unknown>>
) => PlanContextPruning;

export function buildPlanChangeResponse(
  query: string,
  where: QueryResponse,
  hotspots: QueryResponse,
  drift: QueryResponse,
  pruneRelationships: PlanRelationshipPruner
): QueryResponse {
  const sharedContractBoundaries = where.evidence
    .filter((item) => item.recordType === "sharedContractBoundary")
    .slice(0, 2);
  const boundaryFiles = sharedContractBoundaries.map((item) => stringValue(item.file)).filter(Boolean);
  const files = uniqueStrings([...boundaryFiles, ...where.files]).slice(0, 6);
  const fileSet = new Set(files);
  const fileRecommendations = where.evidence
    .filter((item): item is FileRecommendation => item.recordType === "fileRecommendation" && fileSet.has(stringValue(item.file)))
    .slice(0, 6);
  const sharedContractChecklists = buildSharedContractEditChecklists(sharedContractBoundaries, fileRecommendations, where.relationships);
  const contextPruning = pruneRelationships(query, files, fileRecommendations, sharedContractBoundaries, where.relationships);
  const contextPruningEvidence = contextPruning.evidence.length
    ? contextPruning.evidence
    : where.evidence.filter((item) => item.recordType === "contextPruning").slice(0, 1);
  const patternFit = where.evidence.filter((item) => item.recordType === "patternFit").slice(0, 2);
  const caveats = where.evidence.filter((item) => item.recordType === "caveat").slice(0, 2);
  const avoidHotspots = planAvoidFiles(hotspots, fileSet);
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
      ...sharedContractBoundaries,
      ...sharedContractChecklists,
      ...contextPruningEvidence,
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
    relationships: contextPruning.relationships,
    patterns: where.patterns,
    nextQueries: uniqueStrings([
      contextCommand,
      ...where.nextQueries.slice(0, 4),
      "kraken-atlas query hotspots",
      "kraken-atlas query drift"
    ]).slice(0, 8)
  });
}

function planAvoidFiles(hotspots: QueryResponse, fileSet: Set<string>): Array<Record<string, unknown>> {
  return hotspots.evidence
    .filter((item) => item.recordType === "architectureHotspot" && !fileSet.has(stringValue(item.file)))
    .slice(0, 3)
    .map((item) => ({
      recordType: "planAvoidFile",
      file: item.file,
      role: item.role,
      reason: "Central/shared hotspot. Inspect only if this change touches shared setup, configuration, routing, or cross-cutting behavior."
    }));
}
