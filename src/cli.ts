#!/usr/bin/env node
import * as fs from "fs/promises";
import * as path from "path";
import * as process from "process";
import { installAgentInstructions, installAgentSkill } from "./agent/terminalInstructions";
import { renderContextPack } from "./context/agentContext";
import { inspectMap } from "./doctor/mapDoctor";
import { renderAgentBuildResult, renderAgentDoctor, renderAgentResponse } from "./format/agentFormatter";
import { applyCliNextCommandOptions } from "./format/cliNextCommands";
import { QueryService, withQueryService } from "./query/queryService";
import { rebuildProject } from "./rebuild/rebuildProject";
import { updateProject } from "./rebuild/updateProject";
import type { DoctorResult } from "./doctor/mapDoctor";
import type { UpdateProjectResult } from "./rebuild/updateProject";

interface CliOptions {
  workspaceRoot: string;
  workspaceArg: string;
  format: "json" | "md" | "info" | "agent";
  quiet: boolean;
  projectContext?: string;
  edgeTypes: string[];
  limit?: number;
}

type QueryCommandType = "project" | "symbol" | "references" | "relationships" | "flow" | "search";

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const options = parseOptions(args);
  const positional = args.filter((arg, index) => !isOptionArg(args, index));

  if (args.includes("--version") || positional[0] === "version") {
    console.log("kraken-atlas 0.2.3");
    return 0;
  }

  if (args.includes("--help") || positional[0] === "help" || positional.length === 0) {
    printUsage(false);
    return 0;
  }

  if (positional[0] === "rebuild") {
    return rebuild(options);
  }

  if (positional[0] === "update") {
    return update(options);
  }

  if (positional[0] === "context") {
    return writeContextPack(options, positional.slice(1).join(" "));
  }

  if (positional[0] === "install-agent") {
    return installAgent(options);
  }

  if (positional[0] === "doctor") {
    return doctor(options);
  }

  if (positional[0] !== "query") {
    printUsage(true);
    return 2;
  }

  const queryType = positional[1] ?? "project";
  const query = positional.slice(2).join(" ");
  const doctorResult = await inspectForCli(options);

  const response = await withQueryService(options.workspaceRoot, (service) => runQuery(service, queryType, query, options), { projectContext: options.projectContext });
  const cliResponse = applyCliNextCommandOptions(response, options);

  printStaleWarning(doctorResult, options);

  if (options.format === "agent") {
    console.log(renderAgentResponse(cliResponse).trimEnd());
  } else if (options.format === "md" || options.format === "info") {
    console.log(toMarkdown(cliResponse));
  } else {
    console.log(JSON.stringify(cliResponse, null, 2));
  }

  return 0;
}

