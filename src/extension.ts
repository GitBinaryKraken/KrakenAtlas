import * as vscode from "vscode";
import * as path from "path";
import { readConfiguration, scanOptionsFromConfiguration } from "./config/configuration";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Kraken Atlas");

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

type ExtensionQueryType = "project" | "symbol" | "references" | "relationships" | "pattern" | "flow" | "search" | "where-to-add";

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
        if (queryType === "flow") {
          return service.findFlow(query);
        }
        if (queryType === "search") {
          return service.search(query);
        }
        return service.whereToAdd(query);
      }, { projectContext: contextName });

      writeOutput(output, `${queryType}: ${query}${contextName ? ` [${contextName}]` : ""}`, renderForCommandPalette(renderAgentResponse(response)));
      vscode.window.showInformationMessage(`Kraken Atlas ${queryType} query returned ${response.files.length} file(s).`);
    }
  );
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
      await fs.writeFile(outputPath, renderContextPack(response), "utf8");

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

  const { installAgentInstructions } = await import("./agent/terminalInstructions");
  const result = await installAgentInstructions(workspaceRoot);
  writeOutput(output, "Install Agent Instructions", [
    "Answer",
    `Kraken Atlas agent instructions ${result.action}.`,
    "",
    "Open These Files",
    `- ${result.filePath}`,
    "",
    "Evidence",
    "- AGENTS.md now contains query-first Kraken Atlas guidance.",
    "",
    "Next Commands",
    "- Run Command Palette: Kraken Atlas: Check Map Health",
    "- Run Command Palette: Kraken Atlas: Show Project Summary",
    "",
    "Stop Condition",
    "- Stop here once the agent instructions are installed."
  ].join("\n"));
  vscode.window.showInformationMessage(`Kraken Atlas agent instructions ${result.action}.`);
}

async function installWorkspaceCliCommand(extensionPath: string, output: vscode.OutputChannel): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  const fs = await import("fs/promises");
  const binFolder = path.join(workspaceRoot, readConfiguration().outputFolder, "bin");
  const cliPath = path.join(extensionPath, "dist", "cli.js");
  await fs.mkdir(binFolder, { recursive: true });

  const cmdPath = path.join(binFolder, "kraken-atlas.cmd");
  const ps1Path = path.join(binFolder, "kraken-atlas.ps1");
  const shPath = path.join(binFolder, "kraken-atlas");
  await fs.writeFile(cmdPath, `@echo off\r\nnode "${cliPath}" %*\r\n`, "utf8");
  await fs.writeFile(ps1Path, `node "${cliPath}" @args\r\n`, "utf8");
  await fs.writeFile(shPath, `#!/usr/bin/env sh\nnode "${cliPath}" "$@"\n`, "utf8");

  await prependWorkspaceTerminalPath(binFolder);

  writeOutput(output, "Install Workspace CLI", [
    "Answer",
    "Kraken Atlas workspace CLI shims installed.",
    "",
    "Open These Files",
    `- ${binFolder}`,
    "- .vscode/settings.json",
    "",
    "Evidence",
    `- Windows cmd shim: ${cmdPath}`,
    `- PowerShell shim: ${ps1Path}`,
    `- POSIX shell shim: ${shPath}`,
    "- New VS Code integrated terminals will include the shim folder on PATH.",
    "",
    "Next Commands",
    "- Close existing VS Code terminals.",
    "- Open a new VS Code terminal.",
    "- Run: kraken-atlas --help",
    "- Run: kraken-atlas doctor --workspace . --format agent",
    "",
    "Stop Condition",
    "- Stop here once a new integrated terminal can run kraken-atlas."
  ].join("\n"));
  vscode.window.showInformationMessage("Kraken Atlas CLI installed for new workspace terminals. Open a new terminal before testing PATH.");
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
      output.push("- Run Command Palette: Kraken Atlas: Search Map");
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

function getWorkspaceRoot(): string | undefined {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("Kraken Atlas needs an open workspace.");
    return undefined;
  }
  return workspaceFolder.uri.fsPath;
}
