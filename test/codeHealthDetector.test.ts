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

test("finding queries return scoped compact records from SQLite", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-finding-query-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const orphan = finding("finding:orphan:web", "orphan-callable", "Web/Service.cs", 12);
  const duplicate = finding("finding:duplicate:web", "duplicate-code-block", "Web/Other.cs", 30);
  const outside = finding("finding:orphan:admin", "orphan-callable", "Admin/Tool.cs", 8);
  await rebuildSqliteIndex(indexPath, { files: [], symbols: [], references: [], relationships: [], patterns: [], findings: [orphan, duplicate, outside] });
  const database = await openSqliteIndex(indexPath);
  try {
    const service = new QueryService(database, { projectContext: "Web" });
    const orphans = service.findOrphans();
    const duplicates = service.findDuplicates();
    assert.deepStrictEqual(orphans.files, ["Web/Service.cs"]);
    assert.ok(orphans.evidence.some((item) => item.recordType === "findingSummary"));
    assert.deepStrictEqual(duplicates.files, ["Web/Other.cs"]);
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

function finding(id: string, kind: FindingRecord["kind"], file: string, line: number): FindingRecord {
  return {
    recordType: "finding", id, kind, title: id, severity: "info", confidence: 0.9,
    summary: "Finding summary.", locations: [{ file, range: range(line, line + 3) }], evidence: [], caveats: []
  };
}

function range(startLine: number, endLine: number): SourceRange {
  return { startLine, startColumn: 1, endLine, endColumn: 1 };
}
