import * as os from "node:os";
import * as vscode from "vscode";
import {
  renderAtlasSummary,
  renderAtlasHealth,
  renderAssessments,
  renderCodeUsages,
  renderChangeSurface,
  renderDecorationResult,
  renderEntityDetail,
  renderEntitySearch,
  renderGitChanges,
  renderPreparedChange,
  renderRelations,
  renderRoute,
  renderSymbolSearch,
  renderWorkspaceOrientation
} from "./atlas/render";
import { NodeDecorationBatch } from "./atlas/contracts";
import {
  codexConfigRelativePath,
  hasManagedCodexMcpConfiguration,
  updateCodexMcpConfiguration
} from "./agentDiscovery/codexConfig";
import {
  AgentInstructionTarget,
  agentInstructionTargets,
  hasManagedAgentInstructions,
  updateAgentInstructions
} from "./agentDiscovery/instructions";
import {
  McpLaunchDefinition,
  createAtlasMcpLaunchDefinition,
  renderGenericMcpConfiguration
} from "./agentDiscovery/mcpConnection";
import {
  claudeMcpConfigRelativePath,
  hasManagedClaudeMcpConfiguration,
  updateClaudeMcpConfiguration
} from "./agentDiscovery/mcpJsonConfig";
import { CartographerClient, resolveCartographerAssemblyPath } from "./cartographer/client";
import { createDiagnosticReport } from "./diagnostics/report";
import { renderFoundationStatus } from "./foundation/status";
import { createDotnetRuntimeRequirementError, inspectDotnetRuntime } from "./runtime/dotnetRuntime";

