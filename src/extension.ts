import * as os from "node:os";
import * as vscode from "vscode";
import {
  renderAtlasSummary,
  renderCodeUsages,
  renderEntityDetail,
  renderSymbolSearch,
  renderWorkspaceOrientation
} from "./atlas/render";
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
