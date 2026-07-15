import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";

test("preserves the published identity and exposes only Phase 1 commands", () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")) as {
    name: string;
    publisher: string;
    version: string;
    contributes: {
      commands: Array<{ command: string }>;
      languageModelTools?: unknown[];
    };
  };

  assert.equal(manifest.name, "kraken-atlas");
  assert.equal(manifest.publisher, "BinaryKraken");
  assert.equal(manifest.version, "0.3.0");
  assert.deepEqual(manifest.contributes.commands.map((item) => item.command), [
    "krakenAtlas.showStatus",
    "krakenAtlas.buildAtlas",
    "krakenAtlas.showAtlasSummary",
    "krakenAtlas.lookupEntity",
    "krakenAtlas.restartCartographer",
    "krakenAtlas.openPlanning"
  ]);
  assert.equal(manifest.contributes.languageModelTools, undefined);
});
