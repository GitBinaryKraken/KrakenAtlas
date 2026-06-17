import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import { FileRecord } from "../src/model/records";
import { createProjectMetadata } from "../src/storage/projectMetadata";
import { openSqliteIndex, rebuildSqliteIndex } from "../src/storage/sqliteIndex";

test("rebuildSqliteIndex creates queryable files and search records", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-sqlite-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const files: FileRecord[] = [
    {
      recordType: "file",
      id: "file:Controllers/UserController.cs",
      path: "Controllers/UserController.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 42,
      sha256: "a".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["controller", "csharp", "source"]
    },
    {
      recordType: "file",
      id: "file:wwwroot/js/user-form.js",
      path: "wwwroot/js/user-form.js",
      extension: ".js",
      language: "javascript",
      sizeBytes: 21,
      sha256: "b".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["javascript", "source", "static-asset"]
    }
  ];
  const project = createProjectMetadata({
    workspaceRoot: root,
    files,
    symbols: [],
    references: [],
    relationships: [],
    patternsCount: 0,
    analyzerRuns: []
  });

  await rebuildSqliteIndex(indexPath, { files, project });

  const database = await openSqliteIndex(indexPath);
  try {
    const fileCount = database.exec("SELECT COUNT(*) AS count FROM files;")[0].values[0][0];
    const searchCount = database.exec("SELECT COUNT(*) AS count FROM code_search WHERE record_type = 'file';")[0].values[0][0];
    const controllerPath = database.exec("SELECT path FROM files WHERE language = 'csharp';")[0].values[0][0];
    const projectJson = database.exec("SELECT json FROM metadata WHERE key = 'project';")[0].values[0][0] as string;
    const projectMetadata = JSON.parse(projectJson);

    assert.strictEqual(fileCount, 2);
    assert.strictEqual(searchCount, 2);
    assert.strictEqual(controllerPath, "Controllers/UserController.cs");
    assert.strictEqual(projectMetadata.primaryLanguage, "csharp");
  } finally {
    database.close();
  }
});

test("rebuildSqliteIndex creates relationship graph indexes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-edges-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");

  await rebuildSqliteIndex(indexPath, {
    files: [],
    patterns: [
      {
        recordType: "pattern",
        id: "pattern:dotnet:constructor-injection",
        name: "Constructor injection",
        category: "dependency-management",
        language: "csharp",
        confidence: 0.55,
        frequency: 2,
        counterExampleCount: 0,
        instances: [],
        rulesObserved: ["Types receive dependencies through constructor parameters."],
        agentGuidance: "Prefer constructor injection."
      }
    ],
    relationships: [
      {
        recordType: "relationship",
        id: "relationship:implements:UserService:IUserService",
        from: "symbol:csharp:UserService",
        to: "symbol:csharp:IUserService",
        type: "IMPLEMENTS",
        file: "Services/UserService.cs",
        range: {
          startLine: 4,
          startColumn: 1,
          endLine: 4,
          endColumn: 42
        },
        evidence: "public class UserService : IUserService",
        confidence: 1
      }
    ]
  });

  const database = await openSqliteIndex(indexPath);
  try {
    const edge = database.exec("SELECT from_id, to_id, type FROM relationships WHERE to_id = 'symbol:csharp:IUserService';")[0].values[0];
    const pattern = database.exec("SELECT name FROM patterns WHERE id = 'pattern:dotnet:constructor-injection';")[0].values[0][0];
    const indexNames = database.exec("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'relationships' ORDER BY name;")[0].values.flat();

    assert.deepStrictEqual(edge, ["symbol:csharp:UserService", "symbol:csharp:IUserService", "IMPLEMENTS"]);
    assert.strictEqual(pattern, "Constructor injection");
    assert.ok(indexNames.includes("idx_relationships_from"));
    assert.ok(indexNames.includes("idx_relationships_to"));
    assert.ok(indexNames.includes("idx_relationships_type"));
  } finally {
    database.close();
  }
});
