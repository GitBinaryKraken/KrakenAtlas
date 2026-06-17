import * as vscode from "vscode";
import { defaultMaxFileSizeBytes, defaultOutputFolder } from "./defaults";
import type { ScanOptions } from "../scanner/fileScanner";

export interface KrakenAtlasConfiguration {
  outputFolder: string;
  maxFileSizeBytes: number;
  updateOnSave: boolean;
  excludeDirectories: string[];
  excludeGlobs: string[];
  excludeExtensions: string[];
  excludeFiles: string[];
  includeGlobs: string[];
  ignoreFile: string;
}

export function readConfiguration(): KrakenAtlasConfiguration {
  const config = vscode.workspace.getConfiguration("krakenAtlas");

  return {
    outputFolder: config.get<string>("outputFolder", defaultOutputFolder),
    maxFileSizeBytes: config.get<number>("maxFileSizeBytes", defaultMaxFileSizeBytes),
    updateOnSave: config.get<boolean>("updateOnSave", false),
    excludeDirectories: config.get<string[]>("excludeDirectories", []),
    excludeGlobs: config.get<string[]>("excludeGlobs", []),
    excludeExtensions: config.get<string[]>("excludeExtensions", []),
    excludeFiles: config.get<string[]>("excludeFiles", []),
    includeGlobs: config.get<string[]>("includeGlobs", []),
    ignoreFile: config.get<string>("ignoreFile", ".kraken-atlas-ignore")
  };
}

export function scanOptionsFromConfiguration(configuration: KrakenAtlasConfiguration): Omit<ScanOptions, "maxFileSizeBytes" | "outputFolder"> {
  return {
    excludeDirectories: configuration.excludeDirectories,
    excludeGlobs: configuration.excludeGlobs,
    excludeExtensions: configuration.excludeExtensions,
    excludeFiles: configuration.excludeFiles,
    includeGlobs: configuration.includeGlobs,
    ignoreFile: configuration.ignoreFile
  };
}