let activeClient: CartographerClient | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("Kraken Atlas");
  const workspaceRoots = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath) ?? [];
  const storageRoot = context.storageUri ?? vscode.Uri.joinPath(context.globalStorageUri, "no-workspace");
  const atlasPath = vscode.Uri.joinPath(storageRoot, "atlas.sqlite3").fsPath;
  const client = new CartographerClient(
    context.extensionPath,
    workspaceRoots,
    atlasPath,
    (message) => output.appendLine(message)
  );
  activeClient = client;
  const version = String(context.extension.packageJSON.version ?? "unknown");
  const mcpLaunch = workspaceRoots.length === 0
    ? undefined
    : createAtlasMcpLaunchDefinition({
      assemblyPath: resolveCartographerAssemblyPath(context.extensionPath),
      atlasPath,
      extensionPath: context.extensionPath,
      workspaceRoots
    });
  context.subscriptions.push(vscode.lm.registerMcpServerDefinitionProvider(
    "krakenAtlas.cartographer",
    {
      provideMcpServerDefinitions: () => {
        if (workspaceRoots.length === 0) {
          return [];
        }
        if (!mcpLaunch) {
          return [];
        }
        const definition = new vscode.McpStdioServerDefinition(
          "Kraken Atlas",
          mcpLaunch.command,
          [...mcpLaunch.args],
          { ...(mcpLaunch.env ?? {}) },
          version
        );
        definition.cwd = vscode.Uri.file(mcpLaunch.cwd);
        return [definition];
      },
      resolveMcpServerDefinition: async (server) => {
        const runtime = await inspectDotnetRuntime();
        if (!runtime.available) {
          throw createDotnetRuntimeRequirementError(runtime);
        }
        return server;
      }
    }
  ));

  context.subscriptions.push(
    client,
    output,
    vscode.commands.registerCommand("krakenAtlas.showStatus", async () => {
      await runCommand(() => showStatus(client, output, version));
    }),
    vscode.commands.registerCommand("krakenAtlas.showHealth", async () => {
      await runCommand(async () => {
        const health = await client.getAtlasHealth();
        output.clear();
        output.appendLine(renderAtlasHealth(health, version));
        output.show(true);
      });
    }),
    vscode.commands.registerCommand("krakenAtlas.buildAtlas", async () => {
      await runCommand(async () => {
        if (workspaceRoots.length === 0) {
          throw new Error("Open a workspace folder before building the Atlas.");
        }
        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Kraken Atlas: indexing workspace",
            cancellable: false
          },
          () => client.buildAtlas()
        );
        await showAtlasSummary(client, output, version);
        vscode.window.showInformationMessage(
          `Kraken Atlas ${result.indexing.mode}, generation ${result.generation}: ${result.counts.projects} projects, ${result.counts.files} files.`
        );
      });
    }),
    vscode.commands.registerCommand("krakenAtlas.showAtlasSummary", async () => {
      await runCommand(() => showAtlasSummary(client, output, version));
    }),
    vscode.commands.registerCommand("krakenAtlas.showWorkspaceOrientation", async () => {
      await runCommand(async () => {
        const orientation = await client.getWorkspaceOrientation();
        output.clear();
        output.appendLine(renderWorkspaceOrientation(orientation, version));
        output.show(true);
      });
    }),
    vscode.commands.registerCommand("krakenAtlas.lookupEntity", async () => {
      await runCommand(async () => {
        const value = await vscode.window.showInputBox({
          title: "Kraken Atlas: Lookup Entity",
          prompt: "Enter an exact stable key or numeric entity ID",
          ignoreFocusOut: true
        });
        if (!value) {
          return;
        }
        const numericId = /^\d+$/.test(value) ? Number(value) : undefined;
        const entity = await client.getEntity(numericId === undefined ? value : undefined, numericId);
        if (!entity) {
          vscode.window.showWarningMessage("Kraken Atlas: No current entity matched that exact identity.");
          return;
        }
        output.clear();
        output.appendLine(renderEntityDetail(entity));
        output.show(true);
      });
    }),
    vscode.commands.registerCommand("krakenAtlas.searchSymbols", async () => {
      await runCommand(async () => {
        const query = await vscode.window.showInputBox({
          title: "Kraken Atlas: Search C# Symbols",
          prompt: "Enter a symbol name or qualified-name fragment",
          ignoreFocusOut: true
        });
        if (!query?.trim()) {
          return;
        }
        const result = await client.searchSymbols(query.trim());
        output.clear();
        output.appendLine(renderSymbolSearch(result));
        output.show(true);
      });
    }),
    vscode.commands.registerCommand("krakenAtlas.searchEntities", async () => {
      await runCommand(async () => {
        const query = await vscode.window.showInputBox({
          title: "Kraken Atlas: Search Entities",
          prompt: "Search symbols, endpoints, requests, registrations, database operations, and database objects",
          ignoreFocusOut: true
        });
        if (!query?.trim()) {
          return;
        }
        const result = await client.searchEntities(query.trim());
        output.clear();
        output.appendLine(renderEntitySearch(result));
        output.show(true);
      });
    }),
    vscode.commands.registerCommand("krakenAtlas.findUsages", async () => {
      await runCommand(async () => {
        const value = await vscode.window.showInputBox({
          title: "Kraken Atlas: Find C# Usages",
          prompt: "Enter an exact C# symbol stable key or numeric entity ID",
          ignoreFocusOut: true
        });
        if (!value?.trim()) {
          return;
        }
        const identity = value.trim();
        const numericId = /^\d+$/.test(identity) ? Number(identity) : undefined;
        const result = await client.findUsages(numericId === undefined ? identity : undefined, numericId);
        output.clear();
        output.appendLine(renderCodeUsages(result));
        output.show(true);
      });
    }),
    vscode.commands.registerCommand("krakenAtlas.showRelations", async () => {
      await runCommand(async () => {
        const value = await vscode.window.showInputBox({
          title: "Kraken Atlas: Show Relations",
          prompt: "Enter an exact stable key or numeric entity ID",
          ignoreFocusOut: true
        });
        if (!value?.trim()) {
          return;
        }
        const direction = await vscode.window.showQuickPick(
          ["both", "outgoing", "incoming"] as const,
          { title: "Kraken Atlas: Relation Direction", ignoreFocusOut: true }
        );
        if (!direction) {
          return;
        }
        const identity = value.trim();
        const numericId = /^\d+$/.test(identity) ? Number(identity) : undefined;
        const result = await client.getRelations(
          numericId === undefined ? identity : undefined,
          numericId,
          direction as "incoming" | "outgoing" | "both"
        );
        output.clear();
        output.appendLine(renderRelations(result));
        output.show(true);
      });
    }),
    vscode.commands.registerCommand("krakenAtlas.traceRoute", async () => {
      await runCommand(async () => {
        const source = await promptIdentity("Kraken Atlas: Trace Route", "Enter the source stable key or numeric entity ID");
        if (!source) {
          return;
        }
        const target = await promptIdentity("Kraken Atlas: Trace Route", "Enter the target stable key or numeric entity ID");
        if (!target) {
          return;
        }
        const via = await vscode.window.showInputBox({
          title: "Kraken Atlas: Route Waypoints",
          prompt: "Optional ordered stable keys, separated by commas",
          ignoreFocusOut: true
        });
        if (via === undefined) {
          return;
        }
        const viaStableKeys = via.split(",").map(value => value.trim()).filter(Boolean);
        const result = await client.traceRoute(
          source.stableKey,
          source.id,
          target.stableKey,
          target.id,
          viaStableKeys,
          undefined,
          undefined,
          16
        );
        output.clear();
        output.appendLine(renderRoute(result));
        output.show(true);
      });
    }),
    vscode.commands.registerCommand("krakenAtlas.showChangeSurface", async () => {
      await runCommand(async () => {
        const identity = await promptIdentity(
          "Kraken Atlas: Show Change Surface",
          "Enter the seed stable key or numeric entity ID"
        );
        if (!identity) {
          return;
        }
        const result = await client.getChangeSurface(identity.stableKey, identity.id);
        output.clear();
        output.appendLine(renderChangeSurface(result));
        output.show(true);
      });
    }),
    vscode.commands.registerCommand("krakenAtlas.projectGitChanges", async () => {
      await runCommand(async () => {
        const mode = await vscode.window.showQuickPick(
          [
            { label: "Working tree", value: "working_tree" as const },
            { label: "Commit range", value: "range" as const }
          ],
          { title: "Kraken Atlas: Project Git Changes", ignoreFocusOut: true }
        );
        if (!mode) {
          return;
        }
        let baseRef: string | undefined;
        let targetRef: string | undefined;
        if (mode.value === "range") {
          baseRef = await vscode.window.showInputBox({
            title: "Kraken Atlas: Base Revision",
            prompt: "Enter the base Git revision",
            value: "HEAD~1",
            ignoreFocusOut: true
          });
          if (!baseRef?.trim()) {
            return;
          }
          targetRef = await vscode.window.showInputBox({
            title: "Kraken Atlas: Target Revision",
            prompt: "Enter the target Git revision",
            value: "HEAD",
            ignoreFocusOut: true
          });
          if (!targetRef?.trim()) {
            return;
          }
        }
        const result = await client.getGitChanges(
          mode.value,
          baseRef?.trim(),
          targetRef?.trim()
        );
        output.clear();
        output.appendLine(renderGitChanges(result));
        output.show(true);
      });
    }),
    vscode.commands.registerCommand("krakenAtlas.prepareChange", async () => {
      await runCommand(async () => {
        const identity = await promptIdentity(
          "Kraken Atlas: Prepare Change Context Pack",
          "Enter the seed stable key or numeric entity ID"
        );
        if (!identity) {
          return;
        }
        const task = await vscode.window.showInputBox({
          title: "Kraken Atlas: Change Task",
          prompt: "Describe the change the coding agent is preparing to make",
          ignoreFocusOut: true
        });
        if (!task?.trim()) {
          return;
        }
        const budgetValue = await vscode.window.showInputBox({
          title: "Kraken Atlas: Context Token Budget",
          prompt: "Estimated maximum tokens for the prepared Context Pack",
          value: "4000",
          ignoreFocusOut: true,
          validateInput: value => {
            const budget = Number(value);
            return Number.isInteger(budget) && budget >= 800 && budget <= 32000
              ? undefined
              : "Enter an integer from 800 through 32000.";
          }
        });
        if (!budgetValue) {
          return;
        }
        const result = await client.prepareChange(
          task.trim(), identity.stableKey, identity.id, Number(budgetValue)
        );
        output.clear();
        output.appendLine(renderPreparedChange(result));
        output.show(true);
      });
    }),
    vscode.commands.registerCommand("krakenAtlas.showAssessments", async () => {
      await runCommand(async () => {
        const identity = await promptIdentity(
          "Kraken Atlas: Show Node Assessments",
          "Enter the subject stable key or numeric entity ID"
        );
        if (!identity) {
          return;
        }
        const result = await client.getEntityAssessments(
          identity.stableKey, identity.id, true, true, true
        );
        output.clear();
        output.appendLine(renderAssessments(result));
        output.show(true);
      });
    }),
    vscode.commands.registerCommand("krakenAtlas.applyDecorations", async () => {
      await runCommand(async () => {
        if (!vscode.workspace.isTrusted) {
          throw new Error("Node decoration writes require a trusted workspace.");
        }
        const selected = await vscode.window.showOpenDialog({
          title: "Kraken Atlas: Select Node Decoration JSON",
          canSelectMany: false,
          canSelectFiles: true,
          canSelectFolders: false,
          filters: { JSON: ["json"] }
        });
        if (!selected?.[0]) {
          return;
        }
        const content = await vscode.workspace.fs.readFile(selected[0]);
        const parsed = JSON.parse(Buffer.from(content).toString("utf8")) as NodeDecorationBatch;
        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.decorations)) {
          throw new Error("The selected file is not a node-decoration batch.");
        }
        const dryRunPayload: NodeDecorationBatch = {
          ...parsed,
          options: { ...(parsed.options ?? {}), dryRun: true }
        };
        const validated = await client.decorateNodes(dryRunPayload);
        output.clear();
        output.appendLine(renderDecorationResult(validated));
        output.show(true);
        const choice = await vscode.window.showWarningMessage(
          `Apply ${validated.results.length} validated node decoration updates to generation ${validated.atlasGeneration}?`,
          { modal: true },
          "Apply"
        );
        if (choice !== "Apply") {
          return;
        }
        const applied = await client.decorateNodes({
          ...parsed,
          options: { ...(parsed.options ?? {}), dryRun: false }
        });
        output.clear();
        output.appendLine(renderDecorationResult(applied));
        output.show(true);
        vscode.window.showInformationMessage(
          `Kraken Atlas applied ${applied.results.length} node decoration updates.`
        );
      });
    }),
    vscode.commands.registerCommand("krakenAtlas.restartCartographer", async () => {
      await runCommand(async () => {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Kraken Atlas: restarting Cartographer",
            cancellable: false
          },
          async () => {
            await client.restart();
          }
        );
        await showStatus(client, output, version);
      });
    }),
    vscode.commands.registerCommand("krakenAtlas.exportDiagnostics", async () => {
      await runCommand(() => exportDiagnostics(context, client, output, workspaceRoots, atlasPath, version));
    }),
    vscode.commands.registerCommand("krakenAtlas.installAgentInstructions", async () => {
      await runCommand(() => setupAiAgent(requireMcpLaunch(mcpLaunch)));
    }),
    vscode.commands.registerCommand("krakenAtlas.setupAgent", async () => {
      await runCommand(() => setupAiAgent(requireMcpLaunch(mcpLaunch)));
    }),
    vscode.commands.registerCommand("krakenAtlas.copyMcpConfiguration", async () => {
      await runCommand(async () => {
        await vscode.env.clipboard.writeText(renderGenericMcpConfiguration(requireMcpLaunch(mcpLaunch)));
        vscode.window.showInformationMessage("Kraken Atlas copied a generic stdio MCP configuration.");
      });
    }),
    vscode.commands.registerCommand("krakenAtlas.openPlanning", async () => {
      await runCommand(async () => {
        const uri = vscode.Uri.joinPath(context.extensionUri, "docs", "planning", "README.md");
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: true });
      });
    })
  );

  if (mcpLaunch) {
    await refreshManagedAgentConfiguration(mcpLaunch, output);
  }
}

