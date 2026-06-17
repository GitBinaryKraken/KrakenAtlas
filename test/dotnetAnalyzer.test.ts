import * as assert from "assert";
import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("Roslyn analyzer emits symbols and relationship records for .NET fixture", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const analyzerProject = path.join(
    projectRoot,
    "analyzers",
    "dotnet",
    "KrakenAtlas.RoslynAnalyzer",
    "KrakenAtlas.RoslynAnalyzer.csproj"
  );
  const fixtureRoot = path.join(projectRoot, "test-fixtures", "dotnet-simple");
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-roslyn-"));

  await execFileAsync("dotnet", ["build", analyzerProject], { cwd: projectRoot });
  await execFileAsync("dotnet", ["run", "--project", analyzerProject, "--no-build", "--", fixtureRoot, "--output", outputRoot], {
    cwd: projectRoot
  });

  const symbols = await readJsonl(path.join(outputRoot, "symbols.jsonl"));
  const references = await readJsonl(path.join(outputRoot, "references.jsonl"));
  const relationships = await readJsonl(path.join(outputRoot, "relationships.jsonl"));

  assert.ok(symbols.some((symbol) => symbol.id === "symbol:csharp:DotnetSimple.Services.IUserService"));
  assert.ok(symbols.some((symbol) => symbol.id === "symbol:csharp:DotnetSimple.Services.UserService"));
  assert.ok(symbols.some((symbol) => symbol.kind === "route" && symbol.file === "Controllers/UserController.cs"));
  assert.ok(symbols.some((symbol) => symbol.kind === "endpoint" && symbol.name === "/health"));
  assert.ok(symbols.some((symbol) => symbol.id === "symbol:csharp:DotnetSimple.Services.UserProfile"));

  assert.ok(
    references.some(
      (reference) =>
        reference.context === "constructor-parameter" &&
        reference.resolvedSymbolId === "symbol:csharp:DotnetSimple.Services.IUserService"
    )
  );

  assert.ok(
    relationships.some(
      (relationship) =>
        relationship.type === "IMPLEMENTS" &&
        relationship.from === "symbol:csharp:DotnetSimple.Services.UserService" &&
        relationship.to === "symbol:csharp:DotnetSimple.Services.IUserService"
    )
  );
  assert.ok(
    relationships.some(
      (relationship) =>
        relationship.type === "INJECTS" &&
        relationship.from === "symbol:csharp:DotnetSimple.Controllers.UserController" &&
        relationship.to === "symbol:csharp:DotnetSimple.Services.IUserService"
    )
  );
  assert.ok(
    relationships.some(
      (relationship) =>
        relationship.type === "REGISTERS" &&
        relationship.from === "symbol:csharp:DotnetSimple.Services.UserService" &&
        relationship.to === "symbol:csharp:DotnetSimple.Services.IUserService"
    )
  );
  assert.ok(relationships.some((relationship) => relationship.type === "MAPS_ROUTE"));
  assert.ok(
    relationships.some(
      (relationship) =>
        relationship.type === "CALLS" &&
        relationship.from === "symbol:csharp:DotnetSimple.Controllers.UserController.GetUser(Guid)" &&
        relationship.to === "symbol:csharp:DotnetSimple.Services.IUserService.GetUser(Guid)"
    )
  );
  assert.ok(
    relationships.some(
      (relationship) =>
        relationship.type === "RETURNS_TYPE" &&
        relationship.from === "symbol:csharp:DotnetSimple.Controllers.UserController.GetUser(Guid)" &&
        relationship.to === "symbol:csharp:DotnetSimple.Services.UserProfile"
    )
  );
  assert.ok(
    relationships.some(
      (relationship) =>
        relationship.type === "USES_CONFIG" &&
        relationship.to === "config:csharp:Users"
    )
  );
  assert.ok(
    relationships.some(
      (relationship) =>
        relationship.type === "USES_CONFIG_KEY" &&
        relationship.to === "config:csharp:Users"
    )
  );
  assert.ok(
    relationships.some(
      (relationship) =>
        relationship.type === "BINDS_OPTIONS" &&
        relationship.from === "config:csharp:Users" &&
        relationship.to === "symbol:csharp:UserOptions"
    )
  );
});

async function readJsonl(filePath: string): Promise<Array<Record<string, any>>> {
  const content = await fs.readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
