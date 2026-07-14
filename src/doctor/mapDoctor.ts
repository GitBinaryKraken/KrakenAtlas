import * as fs from "fs/promises";
import * as path from "path";
import { defaultMaxFileSizeBytes, defaultOutputFolder } from "../config/defaults";
import { FileRecord, ProjectAnalyzerRun, ProjectMetadata } from "../model/records";
import { ScanOptions, ScanSummary, scanWorkspace } from "../scanner/fileScanner";
import { readJsonl } from "../storage/jsonlReader";

export interface FileDiff {
  addedFiles: string[];
  changedFiles: string[];
  deletedFiles: string[];
}

export interface DoctorOptions {
  extensionPath: string;
  workspaceRoot: string;
  outputFolder?: string;
  maxFileSizeBytes?: number;
  scanOptions?: Omit<ScanOptions, "maxFileSizeBytes" | "outputFolder">;
}

export interface DoctorResult {
  status: "ready" | "stale" | "missing" | "degraded";
  outputFolder: string;
  missingOutputs: string[];
  addedFiles: string[];
  changedFiles: string[];
  deletedFiles: string[];
  hasCSharpFiles: boolean;
  roslynAnalyzerFound: boolean;
  failedAnalyzerRuns: ProjectAnalyzerRun[];
  scanSummary?: ScanSummary;
  corpusWarnings: string[];
  message: string;
  remediationCommands: string[];
}

const requiredOutputs = [
  "manifest.json",
  "project.json",
  "files.jsonl",
  "symbols.jsonl",
  "references.jsonl",
  "relationships.jsonl",
  "agent-readme.md",
  "index.sqlite"
];

export async function inspectMap(options: DoctorOptions): Promise<DoctorResult> {
  const outputFolderName = options.outputFolder ?? defaultOutputFolder;
  const outputFolder = path.join(options.workspaceRoot, outputFolderName);
  const missingOutputs = await findMissingOutputs(outputFolder);
  const scanResult = await scanWorkspace(options.workspaceRoot, {
    maxFileSizeBytes: options.maxFileSizeBytes ?? defaultMaxFileSizeBytes,
    outputFolder: outputFolderName,
    ...options.scanOptions
  });
  const currentFiles = scanResult.files;
  const previousFiles = await readJsonl<FileRecord>(path.join(outputFolder, "files.jsonl"));
  const diff = previousFiles.length ? diffFiles(previousFiles, currentFiles) : emptyDiff();
  const hasCSharpFiles = currentFiles.some((file) => file.extension === ".cs");
  const roslynAnalyzerFound = await pathExists(path.join(options.extensionPath, "analyzers", "dotnet", "KrakenAtlas.RoslynAnalyzer", "KrakenAtlas.RoslynAnalyzer.csproj"));
  const project = await readProjectMetadata(outputFolder);
  const failedAnalyzerRuns = project?.analyzerRuns?.filter((run) => run.status === "failed") ?? [];
  const corpusWarnings = buildCorpusWarnings(currentFiles, scanResult.summary);

  if (missingOutputs.length > 0 || previousFiles.length === 0) {
    return {
      status: "missing",
      outputFolder,
      missingOutputs,
      ...diff,
      hasCSharpFiles,
      roslynAnalyzerFound,
      failedAnalyzerRuns,
      scanSummary: scanResult.summary,
      corpusWarnings,
      message: "Kraken Atlas outputs are missing or incomplete.",
      remediationCommands: ["kraken-atlas rebuild --workspace ."]
    };
  }

  const stale = diff.addedFiles.length > 0 || diff.changedFiles.length > 0 || diff.deletedFiles.length > 0;
  const analyzerMissing = hasCSharpFiles && !roslynAnalyzerFound;
  const degraded = failedAnalyzerRuns.length > 0;

  return {
    status: degraded ? "degraded" : stale || analyzerMissing ? "stale" : "ready",
    outputFolder,
    missingOutputs,
    ...diff,
    hasCSharpFiles,
    roslynAnalyzerFound,
    failedAnalyzerRuns,
    scanSummary: scanResult.summary,
    corpusWarnings,
    message: degraded
      ? "One or more analyzers failed during the last rebuild. Query results are partial."
      : stale
        ? "Source files changed since the last map update."
        : analyzerMissing
          ? "C# files are present but the Roslyn analyzer project was not found."
          : "Kraken Atlas is ready.",
    remediationCommands: degraded || analyzerMissing
        ? ["kraken-atlas rebuild --workspace . --format agent"]
        : stale
          ? ["kraken-atlas update --workspace ."]
          : []
  };
}

export function diffFiles(previousFiles: FileRecord[], currentFiles: FileRecord[]): FileDiff {
  const previousByPath = new Map(previousFiles.map((file) => [file.path, file]));
  const currentByPath = new Map(currentFiles.map((file) => [file.path, file]));
  const addedFiles = currentFiles.filter((file) => !previousByPath.has(file.path)).map((file) => file.path);
  const changedFiles = currentFiles
    .filter((file) => previousByPath.has(file.path) && previousByPath.get(file.path)?.sha256 !== file.sha256)
    .map((file) => file.path);
  const deletedFiles = previousFiles.filter((file) => !currentByPath.has(file.path)).map((file) => file.path);

  return { addedFiles, changedFiles, deletedFiles };
}

function buildCorpusWarnings(files: FileRecord[], scanSummary: ScanSummary): string[] {
  const warnings: string[] = [];
  const total = files.length;
  if (total === 0) {
    return warnings;
  }

  const topLevelCounts = new Map<string, number>();
  for (const file of files) {
    const topLevel = file.path.split("/")[0] || file.path;
    topLevelCounts.set(topLevel, (topLevelCounts.get(topLevel) ?? 0) + 1);
  }

  const noisyFolderPattern = /^(sandbox|sandbox_old|artifacts|graphify-out|coverage|dist|build)$/i;
  for (const [folder, count] of [...topLevelCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5)) {
    const share = count / total;
    if (share >= 0.35) {
      warnings.push(`Folder "${folder}" accounts for ${count}/${total} indexed files (${Math.round(share * 100)}%). Consider adding an ignore rule if it is not source.`);
    } else if (noisyFolderPattern.test(folder) && count > 0) {
      warnings.push(`Likely noisy folder "${folder}" is indexed with ${count} file(s). Consider excluding it.`);
    }
  }

  if (scanSummary.excludedFiles > 0) {
    warnings.push(`${scanSummary.excludedFiles} file(s) or folder entries were excluded by scan policy.`);
  }

  return warnings.slice(0, 6);
}

function emptyDiff(): FileDiff {
  return {
    addedFiles: [],
    changedFiles: [],
    deletedFiles: []
  };
}

async function findMissingOutputs(outputFolder: string): Promise<string[]> {
  const missing: string[] = [];
  for (const output of requiredOutputs) {
    if (!(await pathExists(path.join(outputFolder, output)))) {
      missing.push(output);
    }
  }
  return missing;
}

async function readProjectMetadata(outputFolder: string): Promise<ProjectMetadata | undefined> {
  try {
    return JSON.parse(await fs.readFile(path.join(outputFolder, "project.json"), "utf8")) as ProjectMetadata;
  } catch {
    return undefined;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
