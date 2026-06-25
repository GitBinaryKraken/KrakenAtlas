import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import type { FindingRecord, ReferenceRecord, RelationshipRecord, SymbolRecord } from "../model/records";

export interface CodeHealthDetectionInput {
  workspaceRoot: string;
  symbols: SymbolRecord[];
  references: ReferenceRecord[];
  relationships: RelationshipRecord[];
}

export async function detectCodeHealthFindings(input: CodeHealthDetectionInput): Promise<FindingRecord[]> {
  const [orphans, duplicates] = await Promise.all([
    detectOrphanCallables(input),
    detectDuplicateCodeBlocks(input.workspaceRoot, input.symbols)
  ]);
  return [...orphans, ...duplicates].sort((left, right) => left.id.localeCompare(right.id));
}

async function detectOrphanCallables(input: CodeHealthDetectionInput): Promise<FindingRecord[]> {
  const incomingRelationships = new Map<string, number>();
  for (const relationship of input.relationships) {
    if (relationship.type === "CONTAINS") {
      continue;
    }
    incomingRelationships.set(relationship.to, (incomingRelationships.get(relationship.to) ?? 0) + 1);
  }
  const incomingReferences = new Map<string, number>();
  for (const reference of input.references) {
    if (reference.resolvedSymbolId) {
      incomingReferences.set(reference.resolvedSymbolId, (incomingReferences.get(reference.resolvedSymbolId) ?? 0) + 1);
    }
  }

  const candidates = input.symbols
    .filter(isOrphanCandidate)
    .filter((symbol) => !incomingRelationships.has(symbol.id) && !incomingReferences.has(symbol.id));
  const sourceByFile = new Map<string, string>();
  for (const file of new Set(input.symbols.filter((symbol) => symbol.language === "csharp").map((symbol) => symbol.file))) {
    try {
      sourceByFile.set(file, await fs.readFile(path.join(input.workspaceRoot, file), "utf8"));
    } catch {
      // Missing source cannot provide the textual safety check; retain static evidence behavior.
    }
  }

  return candidates
    .filter((symbol) => textualOccurrenceCount(symbol, sourceByFile) <= 1)
    .map((symbol) => ({
      recordType: "finding" as const,
      id: `finding:orphan:${symbol.id}`,
      kind: "orphan-callable" as const,
      title: `Unreferenced ${visibility(symbol)} method: ${symbol.name}`,
      severity: "info" as const,
      confidence: visibility(symbol) === "private" ? 0.9 : 0.75,
      summary: `No mapped incoming call or reference targets this ${visibility(symbol)} C# method.`,
      locations: [{ symbolId: symbol.id, file: symbol.file, range: symbol.range }],
      evidence: [
        "incomingRelationships=0",
        "incomingReferences=0",
        "textualNameOccurrences<=1",
        `visibility=${visibility(symbol)}`
      ],
      caveats: ["Candidate only. Verify reflection, dynamic invocation, framework conventions, generated code, and external consumers before deletion."]
    }));
}

