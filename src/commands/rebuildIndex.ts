import * as vscode from "vscode";
import { readConfiguration, scanOptionsFromConfiguration } from "../config/configuration";
import { rebuildProject } from "../rebuild/rebuildProject";

export async function rebuildIndex(extensionPath: string): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    vscode.window.showErrorMessage("Kraken Atlas needs an open workspace before it can rebuild the index.");
    return;
  }

  const configuration = readConfiguration();
  const workspaceRoot = workspaceFolder.uri.fsPath;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Kraken Atlas: rebuilding index",
      cancellable: false
    },
    async (progress) => {
      const result = await rebuildProject({
        extensionPath,
        workspaceRoot,
        outputFolder: configuration.outputFolder,
        maxFileSizeBytes: configuration.maxFileSizeBytes,
        scanOptions: scanOptionsFromConfiguration(configuration),
        onProgress: (message) => progress.report({ message })
      });

      vscode.window.showInformationMessage(`Kraken Atlas indexed ${result.fileCount} files; excluded ${result.scanSummary?.excludedFiles ?? 0}.`);
    }
  );
}