async function doctor(options: CliOptions): Promise<number> {
  const result = await inspectForCli(options);

  if (options.format === "agent") {
    console.log(renderAgentDoctor(result).trimEnd());
  } else if (options.format === "md" || options.format === "info") {
    console.log(renderDoctorMarkdown(result));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  return result.status === "ready" ? 0 : 1;
}

async function installAgent(options: CliOptions): Promise<number> {
  const result = await installAgentInstructions(options.workspaceRoot);
  const skill = await installAgentSkill(options.workspaceRoot);

  if (options.format === "agent") {
    console.log(`Answer
Kraken Atlas agent instructions ${result.action}; project skill ${skill.action}.

Open These Files
- ${result.filePath}
- ${skill.skillPath}
- ${path.join(skill.referencesFolder, "query-playbooks.md")}

Evidence
- AGENTS.md now contains terminal-first Kraken Atlas query guidance.
- .agents/skills/kraken-atlas now contains a project-local agent skill.

Next Commands
- kraken-atlas update --workspace .
- kraken-atlas query project --workspace .

Stop Condition
- Stop here once the agent instructions are installed.`);
  } else if (options.format === "md" || options.format === "info") {
    console.log(`# Kraken Atlas agent setup ${result.action}

- File: ${result.filePath}
- Skill: ${skill.skillPath}
- Use: terminal-first code-map queries from VS Code agents`);
  } else {
    console.log(JSON.stringify({
      status: "completed",
      action: result.action,
      file: result.filePath,
      skill: skill.skillPath
    }, null, 2));
  }

  return 0;
}

async function update(options: CliOptions): Promise<number> {
  const result = await updateProject({
    extensionPath: resolveExtensionPath(),
    workspaceRoot: options.workspaceRoot,
    onProgress: (message) => {
      if (!options.quiet) {
        console.error(message);
      }
    }
  });

  printBuildResult(result, options);
  return 0;
}

async function writeContextPack(options: CliOptions, query: string): Promise<number> {
  const contextQuery = parseContextQuery(query);
  const response = await withQueryService(
    options.workspaceRoot,
    (service) => runQuery(service, contextQuery.type, contextQuery.query || "project", options),
    { projectContext: options.projectContext }
  );
  const cliResponse = applyCliNextCommandOptions(response, { ...options, format: "agent" });
  const markdown = renderContextPack(cliResponse, { workspaceRoot: options.workspaceRoot });
  const outputPath = path.join(options.workspaceRoot, ".kraken-atlas", "context-pack.md");

  await fs.writeFile(outputPath, markdown, "utf8");

  if (options.format === "agent") {
    console.log(`${renderAgentResponse(cliResponse).trimEnd()}

Context Pack
- Output: ${outputPath}
- Source query: ${contextQuery.type}`);
  } else if (options.format === "md" || options.format === "info") {
    console.log(markdown.trimEnd());
  } else {
    console.log(JSON.stringify({
      status: "completed",
      output: outputPath,
      sourceQueryType: contextQuery.type,
      query: response.query,
      files: response.files,
      relationships: response.relationships.length,
      nextQueries: cliResponse.nextQueries
    }, null, 2));
  }

  return 0;
}

function runQuery(service: QueryService, queryType: string, query: string, options: CliOptions) {
  switch (queryType) {
    case "project":
      return service.getProject(query || "project");
    case "symbol":
    case "symbols":
      return service.findSymbols(query);
    case "references":
      return service.findReferences(query);
    case "relationships":
    case "relationship":
      return service.findRelationships(query, { edgeTypes: options.edgeTypes, limit: options.limit });
    case "flow":
      return service.findFlow(query);
    case "search":
    case "examples":
      return service.search(query);
    default:
      throw new Error(`Unknown query type: ${queryType}`);
  }
}

function parseContextQuery(query: string): { type: QueryCommandType; query: string } {
  const trimmed = query.trim();
  const firstSpace = trimmed.search(/\s/u);
  const first = firstSpace >= 0 ? trimmed.slice(0, firstSpace) : trimmed;
  const rest = firstSpace >= 0 ? trimmed.slice(firstSpace + 1).trim() : "";
  const type = normalizeQueryType(first);

  if (type) {
    return { type, query: rest };
  }

  return { type: "flow", query: trimmed };
}

function normalizeQueryType(value: string): QueryCommandType | undefined {
  switch (value) {
    case "project":
      return "project";
    case "symbol":
    case "symbols":
      return "symbol";
    case "references":
      return "references";
    case "relationship":
    case "relationships":
      return "relationships";
    case "flow":
      return "flow";
    case "search":
    case "examples":
      return "search";
    default:
      return undefined;
  }
}

async function rebuild(options: CliOptions): Promise<number> {
  const result = await rebuildProject({
    extensionPath: resolveExtensionPath(),
    workspaceRoot: options.workspaceRoot,
    onProgress: (message) => {
      if (!options.quiet) {
        console.error(message);
      }
    }
  });

  printBuildResult({ ...result, mode: "full", reason: "Rebuild command requested.", addedFiles: [], changedFiles: [], deletedFiles: [] }, options);
  return 0;
}

function printBuildResult(result: UpdateProjectResult, options: CliOptions): void {
  if (options.format === "agent") {
    console.log(renderAgentBuildResult(result).trimEnd());
  } else if (options.format === "md" || options.format === "info") {
    console.log(`# Kraken Atlas ${result.mode === "skipped" ? "update skipped" : `${result.mode} update complete`}

- Files: ${result.fileCount}
- Symbols: ${result.symbolCount}
- References: ${result.referenceCount}
- Relationships: ${result.relationshipCount}
- Output: ${result.outputFolder}
- Reason: ${result.reason}
- Excluded files/folders: ${result.scanSummary?.excludedFiles ?? 0}
- Added files: ${result.addedFiles.length}
- Changed files: ${result.changedFiles.length}
- Deleted files: ${result.deletedFiles.length}`);
  } else {
    console.log(JSON.stringify({
      status: "completed",
      mode: result.mode,
      reason: result.reason,
      outputFolder: result.outputFolder,
      changes: {
        addedFiles: result.addedFiles,
        changedFiles: result.changedFiles,
        deletedFiles: result.deletedFiles
      },
      counts: {
        files: result.fileCount,
        symbols: result.symbolCount,
        references: result.referenceCount,
        relationships: result.relationshipCount
      },
      scan: result.scanSummary
    }, null, 2));
  }
}

async function inspectForCli(options: CliOptions): Promise<DoctorResult> {
  return inspectMap({
    extensionPath: resolveExtensionPath(),
    workspaceRoot: options.workspaceRoot
  });
}

function printStaleWarning(result: DoctorResult, options: CliOptions): void {
  if (result.status === "ready") {
    return;
  }

  const changeCount = result.addedFiles.length + result.changedFiles.length + result.deletedFiles.length;
  const command = result.remediationCommands[0] ?? "kraken-atlas rebuild --workspace .";
  const message = `Kraken Atlas warning: ${result.status}. ${result.message} Changed files: ${changeCount}. Run: ${command}`;

  if (options.format === "json") {
    console.error(message);
  } else {
    console.log(`Warning\n${message}\n`);
  }
}

function renderDoctorMarkdown(result: DoctorResult): string {
  return `# Kraken Atlas doctor

- Status: ${result.status}
- Message: ${result.message}
- Output: ${result.outputFolder}
- Missing outputs: ${result.missingOutputs.length ? result.missingOutputs.join(", ") : "none"}
- Added files: ${result.addedFiles.length}
- Changed files: ${result.changedFiles.length}
- Deleted files: ${result.deletedFiles.length}
- Roslyn analyzer found: ${result.roslynAnalyzerFound}
- Failed analyzers: ${result.failedAnalyzerRuns.length ? result.failedAnalyzerRuns.map((run) => run.id).join(", ") : "none"}
- Excluded files/folders: ${result.scanSummary?.excludedFiles ?? 0}
- Corpus warnings: ${result.corpusWarnings.length ? result.corpusWarnings.join("; ") : "none"}

## Analyzer Diagnostics

${result.failedAnalyzerRuns.length ? result.failedAnalyzerRuns.map((run) => `- ${run.id}${run.diagnosticCategory ? ` [${run.diagnosticCategory}]` : ""}: ${run.message ?? "Analyzer failed."}${run.diagnosticLabel ? `\n  Category: ${run.diagnosticLabel}` : ""}${run.detail ? `\n  Detail: ${run.detail.split("\n")[0]}` : ""}`).join("\n") : "- None"}

## Remediation

${doctorRemediationCommandsForMarkdown(result).length ? doctorRemediationCommandsForMarkdown(result).map((command) => `- \`${command}\``).join("\n") : "- None"}
`;
}

function doctorRemediationCommandsForMarkdown(result: DoctorResult): string[] {
  return [
    ...result.failedAnalyzerRuns.flatMap((run) => run.remediation ?? []),
    ...result.remediationCommands
  ].filter((command, index, commands) => commands.indexOf(command) === index);
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function parseOptions(args: string[]): CliOptions {
  const workspaceIndex = args.indexOf("--workspace");
  const formatIndex = args.indexOf("--format");
  const contextIndex = args.indexOf("--context");
  const edgeTypes = optionValues(args, "--edge")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  const limitIndex = args.indexOf("--limit");
  const parsedLimit = limitIndex >= 0 ? Number.parseInt(args[limitIndex + 1] ?? "", 10) : undefined;

  return {
    workspaceRoot: workspaceIndex >= 0 && args[workspaceIndex + 1] ? path.resolve(args[workspaceIndex + 1]) : process.cwd(),
    workspaceArg: workspaceIndex >= 0 && args[workspaceIndex + 1] ? args[workspaceIndex + 1] : ".",
    format: parseFormat(formatIndex >= 0 ? args[formatIndex + 1] : undefined),
    quiet: args.includes("--quiet"),
    projectContext: contextIndex >= 0 ? args[contextIndex + 1] : undefined,
    edgeTypes,
    limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined
  };
}

function optionValues(args: string[], optionName: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === optionName && args[index + 1]) {
      values.push(args[index + 1]);
    }
  }
  return values;
}

function parseFormat(value: string | undefined): CliOptions["format"] {
  if (value === "md" || value === "info" || value === "agent") {
    return value;
  }
  return "json";
}

function isOptionArg(args: string[], index: number): boolean {
  const arg = args[index];
  const previous = args[index - 1];
  return arg.startsWith("--") || previous === "--workspace" || previous === "--format" || previous === "--context" || previous === "--edge" || previous === "--limit";
}

function toMarkdown(response: any): string {
  const lines = [`# ${response.answer}`, "", `Confidence: ${response.confidence}`, ""];
  if (response.files?.length) {
    lines.push("## Files", ...response.files.map((file: string) => `- ${file}`), "");
  }
  if (response.evidence?.length) {
    lines.push("## Evidence");
    for (const item of response.evidence.slice(0, 12)) {
      lines.push(`- ${JSON.stringify(item)}`);
    }
    lines.push("");
  }
  if (response.nextQueries?.length) {
    lines.push("## Next Queries", ...response.nextQueries.map((query: string) => `- \`${query}\``), "");
  }
  return lines.join("\n").trimEnd();
}