export async function deactivate(): Promise<void> {
  const client = activeClient;
  activeClient = undefined;
  await client?.shutdown();
}

async function exportDiagnostics(
  context: vscode.ExtensionContext,
  client: CartographerClient,
  output: vscode.OutputChannel,
  workspaceRoots: string[],
  atlasPath: string,
  extensionVersion: string
): Promise<void> {
  const runtime = await inspectDotnetRuntime();
  let session;
  let foundation;
  let summary;
  let health;
  let cartographerError: string | undefined;

  if (runtime.available) {
    try {
      session = await client.getSessionInfo();
      [foundation, summary, health] = await Promise.all([
        client.getFoundationStatus(),
        client.getAtlasSummary(),
        client.getAtlasHealth()
      ]);
    } catch (error) {
      cartographerError = error instanceof Error ? error.message : String(error);
    }
  } else {
    cartographerError = createDotnetRuntimeRequirementError(runtime).message;
  }

  const report = createDiagnosticReport({
    extensionVersion,
    vscodeVersion: vscode.version,
    vscodeAppName: vscode.env.appName,
    remoteName: vscode.env.remoteName,
    platform: process.platform,
    architecture: process.arch,
    osRelease: os.release(),
    workspaceRoots,
    atlasPath,
    runtime,
    session,
    foundation,
    summary,
    health,
    cartographerError
  });
  const fileName = `kraken-atlas-diagnostics-${report.generatedUtc.replace(/[:.]/g, "-")}.json`;
  await vscode.workspace.fs.createDirectory(context.globalStorageUri);
  const target = await vscode.window.showSaveDialog({
    title: "Export Kraken Atlas Diagnostics (contains local paths)",
    defaultUri: vscode.Uri.joinPath(context.globalStorageUri, fileName),
    saveLabel: "Export Diagnostics",
    filters: { JSON: ["json"] }
  });
  if (!target) {
    return;
  }

  await vscode.workspace.fs.writeFile(
    target,
    Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8")
  );
  output.appendLine(`Diagnostics exported to ${target.fsPath}`);
  vscode.window.showInformationMessage(`Kraken Atlas diagnostics exported to ${target.fsPath}`);
}

