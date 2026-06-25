import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import { analyzeVanillaWeb } from "../src/analyzers/webAnalyzer";
import { RelationshipRecord, SymbolRecord } from "../src/model/records";
import { QueryService } from "../src/query/queryService";
import { scanWorkspaceFiles } from "../src/scanner/fileScanner";
import { openSqliteIndex, rebuildSqliteIndex } from "../src/storage/sqliteIndex";

test("analyzeVanillaWeb emits symbols and relationships for HTML/Razor and vanilla JS", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const fixtureRoot = path.join(projectRoot, "test-fixtures", "vanilla-web-simple");
  const files = await scanWorkspaceFiles(fixtureRoot, { outputFolder: ".kraken-atlas" });
  const result = await analyzeVanillaWeb(fixtureRoot, files);

  assert.ok(result.symbols.some((symbol) => symbol.kind === "view" && symbol.file === "Views/User/Edit.cshtml"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "form" && symbol.name === "user-edit-form"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "input" && symbol.name === "user-name"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "function" && symbol.name === "saveUserForm"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "eventHandler" && symbol.name === "save-user:click"));

  assert.ok(
    result.references.some(
      (reference) =>
        reference.context === "script-src" &&
        reference.resolvedSymbolId === "symbol:javascript:wwwroot/js/user-form.js"
    )
  );

  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "LOADS_SCRIPT" &&
        relationship.from === "symbol:razor:Views/User/Edit.cshtml" &&
        relationship.to === "symbol:javascript:wwwroot/js/user-form.js"
    )
  );
  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "POSTS_TO" &&
        relationship.from === "symbol:razor:Views/User/Edit.cshtml:form:user-edit-form" &&
        relationship.to === "route:web:User.Save"
    )
  );
  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "SELECTS_ELEMENT" &&
        relationship.to === "symbol:razor:Views/User/Edit.cshtml:input:user-name"
    )
  );
  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "HANDLES_EVENT" &&
        relationship.from === "symbol:javascript:wwwroot/js/user-form.js:event:save-user:click" &&
        relationship.to === "symbol:razor:Views/User/Edit.cshtml:button:save-user"
    )
  );
  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "CALLS" &&
        relationship.from === "symbol:javascript:wwwroot/js/user-form.js" &&
        relationship.to === "route:web:/api/users"
    )
  );
});

test("analyzeVanillaWeb maps Razor Page forms to page-handler routes", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const fixtureRoot = path.join(projectRoot, "test-fixtures", "dotnet-feature-flow");
  const files = await scanWorkspaceFiles(fixtureRoot, { outputFolder: ".kraken-atlas" });
  const result = await analyzeVanillaWeb(fixtureRoot, files);

  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "POSTS_TO" &&
        relationship.from === "symbol:razor:Pages/Badges.cshtml:form:badge-form" &&
        relationship.to === "route:razor-page-handler:Badges.SaveLocationBadge"
    )
  );
});

test("analyzeVanillaWeb connects Razor carousel editor markup to inline JavaScript and view components", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const fixtureRoot = path.join(projectRoot, "test-fixtures", "razor-carousel-feature");
  const files = await scanWorkspaceFiles(fixtureRoot, { outputFolder: ".kraken-atlas" });
  const result = await analyzeVanillaWeb(fixtureRoot, files);

  assert.ok(
    result.symbols.some(
      (symbol) =>
        symbol.kind === "input" &&
        symbol.file === "Views/Shared/ComposableContent/_EditorShell.cshtml" &&
        symbol.name === "Parts[0].ConfigJson"
    )
  );
  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "SELECTS_ELEMENT" &&
        String(relationship.evidence).includes('[data-carousel-field="mediaSid"]') &&
        relationship.to.includes(":input:")
    )
  );
  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "WRITES_FIELD" &&
        String(relationship.evidence).includes("configInput.value") &&
        relationship.to === "symbol:razor:Views/Shared/ComposableContent/_EditorShell.cshtml:input:Parts_0_.ConfigJson"
    )
  );
  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "WRITES_FIELD" &&
        String(relationship.evidence).includes("writePartConfig(configInput") &&
        relationship.to === "symbol:razor:Views/Shared/ComposableContent/_EditorShell.cshtml:input:Parts_0_.ConfigJson"
    )
  );
  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "BINDS_MODEL_PROPERTY" &&
        relationship.from === "symbol:razor:Views/Shared/ComposableContent/_EditorShell.cshtml:input:Parts_0_.ConfigJson" &&
        relationship.to === "model-binding:Parts[].ConfigJson"
    )
  );
  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "USES_CSHARP_SYMBOL" &&
        relationship.from === "symbol:razor:Views/Shared/ComposableContent/_EditorShell.cshtml" &&
        relationship.to === "symbol:csharp:PageMediaBlockConfig.FromJson"
    )
  );
  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "INVOKES_VIEW_COMPONENT" &&
        relationship.to === "symbol:csharp:CarouselViewComponent"
    )
  );
  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "RENDERS_VIEW" &&
        relationship.from === "symbol:csharp:CarouselViewComponent" &&
        relationship.to === "file:Views/Shared/Components/Carousel/Default.cshtml"
    )
  );
});

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

