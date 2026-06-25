import * as vscode from "vscode";
import * as path from "path";
import { readConfiguration, scanOptionsFromConfiguration } from "./config/configuration";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Kraken Atlas");
  void refreshInstalledWorkspaceCli(context.extensionPath);

  context.subscriptions.push(
    vscode.commands.registerCommand("krakenAtlas.rebuildIndex", async () => {
      const { rebuildIndex } = await import("./commands/rebuildIndex");
      await rebuildIndex(context.extensionPath);
    }),
    vscode.commands.registerCommand("krakenAtlas.updateIndex", async () => {
      const { updateIndex } = await import("./commands/updateIndex");
      await updateIndex(context.extensionPath);
    }),
    vscode.commands.registerCommand("krakenAtlas.doctor", async () => {
      await runDoctorCommand(context.extensionPath, output);
    }),
    vscode.commands.registerCommand("krakenAtlas.showProject", async () => {
      await runQueryCommand(output, "project", "project");
    }),
    vscode.commands.registerCommand("krakenAtlas.queryFlow", async () => {
      const query = await vscode.window.showInputBox({
        title: "Kraken Atlas: Trace Feature Flow",
        prompt: "Feature, behavior, or flow to inspect",
        placeHolder: "login"
      });
      if (!query) {
        return;
      }
      const contextName = await promptForContext();
      await runQueryCommand(output, "flow", query, contextName);
    }),
    vscode.commands.registerCommand("krakenAtlas.querySymbol", async () => {
      const query = await vscode.window.showInputBox({
        title: "Kraken Atlas: Find Symbol",
        prompt: "Symbol, class, method, or file name to inspect",
        placeHolder: "UserService"
      });
      if (!query) {
        return;
      }
      const contextName = await promptForContext();
      await runQueryCommand(output, "symbol", query, contextName);
    }),
    vscode.commands.registerCommand("krakenAtlas.queryRelationships", async () => {
      const query = await vscode.window.showInputBox({
        title: "Kraken Atlas: Show Relationships",
        prompt: "Symbol, relationship type, file, or graph id to inspect",
        placeHolder: "UserService"
      });
      if (!query) {
        return;
      }
      const contextName = await promptForContext();
      await runQueryCommand(output, "relationships", query, contextName);
    }),
    vscode.commands.registerCommand("krakenAtlas.queryReferences", async () => {
      const query = await vscode.window.showInputBox({
        title: "Kraken Atlas: Find References",
        prompt: "Symbol, method, type, or graph id to find references for",
        placeHolder: "UserService"
      });
      if (!query) {
        return;
      }
      const contextName = await promptForContext();
      await runQueryCommand(output, "references", query, contextName);
    }),
    vscode.commands.registerCommand("krakenAtlas.queryPattern", async () => {
      const query = await vscode.window.showInputBox({
        title: "Kraken Atlas: Show Detected Pattern",
        prompt: "Pattern or convention to inspect",
        placeHolder: "controller-service-flow"
      });
      if (!query) {
        return;
      }
      const contextName = await promptForContext();
      await runQueryCommand(output, "pattern", query, contextName);
    }),
    vscode.commands.registerCommand("krakenAtlas.queryPatternMap", async () => {
      const contextName = await promptForContext();
      await runQueryCommand(output, "pattern-map", "pattern-map", contextName);
    }),
    vscode.commands.registerCommand("krakenAtlas.queryHotspots", async () => {
      const query = await vscode.window.showInputBox({
        title: "Kraken Atlas: Show Architecture Hotspots",
        prompt: "Optional hotspot filter such as config, routing, service, or UI",
        placeHolder: "Leave blank to inspect central shared files"
      });
      if (query === undefined) {
        return;
      }
      const contextName = await promptForContext();
      await runQueryCommand(output, "hotspots", query || "hotspots", contextName);
    }),
    vscode.commands.registerCommand("krakenAtlas.findOrphans", async () => {
      const query = await vscode.window.showInputBox({
        title: "Kraken Atlas: Find Orphaned Code Candidates",
        prompt: "Optional method, file, or feature filter",
        placeHolder: "Leave blank to inspect all candidates"
      });
      if (query === undefined) {
        return;
      }
      const contextName = await promptForContext();
      await runQueryCommand(output, "orphans", query, contextName);
    }),
    vscode.commands.registerCommand("krakenAtlas.findDuplicates", async () => {
      const query = await vscode.window.showInputBox({
        title: "Kraken Atlas: Find Duplicate Code Blocks",
        prompt: "Optional method, file, or feature filter",
        placeHolder: "Leave blank to inspect all exact duplicate groups"
      });
      if (query === undefined) {
        return;
      }
      const contextName = await promptForContext();
      await runQueryCommand(output, "duplicates", query, contextName);
    }),
    vscode.commands.registerCommand("krakenAtlas.findDrift", async () => {
      const query = await vscode.window.showInputBox({
        title: "Kraken Atlas: Find Pattern Drift Candidates",
        prompt: "Optional feature, file, or drift filter",
        placeHolder: "Leave blank to inspect all drift candidates"
      });
      if (query === undefined) {
        return;
      }
      const contextName = await promptForContext();
      await runQueryCommand(output, "drift", query, contextName);
    }),
    vscode.commands.registerCommand("krakenAtlas.whereToAdd", async () => {
      const query = await vscode.window.showInputBox({
        title: "Kraken Atlas: Suggest Where To Add Code",
        prompt: "Describe the change you want to make",
        placeHolder: "add validation for a request"
      });
      if (!query) {
        return;
      }
      const contextName = await promptForContext();
      await runQueryCommand(output, "where-to-add", query, contextName);
    }),
    vscode.commands.registerCommand("krakenAtlas.planChange", async () => {
      const query = await vscode.window.showInputBox({
        title: "Kraken Atlas: Plan Code Change",
        prompt: "Describe the feature or change to plan",
        placeHolder: "add notification preferences"
      });
      if (!query) {
        return;
      }
      const contextName = await promptForContext();
      await runQueryCommand(output, "plan-change", query, contextName);
    }),
    vscode.commands.registerCommand("krakenAtlas.searchMap", async () => {
      const query = await vscode.window.showInputBox({
        title: "Kraken Atlas: Search Map",
        prompt: "Text to search across indexed files, symbols, relationships, and patterns",
        placeHolder: "save button"
      });
      if (!query) {
        return;
      }
      const contextName = await promptForContext();
      await runQueryCommand(output, "search", query, contextName);
    }),
    vscode.commands.registerCommand("krakenAtlas.exportContextPack", async () => {
      const query = await vscode.window.showInputBox({
        title: "Kraken Atlas: Export Context Pack",
        prompt: "Feature, behavior, or symbol to write into .kraken-atlas/context-pack.md",
        placeHolder: "login"
      });
      if (!query) {
        return;
      }
      const contextName = await promptForContext();
      await exportContextPack(output, query, contextName);
    }),
    vscode.commands.registerCommand("krakenAtlas.installAgentInstructions", async () => {
      await installAgentInstructionsCommand(output);
    }),
    vscode.commands.registerCommand("krakenAtlas.installWorkspaceCli", async () => {
      await installWorkspaceCliCommand(context.extensionPath, output);
    }),
    vscode.commands.registerCommand("krakenAtlas.installAiAgentSetup", async () => {
      await installAiAgentSetupCommand(context.extensionPath, output);
    }),
    vscode.commands.registerCommand("krakenAtlas.openMapFolder", async () => {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) {
        return;
      }
      const mapFolder = vscode.Uri.file(path.join(workspaceRoot, readConfiguration().outputFolder));
      await vscode.commands.executeCommand("revealFileInOS", mapFolder);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (readConfiguration().updateOnSave && shouldUpdateOnSave(document)) {
        void import("./commands/updateIndex").then(({ updateIndex }) => updateIndex(context.extensionPath, { silent: true }));
      }
    }),
    output
  );

  registerLanguageModelTools(context, output);
}

