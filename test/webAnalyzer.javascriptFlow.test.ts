import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import { analyzeVanillaWeb } from "../src/analyzers/webAnalyzer";
import { QueryService } from "../src/query/queryService";
import { scanWorkspaceFiles } from "../src/scanner/fileScanner";
import { openSqliteIndex, rebuildSqliteIndex } from "../src/storage/sqliteIndex";

test("analyzeVanillaWeb maps browser query-string state for agent queries", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const fixtureRoot = path.join(projectRoot, "test-fixtures", "browser-query-state");
  const files = await scanWorkspaceFiles(fixtureRoot, { outputFolder: ".kraken-atlas" });
  const result = await analyzeVanillaWeb(fixtureRoot, files);
  const scriptPath = "wwwroot/js/maps/kelp-map-explorer.js";

  assert.ok(result.relationships.some((relationship) => relationship.type === "READS_QUERY_STRING" && relationship.file === scriptPath));
  assert.ok(result.relationships.some((relationship) => relationship.type === "WRITES_BROWSER_HISTORY" && relationship.file === scriptPath));
  assert.ok(result.relationships.some((relationship) => relationship.type === "WRITES_QUERY_STRING" && relationship.file === scriptPath));

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-browser-query-state-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  await rebuildSqliteIndex(indexPath, {
    files,
    symbols: result.symbols,
    references: result.references,
    relationships: result.relationships,
    patterns: []
  });
  const database = await openSqliteIndex(indexPath);
  try {
    const service = new QueryService(database);
    const whereToAdd = service.whereToAdd("keep the map query string truthful when search filters change");
    const flow = service.findFlow("map filters update browser query string");

    assert.strictEqual(whereToAdd.files[0], scriptPath);
    assert.ok(whereToAdd.confidence >= 0.75 && whereToAdd.confidence <= 0.9);
    assert.ok(whereToAdd.relationships.some((relationship) => relationship.type === "READS_QUERY_STRING"));
    assert.ok(whereToAdd.relationships.some((relationship) => relationship.type === "WRITES_QUERY_STRING"));
    assert.ok(flow.files.includes(scriptPath));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "READS_QUERY_STRING"));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "WRITES_QUERY_STRING"));
  } finally {
    database.close();
  }
});

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
