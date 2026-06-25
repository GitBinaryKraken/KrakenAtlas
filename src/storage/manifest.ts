import * as fs from "fs/promises";
import * as path from "path";
import { Manifest } from "../model/records";

export interface ManifestStats {
  fileCount: number;
  symbolCount?: number;
  relationshipCount?: number;
  patternCount?: number;
  findingCount?: number;
}

export function createManifest(workspaceRoot: string, stats: ManifestStats, generatedAt = new Date()): Manifest {
  const workspaceRootName = path.basename(workspaceRoot);

  return {
    schemaVersion: "0.1.0",
    generatedAt: generatedAt.toISOString(),
    workspaceName: workspaceRootName,
    workspaceRootName,
    generator: {
      name: "kraken-atlas",
      version: "0.1.0"
    },
    outputs: {
      files: "files.jsonl",
      symbols: "symbols.jsonl",
      references: "references.jsonl",
      relationships: "relationships.jsonl",
      patterns: "patterns.jsonl",
      findings: "findings.jsonl",
      project: "project.json",
      sqlite: "index.sqlite"
    },
    stats: {
      fileCount: stats.fileCount,
      symbolCount: stats.symbolCount ?? 0,
      relationshipCount: stats.relationshipCount ?? 0,
      patternCount: stats.patternCount ?? 0,
      findingCount: stats.findingCount ?? 0
    }
  };
}

export async function writeManifest(outputFolder: string, manifest: Manifest): Promise<void> {
  await fs.mkdir(outputFolder, { recursive: true });
  await fs.writeFile(path.join(outputFolder, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
