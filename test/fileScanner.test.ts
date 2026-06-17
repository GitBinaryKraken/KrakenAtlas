import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import { scanWorkspace, scanWorkspaceFiles } from "../src/scanner/fileScanner";

test("scanWorkspaceFiles records source files and skips ignored/sensitive files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-"));

  await fs.mkdir(path.join(root, "Controllers"), { recursive: true });
  await fs.mkdir(path.join(root, "wwwroot", "js"), { recursive: true });
  await fs.mkdir(path.join(root, "node_modules", "package"), { recursive: true });
  await fs.mkdir(path.join(root, ".kraken-atlas"), { recursive: true });
  await fs.mkdir(path.join(root, "graphify-out"), { recursive: true });
  await fs.mkdir(path.join(root, "artifacts"), { recursive: true });
  await fs.mkdir(path.join(root, "Sandbox"), { recursive: true });
  await fs.mkdir(path.join(root, "Sandbox_old"), { recursive: true });
  await fs.mkdir(path.join(root, "Properties", "PublishProfiles"), { recursive: true });

  await fs.writeFile(path.join(root, "Controllers", "HomeController.cs"), "public class HomeController {}", "utf8");
  await fs.writeFile(path.join(root, "wwwroot", "js", "site.js"), "function init() {}", "utf8");
  await fs.writeFile(path.join(root, ".env"), "SECRET=true", "utf8");
  await fs.writeFile(path.join(root, "node_modules", "package", "index.js"), "module.exports = {}", "utf8");
  await fs.writeFile(path.join(root, ".kraken-atlas", "old.jsonl"), "{}", "utf8");
  await fs.writeFile(path.join(root, "graphify-out", "graph.json"), "{}", "utf8");
  await fs.writeFile(path.join(root, "artifacts", "generated.js"), "function generated() {}", "utf8");
  await fs.writeFile(path.join(root, "Sandbox", "old-test.js"), "function oldTest() {}", "utf8");
  await fs.writeFile(path.join(root, "Sandbox_old", "legacy.cs"), "public class Legacy {}", "utf8");
  await fs.writeFile(path.join(root, "Properties", "PublishProfiles", "FolderProfile.pubxml"), "<Project />", "utf8");
  await fs.writeFile(path.join(root, "wwwroot", "js", "site.min.js"), "function minified(){}", "utf8");
  await fs.writeFile(path.join(root, "wwwroot", "js", "site.js.map"), "{}", "utf8");

  const scan = await scanWorkspace(root);
  const records = scan.files;
  const paths = records.map((record) => record.path);

  assert.deepStrictEqual(paths, ["Controllers/HomeController.cs", "wwwroot/js/site.js"]);
  assert.ok(scan.summary.excludedFiles >= 8);
  assert.strictEqual(records[0].recordType, "file");
  assert.strictEqual(records[0].language, "csharp");
  assert.match(records[0].sha256, /^[a-f0-9]{64}$/);
  assert.ok(records[0].tags.includes("controller"));
  assert.ok(records[1].tags.includes("static-asset"));
});

test("scanWorkspace supports ignore file rules and explicit includes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-ignore-"));
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.mkdir(path.join(root, "scratch"), { recursive: true });
  await fs.mkdir(path.join(root, "docs", "archive"), { recursive: true });
  await fs.mkdir(path.join(root, "wwwroot", "vendor"), { recursive: true });
  await fs.mkdir(path.join(root, "Sandbox"), { recursive: true });

  await fs.writeFile(path.join(root, ".kraken-atlas-ignore"), [
    "# Kraken ignore rules",
    "scratch/",
    "docs/archive/*.md",
    "*.bak",
    "wwwroot/vendor/large-lib.js",
    "!Sandbox/keep.cs"
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(root, "src", "App.cs"), "public class App {}", "utf8");
  await fs.writeFile(path.join(root, "src", "notes.bak"), "backup", "utf8");
  await fs.writeFile(path.join(root, "scratch", "Prototype.cs"), "public class Prototype {}", "utf8");
  await fs.writeFile(path.join(root, "docs", "archive", "old.md"), "# old", "utf8");
  await fs.writeFile(path.join(root, "wwwroot", "vendor", "large-lib.js"), "function vendor() {}", "utf8");
  await fs.writeFile(path.join(root, "Sandbox", "keep.cs"), "public class Keep {}", "utf8");
  await fs.writeFile(path.join(root, "Sandbox", "drop.cs"), "public class Drop {}", "utf8");

  const records = await scanWorkspaceFiles(root, {
    excludeExtensions: [".bak"]
  });

  assert.deepStrictEqual(records.map((record) => record.path), [
    "Sandbox/keep.cs",
    "src/App.cs"
  ]);
});
