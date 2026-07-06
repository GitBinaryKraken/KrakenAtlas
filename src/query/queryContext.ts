import * as path from "path";
import type { QueryContext } from "./queryTypes";

export function inferProjectNameFromFile(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, "/");
  const firstSegment = normalized.split("/")[0];
  return firstSegment && firstSegment !== normalized ? firstSegment : undefined;
}

export function inferProjectNameFromSymbol(symbolId: string): string | undefined {
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

export function normalizeQueryContext(projectContext: string | undefined): QueryContext | undefined {
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

export function contextFromProjectSymbol(name: string, file: string): QueryContext | undefined {
  const normalizedFile = file.replace(/\\/g, "/");
  const folder = normalizedFile.endsWith(".csproj") ? normalizedFile.split("/").slice(0, -1).join("/") : "";
  return normalizeQueryContext(folder || name);
}

export function uniqueContexts(contexts: QueryContext[]): QueryContext[] {
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

export function resolveContextCandidate(requested: QueryContext, candidates: QueryContext[]): { context?: QueryContext; ambiguity?: QueryContext[] } {
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