test("Razor injection resolves interfaces and supports direct reverse-reference queries", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const fixtureRoot = path.join(projectRoot, "test-fixtures", "razor-injection");
  const files = await scanWorkspaceFiles(fixtureRoot, { outputFolder: ".kraken-atlas" });
  const interfaceId = "symbol:csharp:App.Services.ITranslationService";
  const interfaceMethodId = "symbol:csharp:App.Services.ITranslationService.GetTranslation(string, string)";
  const implementationId = "symbol:csharp:App.Services.TranslationService";
  const csharpSymbols: SymbolRecord[] = [
    csharpSymbol(interfaceId, "ITranslationService", "App.Services.ITranslationService", "interface", "Services/ITranslationService.cs"),
    csharpSymbol(interfaceMethodId, "GetTranslation", "App.Services.ITranslationService.GetTranslation(string, string)", "method", "Services/ITranslationService.cs"),
    csharpSymbol(implementationId, "TranslationService", "App.Services.TranslationService", "class", "Services/TranslationService.cs")
  ];
  const result = await analyzeVanillaWeb(fixtureRoot, files, csharpSymbols);
  const viewPath = "Views/Shared/_Layout.cshtml";

  assert.ok(result.symbols.some((symbol) => symbol.kind === "injectedService" && symbol.name === "TranslationService"));
  assert.ok(result.references.some((reference) => reference.context === "razor-inject" && reference.resolvedSymbolId === interfaceId));
  assert.ok(result.references.some((reference) => reference.context === "razor-injected-call" && reference.resolvedSymbolId === interfaceMethodId));
  assert.ok(result.relationships.some((relationship) => relationship.type === "RAZOR_INJECTS" && relationship.to === interfaceId));
  assert.ok(result.relationships.some((relationship) => relationship.type === "CALLS_INJECTED_SERVICE" && relationship.to === interfaceMethodId));

  const structuralRelationships: RelationshipRecord[] = [
    {
      recordType: "relationship",
      id: "relationship:implements:translation",
      from: implementationId,
      to: interfaceId,
      type: "IMPLEMENTS",
      file: "Services/TranslationService.cs",
      range: testRange(),
      evidence: "ITranslationService",
      confidence: 0.95
    },
    {
      recordType: "relationship",
      id: "relationship:registers:translation",
      from: implementationId,
      to: interfaceId,
      type: "REGISTERS",
      file: "Program.cs",
      range: testRange(),
      evidence: "AddScoped<ITranslationService, TranslationService>()",
      confidence: 0.95
    }
  ];
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-razor-injection-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  await rebuildSqliteIndex(indexPath, {
    files,
    symbols: [...csharpSymbols, ...result.symbols],
    references: result.references,
    relationships: [...structuralRelationships, ...result.relationships],
    patterns: []
  });
  const database = await openSqliteIndex(indexPath);
  try {
    const references = new QueryService(database).findReferences("ITranslationService");
    assert.ok(references.files.includes(viewPath));
    assert.ok(references.files.includes("Services/TranslationService.cs"));
    assert.ok(references.files.includes("Program.cs"));
    assert.ok(references.relationships.some((relationship) => relationship.type === "IMPLEMENTS"));
    assert.ok(references.relationships.some((relationship) => relationship.type === "REGISTERS"));
    assert.ok(references.relationships.some((relationship) => relationship.type === "RAZOR_INJECTS"));
    assert.ok(references.relationships.some((relationship) => relationship.type === "CALLS_INJECTED_SERVICE"));
    const summary = references.evidence.find((item) => item.recordType === "referenceSummary");
    assert.deepStrictEqual(summary?.sourceReferenceKinds, { "razor-inject": 1, "razor-injected-call": 1 });
    assert.deepStrictEqual(summary?.relationshipTypes, { IMPLEMENTS: 1, REGISTERS: 1, RAZOR_INJECTS: 1, CALLS_INJECTED_SERVICE: 1 });
    assert.ok(references.nextQueries[0].includes(interfaceId));
  } finally {
    database.close();
  }
});

function csharpSymbol(id: string, name: string, fullyQualifiedName: string, kind: string, file: string): SymbolRecord {
  return {
    recordType: "symbol",
    id,
    name,
    fullyQualifiedName,
    kind,
    language: "csharp",
    file,
    range: testRange(),
    confidence: 1
  };
}

function testRange() {
  return { startLine: 1, startColumn: 1, endLine: 1, endColumn: 10 };
}
