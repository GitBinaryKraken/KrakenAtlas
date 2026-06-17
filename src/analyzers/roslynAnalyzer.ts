import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { promisify } from "util";
import { ReferenceRecord, RelationshipRecord, SymbolRecord } from "../model/records";
import { readJsonl } from "../storage/jsonlReader";

const execFileAsync = promisify(execFile);

export interface RoslynAnalyzerResult {
  symbols: SymbolRecord[];
  references: ReferenceRecord[];
  relationships: RelationshipRecord[];
}

export async function runRoslynAnalyzer(
  extensionPath: string,
  workspaceRoot: string,
  outputFolder: string,
  hasCSharpFiles: boolean
): Promise<RoslynAnalyzerResult> {
  if (!hasCSharpFiles) {
    return emptyResult();
  }

  const analyzerProject = path.join(
    extensionPath,
    "analyzers",
    "dotnet",
    "KrakenAtlas.RoslynAnalyzer",
    "KrakenAtlas.RoslynAnalyzer.csproj"
  );

  if (!(await pathExists(analyzerProject))) {
    return emptyResult();
  }

  const analyzerDirectory = path.dirname(analyzerProject);
  const publishedAnalyzer = path.join(analyzerDirectory, "publish", "KrakenAtlas.RoslynAnalyzer.dll");
  const isSourceCheckout = await pathExists(path.join(extensionPath, "src", "analyzers", "roslynAnalyzer.ts"));

  if (!isSourceCheckout && await pathExists(publishedAnalyzer)) {
    await runDotnet(["exec", publishedAnalyzer, workspaceRoot, "--output", outputFolder], extensionPath);
  } else {
    const runArgs = ["run", "--project", analyzerProject];
    if (await pathExists(path.join(analyzerDirectory, "obj", "project.assets.json"))) {
      runArgs.push("--no-restore");
    }
    runArgs.push("--", workspaceRoot, "--output", outputFolder);
    await runDotnet(runArgs, extensionPath);
  }

  return {
    symbols: await readJsonl<SymbolRecord>(path.join(outputFolder, "symbols.jsonl")),
    references: await readJsonl<ReferenceRecord>(path.join(outputFolder, "references.jsonl")),
    relationships: await readJsonl<RelationshipRecord>(path.join(outputFolder, "relationships.jsonl"))
  };
}

async function runDotnet(args: string[], cwd: string): Promise<void> {
  try {
    await execFileAsync("dotnet", args, {
      cwd,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8
    });
  } catch (error) {
    if (error && typeof error === "object") {
      const details = [
        error instanceof Error ? error.message : String(error),
        "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "",
        "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : ""
      ].filter(Boolean).join("\n");
      throw new Error(details);
    }
    throw error;
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

function emptyResult(): RoslynAnalyzerResult {
  return {
    symbols: [],
    references: [],
    relationships: []
  };
}