export function deactivate(): void {
  // Nothing to clean up yet.
}

function shouldUpdateOnSave(document: vscode.TextDocument): boolean {
  if (document.uri.scheme !== "file") {
    return false;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    return false;
  }

  const configuration = readConfiguration();
  const relativePath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return false;
  }

  if (relativePath.split(/[\\/]/).includes(configuration.outputFolder)) {
    return false;
  }

  return new Set([".cs", ".csproj", ".sln", ".props", ".targets", ".js", ".mjs", ".cjs", ".html", ".htm", ".cshtml", ".razor"]).has(
    path.extname(document.uri.fsPath).toLowerCase()
  );
}

async function runDoctorCommand(extensionPath: string, output: vscode.OutputChannel): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Kraken Atlas: running doctor",
      cancellable: false
    },
    async () => {
      const { inspectMap } = await import("./doctor/mapDoctor");
      const { renderAgentDoctor } = await import("./format/agentFormatter");
      const configuration = readConfiguration();
      const result = await inspectMap({
        extensionPath,
        workspaceRoot,
        outputFolder: configuration.outputFolder,
        maxFileSizeBytes: configuration.maxFileSizeBytes,
        scanOptions: scanOptionsFromConfiguration(configuration)
      });

      writeOutput(output, "Doctor", renderAgentDoctor(result));
      vscode.window.showInformationMessage(`Kraken Atlas doctor: ${result.status}.`);
    }
  );
}