async function showStatus(
  client: CartographerClient,
  output: vscode.OutputChannel,
  version: string
): Promise<void> {
  const status = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Kraken Atlas: checking foundation status",
      cancellable: false
    },
    () => client.getFoundationStatus()
  );
  const rendered = renderFoundationStatus(status, version);
  output.clear();
  output.appendLine(rendered);
  output.show(true);
  vscode.window.showInformationMessage(`Kraken Atlas Cartographer: ${status.cartographerState}; Atlas: ${status.atlasState}.`);
}

async function showAtlasSummary(
  client: CartographerClient,
  output: vscode.OutputChannel,
  version: string
): Promise<void> {
  const summary = await client.getAtlasSummary();
  output.clear();
  output.appendLine(renderAtlasSummary(summary, version));
  output.show(true);
}

async function runCommand(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Kraken Atlas: ${message}`);
  }
}

interface AgentInstructionPick extends vscode.QuickPickItem {
  targets: readonly AgentInstructionTarget[];
  connections: readonly AgentConnectionKind[];
}

interface AgentSetupPlan {
  relativePath: string;
  uri: vscode.Uri;
  update: { change: "created" | "appended" | "updated" | "unchanged"; content: string };
}

type AgentConnectionKind = "native-vscode" | "codex" | "claude" | "generic";

function requireMcpLaunch(launch: McpLaunchDefinition | undefined): McpLaunchDefinition {
  if (!launch) {
    throw new Error("Open a workspace folder before setting up an AI agent.");
  }
  return launch;
}

async function setupAiAgent(mcpLaunch: McpLaunchDefinition): Promise<void> {
  if (!vscode.workspace.isTrusted) {
    throw new Error("Setting up an AI agent requires a trusted workspace.");
  }

  const workspaceFolder = await chooseInstructionWorkspaceFolder();
  if (!workspaceFolder) {
    return;
  }

  const target = (id: AgentInstructionTarget["id"]): AgentInstructionTarget => {
    const found = agentInstructionTargets.find(candidate => candidate.id === id);
    if (!found) {
      throw new Error(`Missing agent instruction target: ${id}`);
    }
    return found;
  };
  const picks: AgentInstructionPick[] = [
    {
      label: "VS Code Chat / GitHub Copilot",
      description: "Automatic connection",
      detail: "Use the extension-provided MCP server and repository Copilot instructions",
      targets: [target("copilot")],
      connections: ["native-vscode"]
    },
    {
      label: "Codex",
      detail: "Install AGENTS.md and a project-scoped .codex/config.toml connection",
      targets: [target("agents")],
      connections: ["codex"]
    },
    {
      label: "Claude Code",
      detail: "Install CLAUDE.md and a project-scoped .mcp.json connection",
      targets: [target("claude")],
      connections: ["claude"]
    },
    {
      label: "Other MCP-capable agent",
      detail: "Install AGENTS.md and copy a generic stdio MCP configuration",
      targets: [target("agents")],
      connections: ["generic"]
    },
    {
      label: "All supported clients",
      detail: "Install every instruction file plus Codex and Claude MCP adapters",
      targets: agentInstructionTargets,
      connections: ["native-vscode", "codex", "claude"]
    }
  ];
  const selected = await vscode.window.showQuickPick(picks, {
    title: "Kraken Atlas: Set Up AI Agent",
    placeHolder: "Choose the AI agent that should connect to Atlas",
    ignoreFocusOut: true
  });
  if (!selected) {
    return;
  }

  const plans: AgentSetupPlan[] = [];
  for (const target of selected.targets) {
    const segments = target.relativePath.split("/");
    const uri = vscode.Uri.joinPath(workspaceFolder.uri, ...segments);
    const existing = await readOptionalWorkspaceText(uri);
    const update = updateAgentInstructions(existing);
    plans.push({ relativePath: target.relativePath, uri, update });
  }
  const installsCodex = selected.connections.includes("codex");
  if (installsCodex) {
    const segments = codexConfigRelativePath.split("/");
    const uri = vscode.Uri.joinPath(workspaceFolder.uri, ...segments);
    const existing = await readOptionalWorkspaceText(uri);
    const update = updateCodexMcpConfiguration(existing, mcpLaunch);
    plans.push({ relativePath: codexConfigRelativePath, uri, update });
  }
  const installsClaude = selected.connections.includes("claude");
  if (installsClaude) {
    const segments = claudeMcpConfigRelativePath.split("/");
    const uri = vscode.Uri.joinPath(workspaceFolder.uri, ...segments);
    const existing = await readOptionalWorkspaceText(uri);
    const update = updateClaudeMcpConfiguration(existing, mcpLaunch);
    plans.push({ relativePath: claudeMcpConfigRelativePath, uri, update });
  }

  for (const plan of plans) {
    if (plan.update.change !== "unchanged") {
      const segments = plan.relativePath.split("/");
      if (segments.length > 1) {
        await vscode.workspace.fs.createDirectory(
          vscode.Uri.joinPath(workspaceFolder.uri, ...segments.slice(0, -1))
        );
      }
      await vscode.workspace.fs.writeFile(plan.uri, Buffer.from(plan.update.content, "utf8"));
    }
  }

  const copiesGeneric = selected.connections.includes("generic");
  if (copiesGeneric) {
    await vscode.env.clipboard.writeText(renderGenericMcpConfiguration(mcpLaunch));
  }

  const changed = plans.filter(plan => plan.update.change !== "unchanged");
  const summary = changed.length === 0
    ? "Kraken Atlas agent setup files are already current."
    : `Kraken Atlas installed agent setup in ${changed.map(plan => plan.relativePath).join(", ")}. ` +
      "The next Atlas build will map instruction files as governing repository rules.";
  const connectionNotes: string[] = [];
  if (selected.connections.includes("native-vscode")) {
    connectionNotes.push("VS Code agents receive Atlas through the extension's native MCP provider.");
  }
  if (installsCodex || installsClaude) {
    connectionNotes.push("Reload VS Code or restart the selected agent before opening a new task.");
  }
  if (copiesGeneric) {
    connectionNotes.push("A generic MCP configuration is on the clipboard; paste it into the agent's MCP settings and restart that agent.");
  }
  const detail = `${summary} ${connectionNotes.join(" ")}`.trim();
  const canReload = installsCodex || installsClaude;
  const actions = canReload ? ["Reload VS Code", "Open Instructions"] : ["Open Instructions"];
  const open = await vscode.window.showInformationMessage(detail, ...actions);
  if (open === "Reload VS Code") {
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
    return;
  }
  if (open === "Open Instructions") {
    const document = await vscode.workspace.openTextDocument((changed[0] ?? plans[0]).uri);
    await vscode.window.showTextDocument(document, { preview: true });
  }
}

async function refreshManagedAgentConfiguration(
  launch: McpLaunchDefinition,
  output: vscode.OutputChannel
): Promise<void> {
  if (!vscode.workspace.isTrusted) {
    return;
  }

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    for (const target of agentInstructionTargets) {
      await refreshManagedConfiguration(
        vscode.Uri.joinPath(folder.uri, ...target.relativePath.split("/")),
        `${target.label} instructions`,
        hasManagedAgentInstructions,
        updateAgentInstructions,
        output
      );
    }
    await refreshManagedMcpConfiguration(
      vscode.Uri.joinPath(folder.uri, ...codexConfigRelativePath.split("/")),
      "Codex",
      hasManagedCodexMcpConfiguration,
      existing => updateCodexMcpConfiguration(existing, launch),
      output
    );
    await refreshManagedMcpConfiguration(
      vscode.Uri.joinPath(folder.uri, ...claudeMcpConfigRelativePath.split("/")),
      "Claude",
      hasManagedClaudeMcpConfiguration,
      existing => updateClaudeMcpConfiguration(existing, launch),
      output
    );
  }
}

async function refreshManagedMcpConfiguration(
  uri: vscode.Uri,
  clientName: string,
  isManaged: (content: string) => boolean,
  updateConfiguration: (content: string) => AgentSetupPlan["update"],
  output: vscode.OutputChannel
): Promise<void> {
  await refreshManagedConfiguration(uri, `${clientName} MCP configuration`, isManaged, updateConfiguration, output);
}

async function refreshManagedConfiguration(
  uri: vscode.Uri,
  label: string,
  isManaged: (content: string) => boolean,
  updateConfiguration: (content: string) => AgentSetupPlan["update"],
  output: vscode.OutputChannel
): Promise<void> {
  const existing = await readOptionalWorkspaceText(uri);
  if (!existing || !isManaged(existing)) {
    return;
  }
  try {
    const update = updateConfiguration(existing);
    if (update.change !== "unchanged") {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(update.content, "utf8"));
      output.appendLine(`Refreshed managed ${label}: ${uri.fsPath}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`Could not refresh managed ${label} at ${uri.fsPath}: ${message}`);
  }
}

async function chooseInstructionWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    throw new Error("Open a workspace folder before installing agent instructions.");
  }
  if (folders.length === 1) {
    return folders[0];
  }

  const selected = await vscode.window.showQuickPick(
    folders.map(folder => ({ label: folder.name, description: folder.uri.fsPath, folder })),
    {
      title: "Kraken Atlas: Select Instruction Scope",
      placeHolder: "Choose the workspace folder that should receive the instructions",
      ignoreFocusOut: true
    }
  );
  return selected?.folder;
}

async function readOptionalWorkspaceText(uri: vscode.Uri): Promise<string | undefined> {
  try {
    const content = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(content).toString("utf8");
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
      return undefined;
    }
    throw error;
  }
}

async function promptIdentity(
  title: string,
  prompt: string
): Promise<{ stableKey?: string; id?: number } | undefined> {
  const value = await vscode.window.showInputBox({ title, prompt, ignoreFocusOut: true });
  if (!value?.trim()) {
    return undefined;
  }
  const identity = value.trim();
  return /^\d+$/.test(identity) ? { id: Number(identity) } : { stableKey: identity };
}
