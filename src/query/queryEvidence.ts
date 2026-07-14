import type { QueryResponse } from "./queryTypes";
import { relationshipSourceKind } from "../model/mapProvenance";
import { numberValue, stringValue, sumCounts, uniqueStrings } from "./queryUtils";

export function compactResponse(input: Partial<QueryResponse> & { query: string; answer: string; confidence: number }): QueryResponse {
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

export function symbolEvidence(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    file: row.file,
    range: row.range,
    confidence: row.confidence
  };
}

export function strongAnchorEvidence(row: Record<string, unknown>): Record<string, unknown> {
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

export function referenceEvidence(row: Record<string, unknown>): Record<string, unknown> {
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

export function relationshipFiles(rows: Array<Record<string, unknown>>): string[] {
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

export function searchEvidence(row: Record<string, unknown>): Record<string, unknown> {
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

export function buildReferenceSummary(
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

export function searchRecordLine(row: Record<string, unknown>): number | undefined {
  const recordId = stringValue(row.record_id);
  const file = stringValue(row.path);
  const referencePrefix = file ? `reference:web:${file}:` : "";
  if (referencePrefix && recordId.startsWith(referencePrefix)) {
    const line = Number.parseInt(recordId.slice(referencePrefix.length).split(":")[0], 10);
    return Number.isFinite(line) ? line : undefined;
  }
  return undefined;
}

export function relationshipEvidence(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    type: row.type,
    sourceKind: stringValue(row.sourceKind) || relationshipSourceKind(row),
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

export function nodeLocation(id: string, nodeKind: string, file: string, range: unknown, sourceKind: string, approximate: boolean): Record<string, unknown> {
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

export function normalizeRange(range: unknown): Record<string, number> {
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

export function firstLineRange(): Record<string, number> {
  return {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 1
  };
}

export function inferSyntheticNodeKind(endpointId: string): string {
  const prefix = endpointId.split(":", 1)[0];
  if (prefix) {
    return prefix;
  }

  return "synthetic";
}

export function patternEvidence(row: Record<string, unknown>): Record<string, unknown> {
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

export function buildPatternMapSummaries(patterns: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
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

export function averagePatternConfidence(patterns: Array<Record<string, unknown>>): number {
  if (patterns.length === 0) {
    return 0;
  }

  const total = patterns.reduce((sum, pattern) => sum + numberValue(pattern.confidence), 0);
  return Math.round((total / patterns.length) * 100) / 100;
}
