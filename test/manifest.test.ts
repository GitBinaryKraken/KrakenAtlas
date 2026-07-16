import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";

test("preserves the published identity and exposes the bounded semantic command set", () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")) as {
    name: string;
    publisher: string;
    version: string;
    activationEvents: string[];
    files: string[];
    contributes: {
      commands: Array<{ command: string }>;
      languageModelTools?: unknown[];
      mcpServerDefinitionProviders?: Array<{ id: string; label: string }>;
    };
    engines: { vscode: string };
  };

  assert.equal(manifest.name, "kraken-atlas");
  assert.equal(manifest.publisher, "BinaryKraken");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  const analyzerVersions = fs.readFileSync(path.resolve(
    process.cwd(), "cartographer", "KrakenAtlas.Core", "AtlasAnalyzerVersions.cs"
  ), "utf8");
  assert.match(analyzerVersions, new RegExp(`ReleaseVersion = "${manifest.version.replace(/\./g, "\\.")}"`));
  assert.deepEqual(manifest.contributes.commands.map((item) => item.command), [
    "krakenAtlas.showStatus",
    "krakenAtlas.showHealth",
    "krakenAtlas.buildAtlas",
    "krakenAtlas.showAtlasSummary",
    "krakenAtlas.showWorkspaceOrientation",
    "krakenAtlas.lookupEntity",
    "krakenAtlas.searchSymbols",
    "krakenAtlas.searchEntities",
    "krakenAtlas.findUsages",
    "krakenAtlas.showRelations",
    "krakenAtlas.traceRoute",
    "krakenAtlas.showChangeSurface",
    "krakenAtlas.projectGitChanges",
    "krakenAtlas.prepareChange",
    "krakenAtlas.showAssessments",
    "krakenAtlas.applyDecorations",
    "krakenAtlas.restartCartographer",
    "krakenAtlas.exportDiagnostics",
    "krakenAtlas.setupAgent",
    "krakenAtlas.copyMcpConfiguration",
    "krakenAtlas.openPlanning"
  ]);
  assert.equal(manifest.contributes.languageModelTools, undefined);
  assert.deepEqual(manifest.contributes.mcpServerDefinitionProviders, [{
    id: "krakenAtlas.cartographer",
    label: "Kraken Atlas"
  }]);
  assert.equal(manifest.engines.vscode, "^1.105.0");
  assert.ok(manifest.activationEvents.includes("onStartupFinished"));
  assert.ok(manifest.activationEvents.includes("onCommand:krakenAtlas.exportDiagnostics"));
  assert.ok(manifest.activationEvents.includes("onCommand:krakenAtlas.showHealth"));
  assert.ok(manifest.activationEvents.includes("onCommand:krakenAtlas.installAgentInstructions"));
  assert.ok(manifest.activationEvents.includes("onCommand:krakenAtlas.setupAgent"));
  assert.ok(manifest.activationEvents.includes("onCommand:krakenAtlas.copyMcpConfiguration"));
  assert.ok(manifest.files.includes("ALPHA_TESTING.md"));
  assert.ok(manifest.files.includes("PRIVACY.md"));
});
