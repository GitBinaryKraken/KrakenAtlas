import * as fs from "fs/promises";
import * as path from "path";
import {
  FileRecord,
  ProjectAnalyzerRun,
  ProjectLanguageSummary,
  ProjectMetadata,
  ReferenceRecord,
  RelationshipRecord,
  SymbolRecord
} from "../model/records";
import { CURRENT_MAP_SCHEMA_VERSION } from "./schemaVersion";

export interface ProjectMetadataInput {
  workspaceRoot: string;
  files: FileRecord[];
  symbols: SymbolRecord[];
  references: ReferenceRecord[];
  relationships: RelationshipRecord[];
  patternsCount: number;
  findingsCount?: number;
  analyzerRuns: ProjectAnalyzerRun[];
  generatedAt?: Date;
}

export function createProjectMetadata(input: ProjectMetadataInput): ProjectMetadata {
  const languages = summarizeLanguages(input.files);
  const primaryLanguage = languages.find((language) => language.primary)?.language ?? null;
  const projectTypes = detectProjectTypes(input.files, input.symbols, input.relationships);
  const workspaceRootName = path.basename(input.workspaceRoot);

  return {
    schemaVersion: CURRENT_MAP_SCHEMA_VERSION,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    workspaceName: workspaceRootName,
    workspaceRootName,
    primaryLanguage,
    languages,
    projectTypes,
    analyzerRuns: input.analyzerRuns,
    recordCounts: {
      files: input.files.length,
      symbols: input.symbols.length,
      references: input.references.length,
      relationships: input.relationships.length,
      patterns: input.patternsCount,
      findings: input.findingsCount ?? 0
    },
    agentGuidance: {
      readFirst: [
        ".kraken-atlas/project.json",
        ".kraken-atlas/relationships.jsonl",
        ".kraken-atlas/symbols.jsonl"
      ],
      queryStrategy: [
        "Start with project types and language counts.",
        "Query relationships before opening source files.",
        "Use symbols and line ranges to fetch only the smallest useful code slice.",
        "Prefer relationship evidence and next-hop graph records over broad file reads."
      ]
    }
  };
}

export async function writeProjectMetadata(outputFolder: string, metadata: ProjectMetadata): Promise<void> {
  await fs.mkdir(outputFolder, { recursive: true });
  await fs.writeFile(path.join(outputFolder, "project.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

function summarizeLanguages(files: FileRecord[]): ProjectLanguageSummary[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    counts.set(file.language, (counts.get(file.language) ?? 0) + 1);
  }

  const sorted = [...counts.entries()]
    .map(([language, fileCount]) => ({ language, fileCount }))
    .sort((left, right) => right.fileCount - left.fileCount || left.language.localeCompare(right.language));
  const primaryLanguage = sorted.find((language) => language.language !== "unknown")?.language ?? sorted[0]?.language;

  return sorted.map((language) => ({
    ...language,
    primary: language.language === primaryLanguage
  }));
}

function detectProjectTypes(files: FileRecord[], symbols: SymbolRecord[], relationships: RelationshipRecord[]): string[] {
  const projectTypes = new Set<string>();
  const paths = files.map((file) => file.path.toLowerCase());
  const languages = new Set(files.map((file) => file.language));
  const relationshipTypes = new Set(relationships.map((relationship) => relationship.type));

  if (paths.some((filePath) => filePath.endsWith(".csproj") || filePath.endsWith(".sln")) || languages.has("csharp")) {
    projectTypes.add("dotnet");
  }

  if (languages.has("csharp")) {
    projectTypes.add("csharp");
  }

  if (
    symbols.some((symbol) => symbol.patterns?.includes("aspnet-controller")) ||
    relationships.some((relationship) => relationship.type === "MAPS_ROUTE" && (relationship.from.startsWith("symbol:csharp:") || relationship.id.includes(":aspnet:")))
  ) {
    projectTypes.add("aspnet-core");
  }

  if (symbols.some((symbol) => symbol.patterns?.includes("aspnet-controller-route"))) {
    projectTypes.add("mvc-controller");
  }

  if (symbols.some((symbol) => symbol.patterns?.includes("minimal-api-route"))) {
    projectTypes.add("minimal-api");
  }

  if (languages.has("razor")) {
    projectTypes.add("razor");
  }

  if (files.some((file) => [".js", ".mjs", ".cjs"].includes(file.extension)) || symbols.some((symbol) => symbol.patterns?.some((pattern) => pattern.startsWith("vanilla-js")))) {
    projectTypes.add("vanilla-js");
  }
  if (languages.has("typescript")) {
    projectTypes.add("typescript");
  }
  if (
    symbols.some((symbol) => symbol.patterns?.some((pattern) => pattern.startsWith("react-"))) ||
    relationships.some((relationship) => relationship.type.startsWith("RENDERS_COMPONENT") || relationship.type === "USES_HOOK")
  ) {
    projectTypes.add("react");
  }

  return [...projectTypes].sort();
}