type ExtensionQueryType = "project" | "symbol" | "references" | "relationships" | "pattern" | "pattern-map" | "hotspots" | "flow" | "search" | "where-to-add" | "plan-change" | "orphans" | "duplicates" | "drift";

async function runQueryCommand(output: vscode.OutputChannel, queryType: ExtensionQueryType, query: string, contextName?: string): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Kraken Atlas: ${queryType}`,
      cancellable: false
    },
    async () => {
      const { renderAgentResponse } = await import("./format/agentFormatter");
      const { withQueryService } = await import("./query/queryService");
      const response = await withQueryService(workspaceRoot, (service) => {
        if (queryType === "project") {
          return service.getProject(query);
        }
        if (queryType === "symbol") {
          return service.findSymbols(query);
        }
        if (queryType === "references") {
          return service.findReferences(query);
        }
        if (queryType === "relationships") {
          return service.findRelationships(query);
        }
        if (queryType === "pattern") {
          return service.findPatterns(query);
        }
        if (queryType === "pattern-map") {
          return service.findPatternMap(query);
        }
        if (queryType === "hotspots") {
          return service.findArchitectureHotspots(query);
        }
        if (queryType === "flow") {
          return service.findFlow(query);
        }
        if (queryType === "search") {
          return service.search(query);
        }
        if (queryType === "orphans") {
          return service.findOrphans(query);
        }
        if (queryType === "duplicates") {
          return service.findDuplicates(query);
        }
        if (queryType === "drift") {
          return service.findDrift(query);
        }
        if (queryType === "plan-change") {
          return service.planChange(query);
        }
        return service.whereToAdd(query);
      }, { projectContext: contextName });

      writeOutput(output, `${queryType}: ${query}${contextName ? ` [${contextName}]` : ""}`, renderForCommandPalette(renderAgentResponse(response)));
      vscode.window.showInformationMessage(`Kraken Atlas ${queryType} query returned ${response.files.length} file(s).`);
    }
  );
}

async function runQuery(workspaceRoot: string, queryType: ExtensionQueryType, query: string, contextName?: string): Promise<string> {
  const { renderAgentResponse } = await import("./format/agentFormatter");
  const { withQueryService } = await import("./query/queryService");
  const response = await withQueryService(workspaceRoot, (service) => {
    if (queryType === "project") {
      return service.getProject(query);
    }
    if (queryType === "symbol") {
      return service.findSymbols(query);
    }
    if (queryType === "references") {
      return service.findReferences(query);
    }
    if (queryType === "relationships") {
      return service.findRelationships(query);
    }
    if (queryType === "pattern") {
      return service.findPatterns(query);
    }
    if (queryType === "pattern-map") {
      return service.findPatternMap(query);
    }
    if (queryType === "hotspots") {
      return service.findArchitectureHotspots(query);
    }
    if (queryType === "flow") {
      return service.findFlow(query);
    }
    if (queryType === "search") {
      return service.search(query);
    }
    if (queryType === "orphans") {
      return service.findOrphans(query);
    }
    if (queryType === "duplicates") {
      return service.findDuplicates(query);
    }
    if (queryType === "drift") {
      return service.findDrift(query);
    }
    if (queryType === "plan-change") {
      return service.planChange(query);
    }
    return service.whereToAdd(query);
  }, { projectContext: contextName });

  return renderAgentResponse(response);
}

async function exportContextPack(output: vscode.OutputChannel, query: string, contextName?: string): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Kraken Atlas: exporting context pack",
      cancellable: false
    },
    async () => {
      const fs = await import("fs/promises");
      const { renderContextPack } = await import("./context/agentContext");
      const { renderAgentResponse } = await import("./format/agentFormatter");
      const { withQueryService } = await import("./query/queryService");
      const response = await withQueryService(workspaceRoot, (service) => service.findFlow(query), { projectContext: contextName });
      const outputPath = path.join(workspaceRoot, readConfiguration().outputFolder, "context-pack.md");
      await fs.writeFile(outputPath, renderContextPack(response, { workspaceRoot }), "utf8");

      writeOutput(output, `context pack: ${query}${contextName ? ` [${contextName}]` : ""}`, renderForCommandPalette(renderAgentResponse(response)));
      vscode.window.showInformationMessage(`Kraken Atlas wrote context pack: ${outputPath}`);
    }
  );
}

async function installAgentInstructionsCommand(output: vscode.OutputChannel): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  const { installAgentInstructions, installAgentSkill } = await import("./agent/terminalInstructions");
  const result = await installAgentInstructions(workspaceRoot);
  const skill = await installAgentSkill(workspaceRoot, extensionVersion());
  writeOutput(output, "Install Agent Instructions", [
    "Answer",
    `Kraken Atlas agent instructions ${result.action}; project skill ${skill.action}.`,
    "",
    "Open These Files",
    `- ${result.filePath}`,
    `- ${skill.skillPath}`,
    `- ${path.join(skill.referencesFolder, "query-playbooks.md")}`,
    "",
    "Evidence",
    "- AGENTS.md now contains query-first Kraken Atlas guidance.",
    "- .agents/skills/kraken-atlas now contains a project-local agent skill.",
    "",
    "Next Commands",
    "- Run Command Palette: Kraken Atlas: Check Map Health",
    "- Run Command Palette: Kraken Atlas: Show Project Summary",
    "",
    "Stop Condition",
    "- Stop here once the agent instructions are installed."
  ].join("\n"));
  vscode.window.showInformationMessage(`Kraken Atlas agent instructions ${result.action}; project skill ${skill.action}.`);
}

async function installAiAgentSetupCommand(extensionPath: string, output: vscode.OutputChannel): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  const { installAgentInstructions, installAgentSkill } = await import("./agent/terminalInstructions");
  const instructions = await installAgentInstructions(workspaceRoot);
  const skill = await installAgentSkill(workspaceRoot, extensionVersion());
  await installWorkspaceCli(extensionPath);

  writeOutput(output, "Install AI Agent Setup", [
    "Answer",
    "Kraken Atlas AI agent setup installed.",
    "",
    "Open These Files",
    `- ${instructions.filePath}`,
    `- ${skill.skillPath}`,
    `- ${path.join(skill.referencesFolder, "query-playbooks.md")}`,
    `- ${path.join(workspaceRoot, readConfiguration().outputFolder, "bin")}`,
    "- .vscode/settings.json",
    "",
    "Evidence",
    "- AGENTS.md contains Kraken Atlas query-first instructions and playbooks.",
    "- .agents/skills/kraken-atlas contains a project-local skill for agent surfaces that scan .agents/skills.",
    "- New VS Code integrated terminals will include the workspace CLI shim on PATH.",
    "- External agent terminals can call the shim directly when they do not inherit VS Code PATH settings.",
    "- Native VS Code language-model tools are registered when the editor supports them.",
    "",
    "Next Commands",
    "- Close existing VS Code terminals.",
    "- Open a new VS Code terminal.",
    "- Run: kraken-atlas --help",
    "- If an agent still cannot find PATH, run: .\\.kraken-atlas\\bin\\kraken-atlas.cmd --help",
    "- Run: kraken-atlas doctor --workspace . --format agent",
    "",
    "Stop Condition",
    "- Stop here once AGENTS.md exists and a new integrated terminal can run kraken-atlas."
  ].join("\n"));
  vscode.window.showInformationMessage("Kraken Atlas AI agent setup installed. Open a new terminal before testing kraken-atlas.");
}

async function installWorkspaceCliCommand(extensionPath: string, output: vscode.OutputChannel): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  const installed = await installWorkspaceCli(extensionPath);

  writeOutput(output, "Install Workspace CLI", [
    "Answer",
    "Kraken Atlas workspace CLI shims installed.",
    "",
    "Open These Files",
    `- ${installed.binFolder}`,
    "- .vscode/settings.json",
    "",
    "Evidence",
    `- Windows cmd shim: ${installed.cmdPath}`,
    `- PowerShell shim: ${installed.ps1Path}`,
    `- POSIX shell shim: ${installed.shPath}`,
    "- New VS Code integrated terminals will include the shim folder on PATH.",
    "- External agent terminals can call the shim directly when they do not inherit VS Code PATH settings.",
    "",
    "Next Commands",
    "- Close existing VS Code terminals.",
    "- Open a new VS Code terminal.",
    "- Run: kraken-atlas --help",
    "- If an agent still cannot find PATH, run: .\\.kraken-atlas\\bin\\kraken-atlas.cmd --help",
    "- Run: kraken-atlas doctor --workspace . --format agent",
    "",
    "Stop Condition",
    "- Stop here once a new integrated terminal can run kraken-atlas."
  ].join("\n"));
  vscode.window.showInformationMessage("Kraken Atlas CLI installed for new workspace terminals. Open a new terminal before testing PATH.");
}

async function installWorkspaceCli(extensionPath: string): Promise<{ binFolder: string; cmdPath: string; ps1Path: string; shPath: string }> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    throw new Error("Kraken Atlas needs an open workspace.");
  }

  const binFolder = path.join(workspaceRoot, readConfiguration().outputFolder, "bin");
  const { cmdPath, ps1Path, shPath } = await writeWorkspaceCliShims(extensionPath, binFolder);

  await prependWorkspaceTerminalPath(binFolder);
  return { binFolder, cmdPath, ps1Path, shPath };
}

async function refreshInstalledWorkspaceCli(extensionPath: string): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  const binFolder = path.join(workspaceRoot, readConfiguration().outputFolder, "bin");
  const cmdPath = path.join(binFolder, "kraken-atlas.cmd");
  const ps1Path = path.join(binFolder, "kraken-atlas.ps1");
  const shPath = path.join(binFolder, "kraken-atlas");
  if (!(await pathExists(cmdPath)) && !(await pathExists(ps1Path)) && !(await pathExists(shPath))) {
    return;
  }

  try {
    await writeWorkspaceCliShims(extensionPath, binFolder);
  } catch {
    // Best-effort upgrade repair. The explicit install command reports failures to the user.
  }
}

async function writeWorkspaceCliShims(extensionPath: string, binFolder: string): Promise<{ cmdPath: string; ps1Path: string; shPath: string }> {
  const fs = await import("fs/promises");
  const { renderWorkspaceCliShimScripts } = await import("./agent/workspaceCliShim");
  const scripts = renderWorkspaceCliShimScripts(extensionPath);
  await fs.mkdir(binFolder, { recursive: true });

  const cmdPath = path.join(binFolder, "kraken-atlas.cmd");
  const ps1Path = path.join(binFolder, "kraken-atlas.ps1");
  const shPath = path.join(binFolder, "kraken-atlas");
  await fs.writeFile(cmdPath, scripts.cmd, "utf8");
  await fs.writeFile(ps1Path, scripts.ps1, "utf8");
  await fs.writeFile(shPath, scripts.sh, "utf8");
  return { cmdPath, ps1Path, shPath };
}

function registerLanguageModelTools(context: vscode.ExtensionContext, _output: vscode.OutputChannel): void {
  if (!vscode.lm?.registerTool) {
    return;
  }

  context.subscriptions.push(
    vscode.lm.registerTool("kraken_atlas_doctor", {
      async invoke() {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
          return textToolResult("No VS Code workspace is open.");
        }
        const { inspectMap } = await import("./doctor/mapDoctor");
        const { renderAgentDoctor } = await import("./format/agentFormatter");
        const configuration = readConfiguration();
        const result = await inspectMap({
          extensionPath: context.extensionPath,
          workspaceRoot,
          outputFolder: configuration.outputFolder,
          maxFileSizeBytes: configuration.maxFileSizeBytes,
          scanOptions: scanOptionsFromConfiguration(configuration)
        });
        return textToolResult(renderAgentDoctor(result));
      }
    }),
    vscode.lm.registerTool("kraken_atlas_query", {
      async invoke(options) {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
          return textToolResult("No VS Code workspace is open.");
        }
        const input = options.input as ToolQueryInput;
        const queryType = normalizeToolQueryType(input.queryType);
        if (!queryType) {
          return textToolResult(`Unknown Kraken Atlas queryType: ${String(input.queryType)}.`);
        }
        return textToolResult(await runQuery(workspaceRoot, queryType, stringValue(input.query) ?? "project", stringValue(input.context)));
      }
    }),
    vscode.lm.registerTool("kraken_atlas_context_pack", {
      async invoke(options) {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
          return textToolResult("No VS Code workspace is open.");
        }
        const input = options.input as ToolQueryInput;
        const queryType = normalizeToolQueryType(input.queryType || "where-to-add") ?? "where-to-add";
        const query = stringValue(input.query) ?? "project";
        const { renderContextPack } = await import("./context/agentContext");
        const { withQueryService } = await import("./query/queryService");
        const response = await withQueryService(workspaceRoot, (service) => {
          if (queryType === "project") {
            return service.getProject(query);
          }
          if (queryType === "flow") {
            return service.findFlow(query);
          }
          if (queryType === "search") {
            return service.search(query);
          }
          if (queryType === "relationships") {
            return service.findRelationships(query);
          }
          if (queryType === "symbol") {
            return service.findSymbols(query);
          }
          if (queryType === "references") {
            return service.findReferences(query);
          }
          if (queryType === "pattern") {
            return service.findPatterns(query);
          }
          if (queryType === "pattern-map") {
            return service.findPatternMap(query);
          }
          if (queryType === "hotspots") {
            return service.findArchitectureHotspots(query);
          }
          if (queryType === "orphans") {
            return service.findOrphans(query);
          }
          if (queryType === "duplicates") {
            return service.findDuplicates(query);
          }
          if (queryType === "drift") {
            return service.findDrift(query);
          }
          if (queryType === "plan-change") {
            return service.planChange(query);
          }
          return service.whereToAdd(query);
        }, { projectContext: stringValue(input.context) });
        return textToolResult(renderContextPack(response, { workspaceRoot }));
      }
    })
  );

}

interface ToolQueryInput {
  queryType?: string;
  query?: string;
  context?: string;
}

function normalizeToolQueryType(value: string | undefined): ExtensionQueryType | undefined {
  if (value === "project" || value === "symbol" || value === "references" || value === "relationships" || value === "pattern" || value === "pattern-map" || value === "hotspots" || value === "flow" || value === "search" || value === "where-to-add" || value === "plan-change" || value === "orphans" || value === "duplicates" || value === "drift") {
    return value;
  }
  if (value === "plan") {
    return "plan-change";
  }
  if (value === "symbols") {
    return "symbol";
  }
  if (value === "relationship") {
    return "relationships";
  }
  if (value === "patterns") {
    return "pattern";
  }
  if (value === "patterns-map" || value === "map-patterns") {
    return "pattern-map";
  }
  if (value === "hotspot" || value === "architecture-hotspots" || value === "architecture") {
    return "hotspots";
  }
  if (value === "pattern-drift") {
    return "drift";
  }
  return undefined;
}

function textToolResult(value: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(value.trimEnd())]);
}

async function prependWorkspaceTerminalPath(binFolder: string): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const updates: Array<[string, string]> = [
    ["terminal.integrated.env.windows", `${binFolder};\${env:PATH}`],
    ["terminal.integrated.env.linux", `${toPosixPath(binFolder)}:\${env:PATH}`],
    ["terminal.integrated.env.osx", `${toPosixPath(binFolder)}:\${env:PATH}`]
  ];

  for (const [setting, pathValue] of updates) {
    const existing = config.get<Record<string, string | null>>(setting) ?? {};
    await config.update(setting, { ...existing, PATH: pathValue }, vscode.ConfigurationTarget.Workspace);
  }
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function promptForContext(): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: "Kraken Atlas: Query Context",
    prompt: "Optional project/folder context for parent workspaces",
    placeHolder: "AdminTools",
    value: ""
  });
  return value?.trim() || undefined;
}

function writeOutput(output: vscode.OutputChannel, title: string, body: string): void {
  output.clear();
  output.appendLine(`# ${title}`);
  output.appendLine("");
  output.append(body.trimEnd());
  output.appendLine("");
  output.show(true);
}