function textualOccurrenceCount(symbol: SymbolRecord, sourceByFile: Map<string, string>): number {
  const expression = new RegExp(`\\b${escapeRegExp(symbol.name)}\\b`, "gu");
  const sources = symbol.modifiers?.includes("private")
    ? [sourceByFile.get(symbol.file) ?? ""]
    : [...sourceByFile.values()];
  return sources.reduce((count, source) => count + [...source.matchAll(expression)].length, 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function detectDuplicateCodeBlocks(workspaceRoot: string, symbols: SymbolRecord[]): Promise<FindingRecord[]> {
  const candidates = symbols.filter(isDuplicateCandidate);
  const sourceByFile = new Map<string, string[]>();
  const groups = new Map<string, Array<{ symbol: SymbolRecord; fingerprint: string }>>();

  for (const symbol of candidates) {
    let lines = sourceByFile.get(symbol.file);
    if (!lines) {
      try {
        lines = (await fs.readFile(path.join(workspaceRoot, symbol.file), "utf8")).split(/\r?\n/u);
        sourceByFile.set(symbol.file, lines);
      } catch {
        continue;
      }
    }

    const source = lines.slice(Math.max(0, symbol.range.startLine - 1), symbol.range.endLine).join("\n");
    const body = extractCallableBody(source);
    const nonBlankLines = body.split(/\r?\n/u).filter((line) => line.trim()).length;
    const normalized = normalizeWhitespaceOutsideStrings(body);
    if (nonBlankLines < 5 || normalized.length < 100) {
      continue;
    }

    const fingerprint = crypto.createHash("sha256").update(normalized).digest("hex");
    const group = groups.get(fingerprint) ?? [];
    group.push({ symbol, fingerprint });
    groups.set(fingerprint, group);
  }

  return [...groups.values()]
    .filter((group) => group.length > 1 && new Set(group.map((item) => item.symbol.id)).size > 1)
    .map((group) => {
      const fingerprint = group[0].fingerprint;
      const names = group.map((item) => item.symbol.name);
      return {
        recordType: "finding" as const,
        id: `finding:duplicate:${fingerprint}`,
        kind: "duplicate-code-block" as const,
        title: `Duplicate callable body (${group.length} instances)`,
        severity: "warning" as const,
        confidence: 0.98,
        summary: `Exact normalized callable bodies were found in ${group.length} symbols: ${names.join(", ")}.`,
        locations: group.map(({ symbol }) => ({ symbolId: symbol.id, file: symbol.file, range: symbol.range })),
        evidence: [`fingerprint=sha256:${fingerprint}`, `instanceCount=${group.length}`, "comparison=exact-normalized-body"],
        caveats: ["Verify the duplication is not intentional before consolidating behavior or ownership."],
        fingerprint
      };
    });
}

function isOrphanCandidate(symbol: SymbolRecord): boolean {
  const modifiers = new Set(symbol.modifiers ?? []);
  return symbol.language === "csharp"
    && symbol.kind === "method"
    && (modifiers.has("private") || modifiers.has("internal"))
    && !["override", "abstract", "extern", "partial"].some((modifier) => modifiers.has(modifier))
    && !isExcludedFile(symbol.file)
    && !/(?:^|[,( ])(?:System\.)?EventArgs(?:[,) ]|$)/u.test(symbol.fullyQualifiedName ?? "")
    && !/^(Main|Invoke|InvokeAsync|Execute|ExecuteAsync|Dispose|DisposeAsync|OnGet|OnPost|OnPut|OnDelete|OnPatch)/u.test(symbol.name);
}

function isDuplicateCandidate(symbol: SymbolRecord): boolean {
  const modifiers = new Set(symbol.modifiers ?? []);
  return symbol.language === "csharp"
    && symbol.kind === "method"
    && !["abstract", "extern", "partial"].some((modifier) => modifiers.has(modifier))
    && !isExcludedFile(symbol.file);
}

function isExcludedFile(file: string): boolean {
  return /(^|\/)(bin|obj|generated|migrations?|tests?|test-fixtures)(\/|$)|\.g\.cs$/iu.test(file.replace(/\\/g, "/"));
}

function visibility(symbol: SymbolRecord): "private" | "internal" {
  return symbol.modifiers?.includes("private") ? "private" : "internal";
}

function extractCallableBody(source: string): string {
  const openBrace = source.indexOf("{");
  const closeBrace = source.lastIndexOf("}");
  if (openBrace >= 0 && closeBrace > openBrace) {
    return source.slice(openBrace + 1, closeBrace);
  }
  const arrow = source.indexOf("=>");
  return arrow >= 0 ? source.slice(arrow + 2).replace(/;\s*$/u, "") : source;
}

function normalizeWhitespaceOutsideStrings(source: string): string {
  let result = "";
  let quote = "";
  let escaped = false;
  let pendingSpace = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === '"' || character === "'") {
      if (pendingSpace && result) {
        result += " ";
      }
      pendingSpace = false;
      quote = character;
      result += character;
    } else if (/\s/u.test(character)) {
      pendingSpace = true;
    } else {
      if (pendingSpace && result) {
        result += " ";
      }
      pendingSpace = false;
      result += character;
    }
  }
  return result.trim();
}
