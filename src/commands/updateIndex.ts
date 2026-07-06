import * as path from "path";
import * as vscode from "vscode";
import { readConfiguration, scanOptionsFromConfiguration } from "../config/configuration";
import { updateProject, UpdateProjectResult } from "../rebuild/updateProject";

export interface UpdateIndexOptions {
  silent?: boolean;
}

let activeUpdate: Promise<void> | null = null;

export async function updateIndex(extensionPath: string, options: UpdateIndexOptions = {}): Promise<void> {
  if (activeUpdate) {
    return activeUpdate;
  }

  activeUpdate = runUpdateIndex(extensionPath, options).finally(() => {
    activeUpdate = null;
  });

  return activeUpdate;
}

export function shouldUpdateOnSave(document: vscode.TextDocument): boolean {
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

  return new Set([".cs", ".csproj", ".sln", ".props", ".targets", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".html", ".htm", ".cshtml", ".razor"]).has(
    path.extname(document.uri.fsPath).toLowerCase()
  );
}

async function runUpdateIndex(extensionPath: string, options: UpdateIndexOptions): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    if (!options.silent) {
      vscode.window.showErrorMessage("Kraken Atlas needs an open workspace before it can update the index.");
    }
    return;
  }

  const configuration = readConfiguration();
  const workspaceRoot = workspaceFolder.uri.fsPath;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Kraken Atlas: updating index",
      cancellable: false
    },
    async (progress) => {
      const result = await updateProject({
        extensionPath,
        workspaceRoot,
        outputFolder: configuration.outputFolder,
        maxFileSizeBytes: configuration.maxFileSizeBytes,
        scanOptions: scanOptionsFromConfiguration(configuration),
        onProgress: (message) => progress.report({ message })
      });

      showUpdateResult(result, options);
    }
  );
}

function showUpdateResult(result: UpdateProjectResult, options: UpdateIndexOptions): void {
  if (options.silent && result.mode === "skipped") {
    return;
  }

  const changedCount = result.addedFiles.length + result.changedFiles.length + result.deletedFiles.length;
  vscode.window.showInformationMessage(`Kraken Atlas update: ${result.mode}, ${changedCount} changed file(s), ${result.scanSummary?.excludedFiles ?? 0} excluded.`);
}
