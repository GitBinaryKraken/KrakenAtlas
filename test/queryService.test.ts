import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import type { FileRecord, ReferenceRecord, RelationshipRecord, SymbolRecord } from "../src/model/records";
import { QueryService } from "../src/query/queryService";
import { openSqliteIndex, rebuildSqliteIndex } from "../src/storage/sqliteIndex";

test("QueryService answers direct C# symbol, reference, and relationship queries", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-query-core-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const interfaceId = "symbol:csharp:Core.IUserService";
  const methodId = "symbol:csharp:Core.IUserService.GetUser(Guid)";
  const callerId = "symbol:csharp:Web.UserController.GetUser(Guid)";
  const files: FileRecord[] = [file("Core/IUserService.cs"), file("Web/UserController.cs")];
  const symbols: SymbolRecord[] = [
    symbol(interfaceId, "IUserService", "interface", "Core/IUserService.cs"),
    symbol(methodId, "GetUser", "method", "Core/IUserService.cs"),
    symbol(callerId, "GetUser", "method", "Web/UserController.cs")
  ];
  const references: ReferenceRecord[] = [{
    recordType: "reference",
    id: "reference:csharp:web-get-user",
    symbolName: "GetUser",
    resolvedSymbolId: methodId,
    file: "Web/UserController.cs",
    range: range(15),
    context: "call",
    snippet: "service.GetUser(id)",
    confidence: 0.98
  }];
  const relationships: RelationshipRecord[] = [{
    recordType: "relationship",
    id: "relationship:calls:get-user",
    from: callerId,
    to: methodId,
    type: "CALLS",
    file: "Web/UserController.cs",
    range: range(15),
    evidence: "service.GetUser(id)",
    confidence: 0.98
  }];

  await rebuildSqliteIndex(indexPath, { files, symbols, references, relationships });
  const database = await openSqliteIndex(indexPath);
  try {
    const service = new QueryService(database);
    const symbolResult = service.findSymbols("IUserService");
    const referenceResult = service.findReferences(methodId);
    const relationshipResult = service.findRelationships(methodId, { edgeTypes: ["CALLS"] });

    assert.ok(symbolResult.symbols.includes(interfaceId));
    assert.ok(referenceResult.evidence.some((item) => item.recordType === "reference" && item.file === "Web/UserController.cs"));
    assert.ok(relationshipResult.relationships.some((edge) => edge.type === "CALLS" && edge.from === callerId));
    assert.ok(relationshipResult.evidence.some((item) => item.recordType === "relationshipFilter"));
  } finally {
    database.close();
  }
});

function file(filePath: string): FileRecord {
  return {
    recordType: "file", id: `file:${filePath}`, path: filePath, extension: ".cs", language: "csharp",
    sizeBytes: 100, sha256: "a".repeat(64), modifiedTimeUtc: "2026-07-13T00:00:00.000Z", isGenerated: false, tags: ["source"]
  };
}

function symbol(id: string, name: string, kind: string, filePath: string): SymbolRecord {
  return {
    recordType: "symbol", id, name, fullyQualifiedName: id.slice("symbol:csharp:".length), kind,
    language: "csharp", file: filePath, range: range(1), confidence: 1
  };
}

function range(line: number) {
  return { startLine: line, startColumn: 1, endLine: line, endColumn: 20 };
}
