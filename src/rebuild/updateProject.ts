import * as fs from "fs/promises";
import * as path from "path";
import { analyzeAspNetConventions } from "../analyzers/aspnetConventionAnalyzer";
import { analyzeDotnetProjects } from "../analyzers/dotnetProjectAnalyzer";
import { analyzeVanillaWeb } from "../analyzers/webAnalyzer";
import { defaultMaxFileSizeBytes, defaultOutputFolder } from "../config/defaults";
import { renderAgentReadme } from "../context/agentContext";
import { detectCodeHealthFindings } from "../findings/codeHealthDetector";
import { diffFiles } from "../doctor/mapDoctor";
import {
  FileRecord,
  FindingRecord,
  PatternRecord,
  ProjectAnalyzerRun,
  ReferenceRecord,
  RelationshipRecord,
  SymbolRecord
} from "../model/records";
import { detectPatterns, renderConventionsMarkdown } from "../patterns/patternDetector";
import { scanWorkspace } from "../scanner/fileScanner";
import { readJsonl } from "../storage/jsonlReader";
import { writeJsonl } from "../storage/jsonlWriter";
import { createManifest, writeManifest } from "../storage/manifest";
import { createProjectMetadata, writeProjectMetadata } from "../storage/projectMetadata";
import { rebuildSqliteIndex } from "../storage/sqliteIndex";
import { rebuildProject, RebuildProjectOptions, RebuildProjectResult } from "./rebuildProject";

export interface UpdateProjectResult extends RebuildProjectResult {
  mode: "skipped" | "partial" | "full";
  addedFiles: string[];
  changedFiles: string[];
  deletedFiles: string[];
  reason: string;
}

const webExtensions = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".html", ".htm", ".cshtml", ".razor"]);
const csharpSemanticExtensions = new Set([".cs", ".csproj", ".sln", ".props", ".targets"]);

