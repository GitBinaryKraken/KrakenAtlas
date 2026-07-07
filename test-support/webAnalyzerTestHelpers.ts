import * as fs from "fs/promises";
import { SymbolRecord } from "../src/model/records";

export function csharpSymbol(id: string, name: string, fullyQualifiedName: string, kind: string, file: string): SymbolRecord {
  return {
    recordType: "symbol",
    id,
    name,
    fullyQualifiedName,
    kind,
    language: "csharp",
    file,
    range: testRange(),
    confidence: 1
  };
}

export function testRange() {
  return { startLine: 1, startColumn: 1, endLine: 1, endColumn: 10 };
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
