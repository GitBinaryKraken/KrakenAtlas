import * as assert from "assert";
import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { promisify } from "util";
import test from "node:test";

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
  assert.ok(packageJson.files.includes("README.md"));
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
  assert.ok(commands.includes("krakenAtlas.whereToAdd"));
  assert.ok(commands.includes("krakenAtlas.searchMap"));
  assert.ok(commands.includes("krakenAtlas.exportContextPack"));
  assert.ok(commands.includes("krakenAtlas.installAgentInstructions"));
  assert.ok(commands.includes("krakenAtlas.installWorkspaceCli"));
  assert.ok(commands.includes("krakenAtlas.openMapFolder"));
});

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
