import { queryTerms } from "./queryText";
import { uniqueStrings } from "./queryUtils";

export interface NodeTagEvidence {
  tag: string;
  confidence: number;
  sources: string[];
}

export interface RecommendationNodeTagEvidence {
  nodeTags: NodeTagEvidence[];
  matchedTags: string[];
  matchedTerms: string[];
  scoreBoost: number;
  reason?: string;
}

const lowSignalTags = new Set([
  "csharp",
  "css",
  "dotnet",
  "dotnet-project",
  "generated",
  "html",
  "javascript",
  "json",
  "razor",
  "source",
  "static-asset",
  "typescript",
  "xml"
]);

export function buildRecommendationNodeTagEvidence(query: string, tags: NodeTagEvidence[]): RecommendationNodeTagEvidence {
  const terms = queryTerms(query);
  const lowerQuery = query.toLowerCase();
  const rankedTags = uniqueTagEvidence(tags)
    .filter((entry) => !lowSignalTags.has(entry.tag))
    .sort((left, right) => right.confidence - left.confidence || left.tag.localeCompare(right.tag));
  const matched = rankedTags
    .map((entry) => ({ entry, score: nodeTagMatchScore(entry, terms, lowerQuery) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || right.entry.confidence - left.entry.confidence || left.entry.tag.localeCompare(right.entry.tag))
    .slice(0, 6);
  const matchedEntries = matched.map((match) => match.entry);
  const matchedTags = matchedEntries.map((entry) => entry.tag);
  const matchedTagSet = new Set(matchedTags);
  const nodeTags = [...matchedEntries, ...rankedTags.filter((entry) => !matchedTagSet.has(entry.tag))].slice(0, 8);
  const matchedTerms = uniqueStrings(matchedEntries.flatMap((entry) => entry.tag.split("-").filter((part) => terms.includes(part))));
  const scoreBoost = Math.min(12, matched.reduce((total, match) => total + match.score, 0));

  return {
    nodeTags,
    matchedTags,
    matchedTerms,
    scoreBoost,
    reason: matchedTags.length ? `Node tag match: ${matchedTags.slice(0, 4).join(", ")}.` : undefined
  };
}

function uniqueTagEvidence(tags: NodeTagEvidence[]): NodeTagEvidence[] {
  const bestByTag = new Map<string, NodeTagEvidence>();
  for (const entry of tags) {
    if (!entry.tag) {
      continue;
    }

    const existing = bestByTag.get(entry.tag);
    if (!existing || entry.confidence > existing.confidence) {
      bestByTag.set(entry.tag, {
        tag: entry.tag,
        confidence: entry.confidence,
        sources: uniqueStrings(entry.sources)
      });
    }
  }
  return [...bestByTag.values()];
}

function nodeTagMatchScore(entry: NodeTagEvidence, terms: string[], lowerQuery: string): number {
  if (terms.length === 0) {
    return 0;
  }

  const tag = entry.tag;
  const parts = tag.split("-").filter(Boolean);
  const phrase = parts.join(" ");
  const matchingPartCount = uniqueStrings(parts.filter((part) => terms.includes(part))).length;
  if (parts.length >= 2 && (matchingPartCount >= 2 || lowerQuery.includes(phrase))) {
    return 2 + entry.confidence * 2 + Math.min(2, matchingPartCount * 0.5);
  }

  if (parts.length === 1 && tag.length >= 5 && terms.includes(tag)) {
    return 0.75 + entry.confidence;
  }

  return 0;
}
