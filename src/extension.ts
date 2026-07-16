import * as os from "node:os";
import * as vscode from "vscode";
import {
  renderAtlasSummary,
  renderAssessments,
  renderCodeUsages,
  renderChangeSurface,
  renderDecorationResult,
  renderEntityDetail,
  renderEntitySearch,
  renderPreparedChange,
  renderRelations,
  renderRoute,
  renderSymbolSearch,
  renderWorkspaceOrientation
} from "./atlas/render";
import { NodeDecorationBatch } from "./atlas/contracts";
import { CartographerClient } from "./cartographer/client";
import { createDiagnosticReport } from "./diagnostics/report";
import { renderFoundationStatus } from "./foundation/status";
import { createDotnetRuntimeRequirementError, inspectDotnetRuntime } from "./runtime/dotnetRuntime";

let activeClient: CartographerClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
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

  context.subscriptions.push(
    client,
    output,
    vscode.commands.registerCommand("krakenAtlas.showStatus", async () => {
      await runCommand(() => showStatus(client, output, version));
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
          `Kraken Atlas generation ${result.generation}: ${result.counts.projects} projects, ${result.counts.files} files.`
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
    vscode.commands.registerCommand("krakenAtlas.openPlanning", async () => {
      await runCommand(async () => {
        const uri = vscode.Uri.joinPath(context.extensionUri, "docs", "planning", "README.md");
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: true });
      });
    })
  );
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
  let cartographerError: string | undefined;

  if (runtime.available) {
    try {
      session = await client.getSessionInfo();
      [foundation, summary] = await Promise.all([
        client.getFoundationStatus(),
        client.getAtlasSummary()
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
