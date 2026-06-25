import * as assert from "assert";
import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import test from "node:test";
import { FileRecord, SymbolRecord } from "../src/model/records";
import { rebuildSqliteIndex } from "../src/storage/sqliteIndex";
import { applyCliNextCommandOptions } from "../src/format/cliNextCommands";

const execFileAsync = promisify(execFile);

test("CLI help and version are discoverable", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const cliPath = path.join(projectRoot, "dist", "cli.js");
  const packageJson = JSON.parse(await fs.readFile(path.join(projectRoot, "package.json"), "utf8"));
  const escapedVersion = packageJson.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const help = await execFileAsync("node", [cliPath, "--help"], { cwd: projectRoot });
  const version = await execFileAsync("node", [cliPath, "--version"], { cwd: projectRoot });

  assert.match(help.stdout, new RegExp(`Kraken Atlas ${escapedVersion}`));
  assert.match(help.stdout, /kraken-atlas query <project\|symbol/);
  assert.match(help.stdout, /pattern-map\|hotspots\|flow/);
  assert.match(help.stdout, /duplicates\|drift/);
  assert.match(help.stdout, /kraken-atlas context \[flow\|where-to-add\|search/);
  assert.match(help.stdout, /kraken-atlas context where-to-add "requested change"/);
  assert.match(help.stdout, /json\|info\|md\|agent/);
  assert.match(help.stdout, /Use agent for compact token-saving output; info\/md for richer human-readable output/);
  assert.match(help.stdout, /Agent loop:/);
  assert.match(version.stdout, new RegExp(`kraken-atlas ${escapedVersion}`));
});

test("CLI resolves relative workspace paths to absolute output paths", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const cliPath = path.join(projectRoot, "dist", "cli.js");
  const result = await execFileAsync("node", [cliPath, "doctor", "--workspace", "test-fixtures/vanilla-web-simple", "--format", "json"], { cwd: projectRoot })
    .catch((error: { stdout: string }) => error);
  const parsed = JSON.parse(result.stdout);

  assert.ok(path.isAbsolute(parsed.outputFolder));
  assert.match(parsed.outputFolder, /vanilla-web-simple[\\/]\.kraken-atlas$/);
});

test("context-pack follow-ups retain workspace, context, and agent format", () => {
  const response = applyCliNextCommandOptions({
    query: "save user", answer: "Found.", confidence: 1,
    evidence: [], files: [], symbols: [], relationships: [], patterns: [], flow: [],
    nextQueries: ['kraken-atlas query relationships "Web/User.cs"'],
    estimatedContextSavings: "compact"
  }, { workspaceArg: ".", projectContext: "WebUI", format: "agent" });

  assert.strictEqual(response.nextQueries[0], 'kraken-atlas query relationships "Web/User.cs" --workspace . --context WebUI --format agent');
});

test("CLI ambiguous partial context exits cleanly with candidate contexts", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const cliPath = path.join(projectRoot, "dist", "cli.js");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-cli-context-"));
  const indexPath = path.join(workspaceRoot, ".kraken-atlas", "index.sqlite");
  const files: FileRecord[] = [
    fileRecord("AdminTools/AdminTools.csproj"),
    fileRecord("AdminApi/AdminApi.csproj")
  ];
  const symbols: SymbolRecord[] = [
    projectSymbol("AdminTools", "AdminTools/AdminTools.csproj"),
    projectSymbol("AdminApi", "AdminApi/AdminApi.csproj")
  ];
  await rebuildSqliteIndex(indexPath, { files, symbols, relationships: [], references: [], patterns: [] });

  const result = await execFileAsync("node", [
    cliPath,
    "query",
    "where-to-add",
    "save user",
    "--workspace",
    workspaceRoot,
    "--context",
    "Admin",
    "--format",
    "agent"
  ], { cwd: projectRoot });

  assert.match(result.stdout, /Ambiguous --context "Admin"/);
  assert.match(result.stdout, /Context: AdminTools/);
  assert.match(result.stdout, /Context: AdminApi/);
});

test("package bin points at compiled CLI", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const packageJson = JSON.parse(await fs.readFile(path.join(projectRoot, "package.json"), "utf8"));
  const binPath = path.join(projectRoot, packageJson.bin["kraken-atlas"]);

  assert.strictEqual(packageJson.bin["kraken-atlas"], "./dist/cli.js");
  assert.ok((await fs.readFile(binPath, "utf8")).startsWith("#!/usr/bin/env node"));
});

