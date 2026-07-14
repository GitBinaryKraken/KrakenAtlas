import * as assert from "assert";
import test from "node:test";
import { FileRecord, RelationshipRecord, SymbolRecord } from "../src/model/records";
import { createProjectMetadata } from "../src/storage/projectMetadata";

test("createProjectMetadata summarizes languages, project types, and analyzer counts", () => {
  const files: FileRecord[] = [
    file("file:Program.cs", "Program.cs", ".cs", "csharp"),
    file("file:Controllers/UserController.cs", "Controllers/UserController.cs", ".cs", "csharp"),
    file("file:wwwroot/js/site.js", "wwwroot/js/site.js", ".js", "javascript"),
    file("file:Views/User/Edit.cshtml", "Views/User/Edit.cshtml", ".cshtml", "razor")
  ];
  const symbols: SymbolRecord[] = [
    {
      recordType: "symbol",
      id: "symbol:csharp:Example.UserController",
      name: "UserController",
      fullyQualifiedName: "Example.UserController",
      kind: "class",
      language: "csharp",
      file: "Controllers/UserController.cs",
      range: range(),
      patterns: ["aspnet-controller"],
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "route:csharp:Program.cs:10:/health",
      name: "/health",
      fullyQualifiedName: "/health",
      kind: "endpoint",
      language: "csharp",
      file: "Program.cs",
      range: range(),
      patterns: ["minimal-api-route"],
      confidence: 0.85
    }
  ];
  const relationships: RelationshipRecord[] = [
    {
      recordType: "relationship",
      id: "relationship:maps_route:test",
      from: "file:Program.cs",
      to: "route:csharp:Program.cs:10:/health",
      type: "MAPS_ROUTE",
      file: "Program.cs",
      range: range(),
      confidence: 0.85
    }
  ];

  const metadata = createProjectMetadata({
    workspaceRoot: "E:/Projects/Example",
    files,
    symbols,
    references: [],
    relationships,
    analyzerRuns: [
      {
        id: "roslyn",
        status: "completed",
        recordCounts: {
          symbols: symbols.length,
          references: 0,
          relationships: relationships.length
        }
      }
    ],
    generatedAt: new Date("2026-06-11T00:00:00.000Z")
  });

  assert.strictEqual(metadata.primaryLanguage, "csharp");
  assert.deepStrictEqual(
    metadata.languages.map((language) => [language.language, language.fileCount, language.primary]),
    [
      ["csharp", 2, true],
      ["javascript", 1, false],
      ["razor", 1, false]
    ]
  );
  assert.deepStrictEqual(metadata.projectTypes, ["aspnet-core", "csharp", "dotnet", "minimal-api", "razor", "vanilla-js"]);
  assert.strictEqual(metadata.recordCounts.files, 4);
  assert.strictEqual(metadata.recordCounts.symbols, 2);
  assert.strictEqual(metadata.analyzerRuns[0].id, "roslyn");
});

function file(id: string, filePath: string, extension: string, language: string): FileRecord {
  return {
    recordType: "file",
    id,
    path: filePath,
    extension,
    language,
    sizeBytes: 1,
    sha256: "a".repeat(64),
    modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
    isGenerated: false,
    tags: [language]
  };
}

function range() {
  return {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 1
  };
}
