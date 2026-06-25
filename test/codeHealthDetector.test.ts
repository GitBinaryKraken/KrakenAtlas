import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import { detectCodeHealthFindings } from "../src/findings/codeHealthDetector";
import type { FindingRecord, RelationshipRecord, SourceRange, SymbolRecord } from "../src/model/records";
import { QueryService } from "../src/query/queryService";
import { openSqliteIndex, rebuildSqliteIndex } from "../src/storage/sqliteIndex";

const duplicateBody = `
{
    var total = values.Sum();
    var count = values.Count;
    var average = count == 0 ? 0 : total / count;
    logger.LogInformation("Calculated {Average}", average);
    return average;
}`;

test("code-health detector finds conservative orphans and exact duplicate method bodies", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-findings-"));
  await fs.mkdir(path.join(root, "Services"), { recursive: true });
  await fs.writeFile(path.join(root, "Services", "First.cs"), `private decimal First(int[] values)${duplicateBody}\n`, "utf8");
  await fs.writeFile(path.join(root, "Services", "Second.cs"), `internal decimal Second(int[] values)${duplicateBody}\n`, "utf8");
  await fs.writeFile(path.join(root, "Services", "Used.cs"), "private void Used()\n{\n    Console.WriteLine(1);\n}\n", "utf8");

  const first = methodSymbol("symbol:csharp:Sample.First(int[])", "First", "Services/First.cs", "private", 9);
  const second = methodSymbol("symbol:csharp:Sample.Second(int[])", "Second", "Services/Second.cs", "internal", 9);
  const used = methodSymbol("symbol:csharp:Sample.Used()", "Used", "Services/Used.cs", "private", 4);
  const publicUnused = { ...methodSymbol("symbol:csharp:Sample.PublicUnused()", "PublicUnused", "Services/Used.cs", "public", 4), modifiers: ["public"] };
  const eventHandler = methodSymbol("symbol:csharp:Sample.button1_Click(object, System.EventArgs)", "button1_Click", "Services/Used.cs", "private", 4);
  const relationship: RelationshipRecord = {
    recordType: "relationship",
    id: "relationship:calls:used",
    from: "symbol:csharp:Sample.Caller()",
    to: used.id,
    type: "CALLS",
    file: "Services/Used.cs",
    range: range(1, 1),
    confidence: 1
  };

  const findings = await detectCodeHealthFindings({
    workspaceRoot: root,
    symbols: [first, second, used, publicUnused, eventHandler],
    references: [],
    relationships: [relationship]
  });

  assert.ok(findings.some((finding) => finding.kind === "orphan-callable" && finding.locations[0].symbolId === first.id));
  assert.ok(findings.some((finding) => finding.kind === "orphan-callable" && finding.locations[0].symbolId === second.id));
  assert.ok(!findings.some((finding) => finding.kind === "orphan-callable" && finding.locations[0].symbolId === used.id));
  assert.ok(!findings.some((finding) => finding.locations[0].symbolId === publicUnused.id));
  assert.ok(!findings.some((finding) => finding.locations[0].symbolId === eventHandler.id));
  const duplicate = findings.find((finding) => finding.kind === "duplicate-code-block");
  assert.strictEqual(duplicate?.locations.length, 2);
  assert.match(duplicate?.evidence.join(" ") ?? "", /comparison=exact-normalized-body/);
});

test("code-health detector flags controller data access when service delegation is established", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-drift-"));
  const relationships: RelationshipRecord[] = [
    relationship(
      "relationship:calls:controller-service",
      "symbol:csharp:Web.Controllers.UserController.Get()",
      "symbol:csharp:Web.Services.IUserService.GetUser()",
      "CALLS",
      "Web/Controllers/UserController.cs"
    ),
    relationship(
      "relationship:calls:controller-repository",
      "symbol:csharp:Web.Controllers.AdminController.Save()",
      "symbol:csharp:Web.Repositories.IUserRepository.Save()",
      "CALLS_REPOSITORY",
      "Web/Controllers/AdminController.cs"
    )
  ];

  const findings = await detectCodeHealthFindings({
    workspaceRoot: root,
    symbols: [],
    references: [],
    relationships
  });

  const drift = findings.find((finding) => finding.kind === "pattern-drift");
  assert.ok(drift);
  assert.match(drift.title, /Controller bypasses service-layer pattern/);
  assert.strictEqual(drift.locations[0].file, "Web/Controllers/AdminController.cs");
  assert.match(drift.evidence.join(" "), /edgeType=CALLS_REPOSITORY/);
});

