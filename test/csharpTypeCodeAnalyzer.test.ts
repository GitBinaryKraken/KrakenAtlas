import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import { analyzeCSharpTypeCodeContracts } from "../src/analyzers/csharpTypeCodeAnalyzer";
import { QueryService } from "../src/query/queryService";
import { scanWorkspaceFiles } from "../src/scanner/fileScanner";
import { openSqliteIndex, rebuildSqliteIndex } from "../src/storage/sqliteIndex";

test("C# type-code analyzer maps enum members to exact type-code value nodes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-csharp-type-code-"));
  await fs.mkdir(path.join(root, "KelpApiDomain", "ViewModels", "Persona"), { recursive: true });
  await fs.writeFile(path.join(root, "KelpApiDomain", "ViewModels", "Persona", "PersonaDetailTypeCode.cs"), `
namespace KelpApiDomain.ViewModels.Persona
{
    public enum PersonaDetailTypeCode
    {
        Birthday = 7101,
        Occupation = 7102
    }
}
`, "utf8");

  const files = await scanWorkspaceFiles(root, { outputFolder: ".kraken-atlas" });
  const result = await analyzeCSharpTypeCodeContracts(root, files);

  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:csharp:KelpApiDomain.ViewModels.Persona.PersonaDetailTypeCode.Birthday" &&
    symbol.kind === "enum-member" &&
    symbol.summary?.includes("7101")
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "type-code:7101" &&
    symbol.kind === "typeCodeValue"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "HAS_TYPE_CODE_MEMBER" &&
    relationship.from === "symbol:csharp:KelpApiDomain.ViewModels.Persona.PersonaDetailTypeCode" &&
    relationship.to === "symbol:csharp:KelpApiDomain.ViewModels.Persona.PersonaDetailTypeCode.Birthday"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DEFINES_TYPE_CODE" &&
    relationship.from === "symbol:csharp:KelpApiDomain.ViewModels.Persona.PersonaDetailTypeCode.Birthday" &&
    relationship.to === "type-code:7101"
  ));

  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  await rebuildSqliteIndex(indexPath, { files, symbols: result.symbols, relationships: result.relationships });
  const database = await openSqliteIndex(indexPath);
  try {
    const service = new QueryService(database);
    const response = service.findRelationships("type-code:7101", { limit: 10 });
    assert.ok(response.symbols.includes("type-code:7101"));
    assert.ok(response.relationships.some((relationship) =>
      relationship.type === "DEFINES_TYPE_CODE" &&
      relationship.from === "symbol:csharp:KelpApiDomain.ViewModels.Persona.PersonaDetailTypeCode.Birthday"
    ));

    const roleRows = selectRows(database, "SELECT role FROM node_roles WHERE node_id = ? ORDER BY role;", ["type-code:7101"]);
    const roles = roleRows.map((row) => String(row.role));
    assert.ok(roles.includes("type-code-value"));
  } finally {
    database.close();
  }
});

function selectRows(database: { prepare(sql: string): any }, sql: string, params: unknown[]): Array<Record<string, unknown>> {
  const statement = database.prepare(sql);
  try {
    statement.bind(params);
    const rows: Array<Record<string, unknown>> = [];
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
    return rows;
  } finally {
    statement.free();
  }
}
