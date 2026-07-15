import * as vscode from "vscode";
import { renderAtlasSummary, renderEntityDetail } from "./atlas/render";
import { CartographerClient } from "./cartographer/client";
import { renderFoundationStatus } from "./foundation/status";

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
            title: "Kraken Atlas: discovering workspace",
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
    vscode.commands.registerCommand("krakenAtlas.openPlanning", async () => {
      await runCommand(async () => {
        const uri = vscode.Uri.joinPath(context.extensionUri, "docs", "planning", "README.md");
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: true });
      });
    })
  );
}

export function deactivate(): void {
  // Disposables registered during activation own process shutdown.
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