export async function updateProject(options: RebuildProjectOptions): Promise<UpdateProjectResult> {
  const outputFolderName = options.outputFolder ?? defaultOutputFolder;
  const outputFolder = path.join(options.workspaceRoot, outputFolderName);
  const progress = options.onProgress ?? (() => undefined);

  progress("Scanning workspace files");
  const scanResult = await scanWorkspace(options.workspaceRoot, {
    maxFileSizeBytes: options.maxFileSizeBytes ?? defaultMaxFileSizeBytes,
    outputFolder: outputFolderName,
    ...options.scanOptions
  });
  const currentFiles = scanResult.files;
  const previousFiles = await readJsonl<FileRecord>(path.join(outputFolder, "files.jsonl"));

  if (previousFiles.length === 0) {
    return fullRebuild(options, "No existing files.jsonl map was found.");
  }
  if (!(await pathExists(path.join(outputFolder, "findings.jsonl")))) {
    return fullRebuild(options, "The existing map predates code-health findings and requires a schema rebuild.");
  }

  const diff = diffFiles(previousFiles, currentFiles);
  if (diff.addedFiles.length === 0 && diff.changedFiles.length === 0 && diff.deletedFiles.length === 0) {
    return {
      outputFolder,
      fileCount: currentFiles.length,
      symbolCount: (await readJsonl<SymbolRecord>(path.join(outputFolder, "symbols.jsonl"))).length,
      referenceCount: (await readJsonl<ReferenceRecord>(path.join(outputFolder, "references.jsonl"))).length,
      relationshipCount: (await readJsonl<RelationshipRecord>(path.join(outputFolder, "relationships.jsonl"))).length,
      patternCount: (await readJsonl<PatternRecord>(path.join(outputFolder, "patterns.jsonl"))).length,
      findingCount: (await readJsonl<FindingRecord>(path.join(outputFolder, "findings.jsonl"))).length,
      analyzerRuns: await readAnalyzerRuns(outputFolder),
      scanSummary: scanResult.summary,
      mode: "skipped",
      reason: "No file hash changes detected.",
      ...diff
    };
  }

  if (hasCSharpSemanticChange(diff, previousFiles, currentFiles)) {
    return fullRebuild(options, "C# or project files changed; Roslyn semantic analysis requires a full rebuild.", diff);
  }

  progress("Reading existing graph records");
  const existingSymbols = await readJsonl<SymbolRecord>(path.join(outputFolder, "symbols.jsonl"));
  const existingReferences = await readJsonl<ReferenceRecord>(path.join(outputFolder, "references.jsonl"));
  const existingRelationships = await readJsonl<RelationshipRecord>(path.join(outputFolder, "relationships.jsonl"));

  progress("Refreshing vanilla web graph records");
  const existingCSharpSymbols = existingSymbols.filter((symbol) => symbol.language === "csharp");
  const webResult = await analyzeVanillaWeb(options.workspaceRoot, currentFiles, existingCSharpSymbols);
  const dotnetProjectResult = await analyzeDotnetProjects(options.workspaceRoot, currentFiles);
  const symbols = [
    ...existingSymbols.filter((record) => !isWebSymbol(record) && record.kind !== "project"),
    ...webResult.symbols,
    ...dotnetProjectResult.symbols
  ].sort(byId);
  const references = [...existingReferences.filter((record) => !isWebFile(record.file)), ...webResult.references].sort(byId);
  const conventionResult = analyzeAspNetConventions(currentFiles, symbols);
  const relationships = uniqueById([
    ...existingRelationships.filter((record) => !isWebRelationship(record) && record.type !== "PROJECT_REFERENCES" && !isAspNetConventionRelationship(record)),
    ...webResult.relationships,
    ...dotnetProjectResult.relationships,
    ...conventionResult.relationships
  ]).sort(byId);
  const patterns = detectPatterns({ symbols, relationships });
  const findings = await detectCodeHealthFindings({ workspaceRoot: options.workspaceRoot, symbols, references, relationships });

  progress("Writing updated graph files");
  await fs.mkdir(outputFolder, { recursive: true });
  await writeJsonl(path.join(outputFolder, "files.jsonl"), currentFiles);
  await writeJsonl(path.join(outputFolder, "symbols.jsonl"), symbols);
  await writeJsonl(path.join(outputFolder, "references.jsonl"), references);
  await writeJsonl(path.join(outputFolder, "relationships.jsonl"), relationships);
  await writeJsonl(path.join(outputFolder, "patterns.jsonl"), patterns);
  await writeJsonl(path.join(outputFolder, "findings.jsonl"), findings);
  await fs.writeFile(path.join(outputFolder, "conventions.md"), renderConventionsMarkdown(patterns), "utf8");

  const analyzerRuns: ProjectAnalyzerRun[] = [
    {
      id: "roslyn",
      status: currentFiles.some((file) => file.extension === ".cs") ? "completed" : "skipped",
      recordCounts: {
        symbols: symbols.filter((symbol) => symbol.language === "csharp").length,
        references: references.filter((reference) => !isWebFile(reference.file)).length,
        relationships: relationships.filter((relationship) => !isWebRelationship(relationship)).length,
        patterns: patterns.filter((pattern) => pattern.language === "csharp" || pattern.id.startsWith("pattern:dotnet") || pattern.id.startsWith("pattern:aspnet")).length
      }
    },
    {
      id: "vanilla-web",
      status: currentFiles.some((file) => webExtensions.has(file.extension)) ? "completed" : "skipped",
      recordCounts: {
        symbols: webResult.symbols.length,
        references: webResult.references.length,
        relationships: webResult.relationships.length,
        patterns: patterns.filter((pattern) => pattern.id.startsWith("pattern:web") || pattern.id.startsWith("pattern:react")).length
      }
    }
  ];

  const projectMetadata = createProjectMetadata({
    workspaceRoot: options.workspaceRoot,
    files: currentFiles,
    symbols,
    references,
    relationships,
    patternsCount: patterns.length,
    findingsCount: findings.length,
    analyzerRuns
  });

  progress("Writing project metadata and SQLite index");
  await writeProjectMetadata(outputFolder, projectMetadata);
  await fs.writeFile(path.join(outputFolder, "agent-readme.md"), renderAgentReadme(projectMetadata), "utf8");
  await rebuildSqliteIndex(path.join(outputFolder, "index.sqlite"), {
    files: currentFiles,
    symbols,
    references,
    relationships,
    patterns,
    findings,
    project: projectMetadata
  });
  await writeManifest(
    outputFolder,
    createManifest(options.workspaceRoot, {
      fileCount: currentFiles.length,
      symbolCount: symbols.length,
      relationshipCount: relationships.length,
      patternCount: patterns.length,
      findingCount: findings.length
    })
  );

  return {
    outputFolder,
    fileCount: currentFiles.length,
    symbolCount: symbols.length,
    referenceCount: references.length,
    relationshipCount: relationships.length,
    patternCount: patterns.length,
    findingCount: findings.length,
    analyzerRuns,
    scanSummary: scanResult.summary,
    mode: "partial",
    reason: "Updated changed file metadata and refreshed vanilla web graph records without rerunning Roslyn.",
    ...diff
  };
}

