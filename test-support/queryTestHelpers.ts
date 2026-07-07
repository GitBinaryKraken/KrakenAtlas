import * as path from "path";
import { FileRecord } from "../src/model/records";

export function range() {
  return {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 1
  };
}

export function fileRecord(filePath: string): FileRecord {
  return {
    recordType: "file",
    id: `file:${filePath}`,
    path: filePath,
    extension: path.extname(filePath),
    language: filePath.endsWith(".json") ? "json" : "csharp",
    sizeBytes: 100,
    sha256: "a".repeat(64),
    modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
    isGenerated: false,
    tags: ["source"]
  };
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
