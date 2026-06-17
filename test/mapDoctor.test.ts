import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import { inspectMap } from "../src/doctor/mapDoctor";
import { rebuildProject } from "../src/rebuild/rebuildProject";

test("inspectMap reports missing map outputs before rebuild", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-doctor-missing-"));
  await fs.writeFile(path.join(workspaceRoot, "index.html"), "<button id=\"save-user\"></button>", "utf8");

  const result = await inspectMap({
    extensionPath: projectRoot,
    workspaceRoot
  });

  assert.strictEqual(result.status, "missing");
  assert.ok(result.missingOutputs.includes("index.sqlite"));
  assert.deepStrictEqual(result.remediationCommands, ["kraken-atlas rebuild --workspace ."]);
});

test("inspectMap reports ready and stale map states", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const sourceFixture = path.join(projectRoot, "test-fixtures", "vanilla-web-simple");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-doctor-"));
  await copyDirectory(sourceFixture, workspaceRoot);

  await rebuildProject({
    extensionPath: projectRoot,
    workspaceRoot
  });

  const ready = await inspectMap({
    extensionPath: projectRoot,
    workspaceRoot
  });

  assert.strictEqual(ready.status, "ready");
  assert.deepStrictEqual(ready.changedFiles, []);

  await fs.appendFile(path.join(workspaceRoot, "wwwroot", "js", "user-form.js"), "\nfetch(\"/api/users/audit\");\n", "utf8");

  const stale = await inspectMap({
    extensionPath: projectRoot,
    workspaceRoot
  });

  assert.strictEqual(stale.status, "stale");
  assert.deepStrictEqual(stale.changedFiles, ["wwwroot/js/user-form.js"]);
  assert.deepStrictEqual(stale.remediationCommands, ["kraken-atlas update --workspace ."]);
});

test("rebuildProject records analyzer failure diagnostics and doctor reports degraded map", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-doctor-degraded-workspace-"));
  const extensionRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-doctor-degraded-extension-"));
  const analyzerRoot = path.join(extensionRoot, "analyzers", "dotnet", "KrakenAtlas.RoslynAnalyzer");
  await fs.mkdir(analyzerRoot, { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, "Program.cs"), "public sealed class Program { }\n", "utf8");
  await fs.writeFile(path.join(analyzerRoot, "KrakenAtlas.RoslynAnalyzer.csproj"), "<Project><PropertyGroup><TargetFramework>net9.0</TargetFramework></PropertyGroup>", "utf8");

  const rebuild = await rebuildProject({
    extensionPath: extensionRoot,
    workspaceRoot
  });

  assert.strictEqual(rebuild.analyzerRuns.find((run) => run.id === "roslyn")?.status, "failed");
  assert.strictEqual(await exists(path.join(workspaceRoot, ".kraken-atlas", "project.json")), true);

  const result = await inspectMap({
    extensionPath: extensionRoot,
    workspaceRoot
  });

  assert.strictEqual(result.status, "degraded");
  assert.strictEqual(result.failedAnalyzerRuns[0].id, "roslyn");
  assert.strictEqual(result.failedAnalyzerRuns[0].diagnosticCategory, "input");
  assert.match(result.failedAnalyzerRuns[0].diagnosticLabel ?? "", /project\/input/i);
  assert.match(result.failedAnalyzerRuns[0].message ?? "", /C# analyzer failed/);
  assert.ok(result.remediationCommands.includes("kraken-atlas rebuild --workspace . --format agent"));
});

test("inspectMap warns when one indexed folder dominates the corpus", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-doctor-corpus-"));
  await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, "ScratchGenerated"), { recursive: true });

  await fs.writeFile(path.join(workspaceRoot, "src", "App.cs"), "public class App {}", "utf8");
  for (let index = 0; index < 8; index += 1) {
    await fs.writeFile(path.join(workspaceRoot, "ScratchGenerated", `Generated${index}.js`), `function generated${index}() {}`, "utf8");
  }

  await rebuildProject({
    extensionPath: projectRoot,
    workspaceRoot
  });

  const result = await inspectMap({
    extensionPath: projectRoot,
    workspaceRoot
  });

  assert.strictEqual(result.status, "ready");
  assert.ok(result.corpusWarnings.some((warning) => warning.includes("ScratchGenerated") && warning.includes("indexed files")));
});

async function copyDirectory(source: string, destination: string): Promise<void> {
  await fs.mkdir(destination, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.name === ".kraken-atlas") {
      continue;
    }

    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
