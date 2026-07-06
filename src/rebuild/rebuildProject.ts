import * as fs from "fs/promises";
import * as path from "path";
import { analyzeAspNetConventions } from "../analyzers/aspnetConventionAnalyzer";
import { analyzeDotnetProjects } from "../analyzers/dotnetProjectAnalyzer";
import { runRoslynAnalyzer } from "../analyzers/roslynAnalyzer";
import { analyzeVanillaWeb } from "../analyzers/webAnalyzer";
import { defaultMaxFileSizeBytes, defaultOutputFolder } from "../config/defaults";
import { renderAgentReadme } from "../context/agentContext";
import { detectCodeHealthFindings } from "../findings/codeHealthDetector";
import { ProjectAnalyzerRun } from "../model/records";
import { detectPatterns, renderConventionsMarkdown } from "../patterns/patternDetector";
import { ScanOptions, ScanSummary, scanWorkspace } from "../scanner/fileScanner";
import { writeJsonl } from "../storage/jsonlWriter";
import { createManifest, writeManifest } from "../storage/manifest";
import { createProjectMetadata, writeProjectMetadata } from "../storage/projectMetadata";
import { rebuildSqliteIndex } from "../storage/sqliteIndex";

export interface RebuildProjectOptions {
  extensionPath: string;
  workspaceRoot: string;
  outputFolder?: string;
  maxFileSizeBytes?: number;
  scanOptions?: Omit<ScanOptions, "maxFileSizeBytes" | "outputFolder">;
  onProgress?: (message: string) => void;
}

export interface RebuildProjectResult {
  outputFolder: string;
  fileCount: number;
  symbolCount: number;
  referenceCount: number;
  relationshipCount: number;
  patternCount: number;
  findingCount: number;
  analyzerRuns: ProjectAnalyzerRun[];
  scanSummary?: ScanSummary;
}