test("package files include runtime assets and exclude source/test folders", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const packageJson = JSON.parse(await fs.readFile(path.join(projectRoot, "package.json"), "utf8"));

  assert.ok(packageJson.files.includes("dist/**"));
  assert.ok(packageJson.files.includes("node_modules/sql.js/package.json"));
  assert.ok(packageJson.files.includes("node_modules/sql.js/dist/sql-wasm.js"));
  assert.ok(packageJson.files.includes("node_modules/sql.js/dist/sql-wasm.wasm"));
  assert.ok(packageJson.files.includes("analyzers/dotnet/KrakenAtlas.RoslynAnalyzer/*.csproj"));
  assert.ok(packageJson.files.includes("analyzers/dotnet/KrakenAtlas.RoslynAnalyzer/*.cs"));
  assert.ok(packageJson.files.includes("analyzers/dotnet/KrakenAtlas.RoslynAnalyzer/publish/**"));
  assert.ok(packageJson.files.includes("AGENT_SKILL.md"));
  assert.ok(packageJson.files.includes("ALPHA_FEEDBACK.md"));
  assert.ok(packageJson.files.includes("README.md"));
  assert.ok(packageJson.files.includes("CHANGELOG.md"));
  assert.ok(packageJson.files.includes("GETTING_STARTED.md"));
  assert.ok(!packageJson.files.includes("src/**"));
  assert.ok(!packageJson.files.includes("test/**"));
  assert.strictEqual(await exists(path.join(projectRoot, ".vscodeignore")), false);
  assert.match(packageJson.scripts["package:vsix"], /vsce-package\.cjs package/);
  assert.match(packageJson.scripts["check:vsix"], /publish:analyzer/);

  const commands = packageJson.contributes.commands.map((command: { command: string }) => command.command);
  assert.deepStrictEqual(packageJson.categories, ["Machine Learning", "Programming Languages", "Other"]);
  assert.ok(packageJson.keywords.includes("ai-agent"));
  assert.ok(packageJson.keywords.includes("context-reduction"));
  assert.ok(packageJson.keywords.includes("token-reduction"));
  assert.ok(packageJson.keywords.includes("dotnet"));
  assert.ok(packageJson.keywords.includes("where-to-add"));
  assert.ok(commands.includes("krakenAtlas.rebuildIndex"));
  assert.ok(commands.includes("krakenAtlas.updateIndex"));
  assert.ok(commands.includes("krakenAtlas.doctor"));
  assert.ok(commands.includes("krakenAtlas.showProject"));
  assert.ok(commands.includes("krakenAtlas.queryFlow"));
  assert.ok(commands.includes("krakenAtlas.querySymbol"));
  assert.ok(commands.includes("krakenAtlas.queryReferences"));
  assert.ok(commands.includes("krakenAtlas.queryRelationships"));
  assert.ok(commands.includes("krakenAtlas.queryPattern"));
  assert.ok(commands.includes("krakenAtlas.queryPatternMap"));
  assert.ok(commands.includes("krakenAtlas.queryHotspots"));
  assert.ok(commands.includes("krakenAtlas.findOrphans"));
  assert.ok(commands.includes("krakenAtlas.findDuplicates"));
  assert.ok(commands.includes("krakenAtlas.findDrift"));
  assert.ok(commands.includes("krakenAtlas.whereToAdd"));
  assert.ok(commands.includes("krakenAtlas.searchMap"));
  assert.ok(commands.includes("krakenAtlas.exportContextPack"));
  assert.ok(commands.includes("krakenAtlas.installAgentInstructions"));
  assert.ok(commands.includes("krakenAtlas.installWorkspaceCli"));
  assert.ok(commands.includes("krakenAtlas.installAiAgentSetup"));
  assert.ok(commands.includes("krakenAtlas.openMapFolder"));

  const languageModelTools = packageJson.contributes.languageModelTools.map((tool: { name: string }) => tool.name);
  assert.ok(languageModelTools.includes("kraken_atlas_doctor"));
  assert.ok(languageModelTools.includes("kraken_atlas_query"));
  assert.ok(languageModelTools.includes("kraken_atlas_context_pack"));
  assert.match(
    packageJson.contributes.languageModelTools.find((tool: { name: string }) => tool.name === "kraken_atlas_query").modelDescription,
    /where-to-add/
  );
  assert.match(
    packageJson.contributes.languageModelTools.find((tool: { name: string }) => tool.name === "kraken_atlas_query").modelDescription,
    /hotspots/
  );
  assert.match(
    packageJson.contributes.languageModelTools.find((tool: { name: string }) => tool.name === "kraken_atlas_query").modelDescription,
    /drift/
  );
  assert.match(
    packageJson.contributes.languageModelTools.find((tool: { name: string }) => tool.name === "kraken_atlas_query").modelDescription,
    /orphans.*duplicates/
  );
});

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function fileRecord(filePath: string): FileRecord {
  return {
    recordType: "file",
    id: `file:${filePath}`,
    path: filePath,
    extension: path.extname(filePath),
    language: "xml",
    sizeBytes: 100,
    sha256: "a".repeat(64),
    modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
    isGenerated: false,
    tags: ["dotnet-project"]
  };
}

function projectSymbol(name: string, filePath: string): SymbolRecord {
  return {
    recordType: "symbol",
    id: `symbol:dotnet-project:${filePath}`,
    name,
    fullyQualifiedName: filePath,
    kind: "project",
    language: "csharp",
    file: filePath,
    range: {
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1
    },
    confidence: 0.95
  };
}