function printUsage(error: boolean): void {
  const output = `Kraken Atlas 0.2.3

Usage:
  kraken-atlas rebuild [--workspace <path>] [--format json|info|md|agent] [--quiet]
  kraken-atlas update [--workspace <path>] [--format json|info|md|agent] [--quiet]
  kraken-atlas doctor [--workspace <path>] [--format json|info|md|agent]
  kraken-atlas install-agent [--workspace <path>] [--format json|info|md|agent]
  kraken-atlas context [flow|search|relationships|symbol|references|project] <text> [--workspace <path>] [--context <project-or-folder>] [--format json|info|md|agent]
  kraken-atlas query <project|symbol|references|relationships|flow|search> <text> [--workspace <path>] [--context <project-or-folder>] [--format json|info|md|agent] [--edge <type>] [--limit <n>]

Agent loop:
  kraken-atlas doctor --workspace . --format agent
  kraken-atlas update --workspace . --format agent
  kraken-atlas query flow "feature or behavior" --workspace . --format agent
  kraken-atlas query flow "feature or behavior" --workspace . --context WebApp --format agent
  kraken-atlas query relationships "Namespace.Type.Method" --workspace . --edge CALLS --format agent
  kraken-atlas context relationships "Namespace.Type" --workspace . --format md

Options:
  --workspace <path>  Workspace root. Defaults to current directory.
  --context <name>    Scope query seeds to a project/folder in a parent workspace.
  --format <format>   json, info, md, or agent. Defaults to json. Use agent for compact token-saving output; info/md for richer human-readable output.
  --edge <type>        Filter relationship query output by edge type. Repeat or comma-separate values, e.g. --edge WRITES_FIELD,MAPS_PROPERTY.
  --limit <n>          Limit relationship query output. Defaults to 30, max 100.
  --quiet             Suppress rebuild/update progress logs.
  --help              Show this help.
  --version           Show CLI version.`;

  if (error) {
    console.error(output);
  } else {
    console.log(output);
  }
}

function resolveExtensionPath(): string {
  return __dirname.endsWith("dist") ? __dirname.replace(/[\\/]dist$/, "") : process.cwd();
}

main()
  .then((code) => {
    (globalThis as any).process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    (globalThis as any).process.exitCode = 1;
  });