export async function rebuildProject(options: RebuildProjectOptions): Promise<RebuildProjectResult> {
  const outputFolderName = options.outputFolder ?? defaultOutputFolder;
  const outputFolder = path.join(options.workspaceRoot, outputFolderName);
  const progress = options.onProgress ?? (() => undefined);

  progress("Preparing output folder");
  await fs.mkdir(outputFolder, { recursive: true });

  progress("Scanning workspace files");
  const scanResult = await scanWorkspace(options.workspaceRoot, {
    maxFileSizeBytes: options.maxFileSizeBytes ?? defaultMaxFileSizeBytes,
    outputFolder: outputFolderName,
    ...options.scanOptions
  });
  const files = scanResult.files;

  progress("Writing files.jsonl");
  await writeJsonl(path.join(outputFolder, "files.jsonl"), files);

  progress("Running C# analyzer");
  const hasCSharpFiles = files.some((file) => file.extension === ".cs");
  const roslynAnalysis = await runAnalyzerSafely(async () => runRoslynAnalyzer(options.extensionPath, options.workspaceRoot, outputFolder, hasCSharpFiles));
  const roslynResult = roslynAnalysis.result ?? { symbols: [], references: [], relationships: [] };

  progress("Running web analyzer");
  const webResult = await analyzeVanillaWeb(options.workspaceRoot, files, roslynResult.symbols);
  progress("Running .NET project analyzer");
  const dotnetProjectResult = await analyzeDotnetProjects(options.workspaceRoot, files);
  const symbols = [...roslynResult.symbols, ...webResult.symbols, ...dotnetProjectResult.symbols];
  const references = [...roslynResult.references, ...webResult.references];
  const conventionResult = analyzeAspNetConventions(files, symbols);
  const relationships = uniqueById([...roslynResult.relationships, ...webResult.relationships, ...dotnetProjectResult.relationships, ...conventionResult.relationships]);
  const patterns = detectPatterns({ symbols, relationships });
  progress("Detecting code-health findings");
  const findings = await detectCodeHealthFindings({ workspaceRoot: options.workspaceRoot, symbols, references, relationships });

  progress("Writing graph JSONL files");
  await writeJsonl(path.join(outputFolder, "symbols.jsonl"), symbols);
  await writeJsonl(path.join(outputFolder, "references.jsonl"), references);
  await writeJsonl(path.join(outputFolder, "relationships.jsonl"), relationships);
  await writeJsonl(path.join(outputFolder, "patterns.jsonl"), patterns);
  await writeJsonl(path.join(outputFolder, "findings.jsonl"), findings);
  await fs.writeFile(path.join(outputFolder, "conventions.md"), renderConventionsMarkdown(patterns), "utf8");

  const analyzerRuns: ProjectAnalyzerRun[] = [
    {
      id: "roslyn",
      status: hasCSharpFiles ? roslynAnalysis.status : "skipped",
      diagnosticCategory: roslynAnalysis.diagnosticCategory,
      diagnosticLabel: roslynAnalysis.diagnosticLabel,
      message: roslynAnalysis.message,
      detail: roslynAnalysis.detail,
      remediation: roslynAnalysis.remediation,
      recordCounts: {
        symbols: roslynResult.symbols.length,
        references: roslynResult.references.length,
        relationships: roslynResult.relationships.length,
        patterns: patterns.filter((pattern) => pattern.language === "csharp" || pattern.id.startsWith("pattern:dotnet") || pattern.id.startsWith("pattern:aspnet")).length
      }
    },
    {
      id: "vanilla-web",
      status: files.some((file) => [".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".html", ".htm", ".cshtml", ".razor"].includes(file.extension))
        ? "completed"
        : "skipped",
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
    files,
    symbols,
    references,
    relationships,
    patternsCount: patterns.length,
    findingsCount: findings.length,
    analyzerRuns
  });

  progress("Writing project.json");
  await writeProjectMetadata(outputFolder, projectMetadata);
  await fs.writeFile(path.join(outputFolder, "agent-readme.md"), renderAgentReadme(projectMetadata), "utf8");

  progress("Building index.sqlite");
  await rebuildSqliteIndex(path.join(outputFolder, "index.sqlite"), {
    files,
    symbols,
    references,
    relationships,
    patterns,
    findings,
    project: projectMetadata
  });

  progress("Writing manifest.json");
  await writeManifest(
    outputFolder,
    createManifest(options.workspaceRoot, {
      fileCount: files.length,
      symbolCount: symbols.length,
      relationshipCount: relationships.length,
      patternCount: patterns.length,
      findingCount: findings.length
    })
  );

  return {
    outputFolder,
    fileCount: files.length,
    symbolCount: symbols.length,
    referenceCount: references.length,
    relationshipCount: relationships.length,
    patternCount: patterns.length,
    findingCount: findings.length,
    analyzerRuns,
    scanSummary: scanResult.summary
  };
}

async function runAnalyzerSafely<T>(run: () => Promise<T>): Promise<{
  status: "completed" | "failed";
  result?: T;
  diagnosticCategory?: ProjectAnalyzerRun["diagnosticCategory"];
  diagnosticLabel?: string;
  message?: string;
  detail?: string;
  remediation?: string[];
}> {
  try {
    return {
      status: "completed",
      result: await run()
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const diagnostic = classifyAnalyzerFailure(detail);
    return {
      status: "failed",
      diagnosticCategory: diagnostic.category,
      diagnosticLabel: diagnostic.label,
      message: `C# analyzer failed (${diagnostic.label}). The map was written without Roslyn symbol and relationship records.`,
      detail: sanitizeAnalyzerDetail(detail),
      remediation: diagnostic.remediation
    };
  }
}

function classifyAnalyzerFailure(detail: string): {
  category: NonNullable<ProjectAnalyzerRun["diagnosticCategory"]>;
  label: string;
  remediation: string[];
} {
  const normalized = detail.toLowerCase();
  const rebuild = "kraken-atlas rebuild --workspace . --format agent";
  const doctor = "kraken-atlas doctor --workspace . --format agent";

  if (normalized.includes("enoent") || normalized.includes("dotnet") && normalized.includes("not recognized")) {
    return {
      category: "sdk-runtime",
      label: ".NET SDK/runtime unavailable",
      remediation: [doctor, "dotnet --info", rebuild]
    };
  }

  if (normalized.includes("you must install or update .net") || normalized.includes("no frameworks were found") || normalized.includes("netsdk1045")) {
    return {
      category: "sdk-runtime",
      label: ".NET SDK/runtime mismatch",
      remediation: [doctor, "dotnet --info", rebuild]
    };
  }

  if (/\bnu\d{4}\b/i.test(detail) || normalized.includes("project.assets.json") || normalized.includes("restore") || normalized.includes("unable to load the service index")) {
    return {
      category: "restore",
      label: "restore/package resolution failure",
      remediation: [doctor, "dotnet restore", rebuild]
    };
  }

  if (/\bmsb\d{4}\b/i.test(detail) || normalized.includes("project file could not be loaded") || normalized.includes("the project file is invalid")) {
    return {
      category: "input",
      label: "project/input parsing failure",
      remediation: [doctor, "dotnet build", rebuild]
    };
  }

  if (normalized.includes("unhandled exception") || normalized.includes("system.") || normalized.includes("fatal error")) {
    return {
      category: "analyzer-crash",
      label: "analyzer runtime crash",
      remediation: [doctor, rebuild]
    };
  }

  return {
    category: "unknown",
    label: "uncategorized analyzer failure",
    remediation: [doctor, "dotnet restore", rebuild]
  };
}

function sanitizeAnalyzerDetail(detail: string): string {
  return detail.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 12).join("\n");
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