async function readAnalyzerRuns(outputFolder: string): Promise<ProjectAnalyzerRun[]> {
  try {
    const project = JSON.parse(await fs.readFile(path.join(outputFolder, "project.json"), "utf8")) as { analyzerRuns?: ProjectAnalyzerRun[] };
    return project.analyzerRuns ?? [];
  } catch {
    return [];
  }
}

async function fullRebuild(
  options: RebuildProjectOptions,
  reason: string,
  diff: Pick<UpdateProjectResult, "addedFiles" | "changedFiles" | "deletedFiles"> = { addedFiles: [], changedFiles: [], deletedFiles: [] }
): Promise<UpdateProjectResult> {
  const result = await rebuildProject(options);
  return {
    ...result,
    mode: "full",
    reason,
    ...diff
  };
}

function hasCSharpSemanticChange(
  diff: Pick<UpdateProjectResult, "addedFiles" | "changedFiles" | "deletedFiles">,
  previousFiles: FileRecord[],
  currentFiles: FileRecord[]
): boolean {
  const filesByPath = new Map([...previousFiles, ...currentFiles].map((file) => [file.path, file]));
  return [...diff.addedFiles, ...diff.changedFiles, ...diff.deletedFiles].some((filePath) => csharpSemanticExtensions.has(filesByPath.get(filePath)?.extension ?? path.extname(filePath).toLowerCase()));
}

function isWebSymbol(symbol: SymbolRecord): boolean {
  return symbol.language === "javascript" || symbol.language === "typescript" || symbol.language === "razor" || symbol.language === "html" || isWebFile(symbol.file);
}

function isWebRelationship(relationship: RelationshipRecord): boolean {
  return (
    isWebFile(relationship.file ?? "") ||
    relationship.id.includes(":web:") ||
    relationship.id.includes(":react:") ||
    relationship.from.startsWith("symbol:react:") ||
    relationship.from.startsWith("symbol:javascript:") ||
    relationship.from.startsWith("symbol:razor:") ||
    relationship.from.startsWith("route:web:") ||
    relationship.to.startsWith("symbol:react:") ||
    relationship.to.startsWith("prop:react:") ||
    relationship.to.startsWith("event:react:") ||
    relationship.to.startsWith("symbol:javascript:") ||
    relationship.to.startsWith("symbol:razor:") ||
    relationship.to.startsWith("route:web:")
  );
}

function isWebFile(filePath: string): boolean {
  return webExtensions.has(path.extname(filePath).toLowerCase());
}

function isAspNetConventionRelationship(relationship: RelationshipRecord): boolean {
  return relationship.id.startsWith("relationship:aspnet:view-component-renders:");
}

function byId<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

function uniqueById<T extends { id: string }>(records: T[]): T[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.id)) {
      return false;
    }
    seen.add(record.id);
    return true;
  });
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