test("code-health detector flags service data access when repository flow is established", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-service-drift-"));
  const relationships: RelationshipRecord[] = [
    relationship(
      "relationship:calls:service-repository",
      "symbol:csharp:Web.Services.UserService.Get()",
      "symbol:csharp:Web.Repositories.IUserRepository.Get()",
      "CALLS_REPOSITORY",
      "Web/Services/UserService.cs"
    ),
    relationship(
      "relationship:queries:repository-dbset",
      "symbol:csharp:Web.Repositories.UserRepository.Get()",
      "symbol:csharp:Web.Data.ApplicationDbContext.Users",
      "QUERIES",
      "Web/Repositories/UserRepository.cs"
    ),
    relationship(
      "relationship:queries:service-dbset",
      "symbol:csharp:Web.Services.LegacyUserService.Save()",
      "symbol:csharp:Web.Data.ApplicationDbContext.Users",
      "WRITES",
      "Web/Services/LegacyUserService.cs"
    )
  ];

  const findings = await detectCodeHealthFindings({
    workspaceRoot: root,
    symbols: [],
    references: [],
    relationships
  });

  const drift = findings.find((finding) => finding.kind === "pattern-drift" && finding.title === "Service bypasses repository data-flow pattern");
  assert.ok(drift);
  assert.strictEqual(drift.locations[0].file, "Web/Services/LegacyUserService.cs");
  assert.match(drift.evidence.join(" "), /pattern=repository-data-flow/);
  assert.match(drift.evidence.join(" "), /edgeType=WRITES/);
});

test("finding queries return scoped compact records from SQLite", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-finding-query-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const orphan = finding("finding:orphan:web", "orphan-callable", "Web/Service.cs", 12);
  const duplicate = finding("finding:duplicate:web", "duplicate-code-block", "Web/Other.cs", 30);
  const drift = finding("finding:drift:web", "pattern-drift", "Web/Controllers/AdminController.cs", 42);
  const outside = finding("finding:orphan:admin", "orphan-callable", "Admin/Tool.cs", 8);
  await rebuildSqliteIndex(indexPath, { files: [], symbols: [], references: [], relationships: [], patterns: [], findings: [orphan, duplicate, drift, outside] });
  const database = await openSqliteIndex(indexPath);
  try {
    const service = new QueryService(database, { projectContext: "Web" });
    const orphans = service.findOrphans();
    const duplicates = service.findDuplicates();
    const driftResult = service.findDrift();
    assert.deepStrictEqual(orphans.files, ["Web/Service.cs"]);
    assert.ok(orphans.evidence.some((item) => item.recordType === "findingSummary"));
    assert.deepStrictEqual(duplicates.files, ["Web/Other.cs"]);
    assert.deepStrictEqual(driftResult.files, ["Web/Controllers/AdminController.cs"]);
    assert.ok(driftResult.evidence.some((item) => item.recordType === "findingSummary" && item.kind === "pattern-drift"));
  } finally {
    database.close();
  }
});

function methodSymbol(id: string, name: string, file: string, modifier: string, endLine: number): SymbolRecord {
  return {
    recordType: "symbol", id, name, fullyQualifiedName: id.slice("symbol:csharp:".length), kind: "method",
    language: "csharp", file, range: range(1, endLine), modifiers: [modifier], confidence: 1
  };
}

function relationship(id: string, from: string, to: string, type: string, file: string): RelationshipRecord {
  return {
    recordType: "relationship", id, from, to, type, file, range: range(5, 5), confidence: 0.9
  };
}

function finding(id: string, kind: FindingRecord["kind"], file: string, line: number): FindingRecord {
  return {
    recordType: "finding", id, kind, title: id, severity: "info", confidence: 0.9,
    summary: "Finding summary.", locations: [{ file, range: range(line, line + 3) }], evidence: [], caveats: []
  };
}

function range(startLine: number, endLine: number): SourceRange {
  return { startLine, startColumn: 1, endLine, endColumn: 1 };
}