function renderForCommandPalette(body: string): string {
  const lines = body.trimEnd().split(/\r?\n/);
  const output: string[] = [];
  let inNextCommands = false;
  let wrotePaletteHint = false;

  for (const line of lines) {
    if (line === "Next Commands") {
      inNextCommands = true;
      output.push(line);
      output.push("- Run Command Palette: Kraken Atlas: Show Project Summary");
      output.push("- Run Command Palette: Kraken Atlas: Find Symbol");
      output.push("- Run Command Palette: Kraken Atlas: Find References");
      output.push("- Run Command Palette: Kraken Atlas: Trace Feature Flow");
      output.push("- Run Command Palette: Kraken Atlas: Suggest Where To Add Code");
      output.push("- Run Command Palette: Kraken Atlas: Show Relationships");
      output.push("- Run Command Palette: Kraken Atlas: Show Detected Pattern");
      output.push("- Run Command Palette: Kraken Atlas: Show Pattern Map");
      output.push("- Run Command Palette: Kraken Atlas: Search Map");
      output.push("- Run Command Palette: Kraken Atlas: Find Orphaned Code Candidates");
      output.push("- Run Command Palette: Kraken Atlas: Find Duplicate Code Blocks");
      output.push("- Run Command Palette: Kraken Atlas: Export Context Pack");
      wrotePaletteHint = true;
      continue;
    }

    if (inNextCommands) {
      if (line === "Stop Condition") {
        inNextCommands = false;
        output.push(line);
      }
      continue;
    }

    output.push(line);
  }

  if (!wrotePaletteHint) {
    output.push("", "Next Commands", "- Run Command Palette: Kraken Atlas: Show Project Summary");
  }

  return `${output.join("\n").trimEnd()}\n`;
}

async function pathExists(filePath: string): Promise<boolean> {
  const fs = await import("fs/promises");
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getWorkspaceRoot(): string | undefined {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("Kraken Atlas needs an open workspace.");
    return undefined;
  }
  return workspaceFolder.uri.fsPath;
}

function extensionVersion(): string {
  const extension = vscode.extensions.getExtension("BinaryKraken.kraken-atlas");
  return extension?.packageJSON?.version ?? "0.1.27";
}
