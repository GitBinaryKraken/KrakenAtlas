import * as assert from "assert";
import * as path from "path";
import test from "node:test";
import { analyzeVanillaWeb } from "../src/analyzers/webAnalyzer";
import { scanWorkspaceFiles } from "../src/scanner/fileScanner";

test("analyzeVanillaWeb composes JavaScript controller calls, injected history, and custom events", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const fixtureRoot = path.join(projectRoot, "test-fixtures", "javascript-controller-flow");
  const files = await scanWorkspaceFiles(fixtureRoot, { outputFolder: ".kraken-atlas" });
  const result = await analyzeVanillaWeb(fixtureRoot, files);

  const selectResult = result.symbols.find((item) => item.kind === "method" && item.name === "selectResult");
  const selectItem = result.symbols.find((item) => item.kind === "method" && item.name === "selectItem");
  const focusItem = result.symbols.find((item) => item.kind === "method" && item.name === "focusItem");
  assert.ok(selectResult && selectItem && focusItem);
  assert.ok(result.relationships.some((item) => item.type === "CALLS" && item.from === selectResult.id && item.to === selectItem.id));
  assert.ok(result.relationships.some((item) => item.type === "CALLS" && item.from === selectResult.id && item.to === focusItem.id));
  assert.ok(result.relationships.some((item) => item.type === "EMITS_EVENT" && item.from === selectItem.id && item.to === "event:javascript:selectionChange"));
  assert.ok(result.relationships.some((item) => item.type === "SUBSCRIBES_EVENT" && item.to === "event:javascript:selectionChange"));
  assert.ok(result.relationships.some((item) => item.type === "WRITES_BROWSER_HISTORY" && /historyLike\.pushState/u.test(item.evidence ?? "")));
  assert.ok(result.relationships.some((item) => item.type === "UPDATES_ELEMENT_STATE" && item.to.includes("search-result-card")));
});
