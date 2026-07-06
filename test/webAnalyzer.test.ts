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

test("analyzeVanillaWeb infers nested, defaulted, and rest React props from destructured parameters", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const fixtureRoot = path.join(projectRoot, "test-fixtures", "react-inferred-props");
  const files = await scanWorkspaceFiles(fixtureRoot, { outputFolder: ".kraken-atlas" });
  const result = await analyzeVanillaWeb(fixtureRoot, files);

  assert.ok(files.some((file) => file.path === "src/WorkflowStatusBadge.tsx" && file.language === "typescript"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "component" && symbol.name === "WorkflowStatusBadge"));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/WorkflowStatusBadge.tsx:props:WorkflowStatusBadgeInferredProps.metadata" &&
    symbol.kind === "property" &&
    symbol.summary === "type: object; required"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/WorkflowStatusBadge.tsx:props:WorkflowStatusBadgeInferredProps.metadata.owner" &&
    symbol.kind === "property" &&
    symbol.summary === "type: object; required"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/WorkflowStatusBadge.tsx:props:WorkflowStatusBadgeInferredProps.metadata.owner.name" &&
    symbol.kind === "property" &&
    symbol.summary === "type: string; optional"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/WorkflowStatusBadge.tsx:props:WorkflowStatusBadgeInferredProps.metadata.flags" &&
    symbol.kind === "property" &&
    symbol.summary === "type: object; optional"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/WorkflowStatusBadge.tsx:props:WorkflowStatusBadgeInferredProps.metadata.flags.urgent" &&
    symbol.kind === "property" &&
    symbol.summary === "type: boolean; optional"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/WorkflowStatusBadge.tsx:props:WorkflowStatusBadgeInferredProps.metadata.tags" &&
    symbol.kind === "property" &&
    symbol.summary === "type: array; optional"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/WorkflowStatusBadge.tsx:props:WorkflowStatusBadgeInferredProps.badgeProps" &&
    symbol.kind === "property" &&
    symbol.summary === "type: object; optional; rest"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROP" &&
    relationship.from === "symbol:react:src/WorkflowStatusBadge.tsx:component:WorkflowStatusBadge" &&
    relationship.to === "symbol:react:src/WorkflowStatusBadge.tsx:props:WorkflowStatusBadgeInferredProps.metadata.owner.name"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:src/App.tsx:component:App" &&
    relationship.to === "symbol:react:src/WorkflowStatusBadge.tsx:props:WorkflowStatusBadgeInferredProps.metadata"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:src/App.tsx:component:App" &&
    relationship.to === "symbol:react:src/WorkflowStatusBadge.tsx:props:WorkflowStatusBadgeInferredProps.density"
  ));
});

test("analyzeVanillaWeb maps broad Record and index-signature React props", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const fixtureRoot = path.join(projectRoot, "test-fixtures", "react-utility-props");
  const files = await scanWorkspaceFiles(fixtureRoot, { outputFolder: ".kraken-atlas" });
  const result = await analyzeVanillaWeb(fixtureRoot, files);

  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/UtilityPanels.tsx:props:TokenPanelProps._key:_string_" &&
    symbol.kind === "property" &&
    symbol.summary === "type: string; required; index: string" &&
    symbol.patterns?.includes("typescript-index-signature")
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/UtilityPanels.tsx:props:SlotPanelProps._slot:_string_" &&
    symbol.kind === "property" &&
    symbol.summary === "type: string | undefined; required; index: string" &&
    symbol.patterns?.includes("typescript-index-signature")
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROP" &&
    relationship.from === "symbol:react:src/UtilityPanels.tsx:component:TokenPanel" &&
    relationship.to === "symbol:react:src/UtilityPanels.tsx:props:TokenPanelProps._key:_string_"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:src/App.tsx:component:App" &&
    relationship.to === "symbol:react:src/UtilityPanels.tsx:props:TokenPanelProps._key:_string_" &&
    /<TokenPanel[^>]+data-tone=/u.test(relationship.evidence ?? "")
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:src/App.tsx:component:App" &&
    relationship.to === "symbol:react:src/UtilityPanels.tsx:props:SlotPanelProps._slot:_string_" &&
    /<SlotPanel[^>]+footer=/u.test(relationship.evidence ?? "")
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:src/App.tsx:component:App" &&
    relationship.to === "symbol:react:src/UtilityPanels.tsx:props:SlotPanelProps.highlighted"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/UtilityPanels.tsx:props:MetricPanelProps.data-tone" &&
    symbol.kind === "property" &&
    symbol.summary === "type: string; required"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/UtilityPanels.tsx:props:MetricPanelProps.data-size" &&
    symbol.kind === "property" &&
    symbol.summary === "type: string; required"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:src/App.tsx:component:App" &&
    relationship.to === "symbol:react:src/UtilityPanels.tsx:props:MetricPanelProps.data-tone"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:src/App.tsx:component:App" &&
    relationship.to === "symbol:react:src/UtilityPanels.tsx:props:MetricPanelProps.data-size"
  ));
});

test("analyzeVanillaWeb maps generic React component props and JSX type arguments", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const fixtureRoot = path.join(projectRoot, "test-fixtures", "react-generic-props");
  const files = await scanWorkspaceFiles(fixtureRoot, { outputFolder: ".kraken-atlas" });
  const result = await analyzeVanillaWeb(fixtureRoot, files);

  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/GenericPicker.tsx:component:GenericPicker" &&
    symbol.kind === "component" &&
    symbol.summary === "GenericPickerProps"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/GenericPicker.tsx:component:GenericPicker:type-parameter:TValue" &&
    symbol.kind === "type-parameter" &&
    symbol.summary === "constraint: PickerValue; default: PickerValue"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "HAS_TYPE_PARAMETER" &&
    relationship.from === "symbol:react:src/GenericPicker.tsx:component:GenericPicker" &&
    relationship.to === "symbol:react:src/GenericPicker.tsx:component:GenericPicker:type-parameter:TValue"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROPS" &&
    relationship.from === "symbol:react:src/GenericPicker.tsx:component:GenericPicker" &&
    relationship.to === "symbol:react:src/GenericPicker.tsx:props:GenericPickerProps"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROP" &&
    relationship.from === "symbol:react:src/GenericPicker.tsx:component:GenericPicker" &&
    relationship.to === "symbol:react:src/GenericPicker.tsx:props:GenericPickerProps.value"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/GenericPicker.tsx:props:GenericPickerProps.options" &&
    symbol.kind === "property" &&
    symbol.summary === "type: PickerOptionList<TValue>; required"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/GenericPicker.tsx:component:AliasPicker:type-parameter:TItem" &&
    symbol.kind === "type-parameter" &&
    symbol.summary === "constraint: PickerValue; default: PickerValue"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROPS" &&
    relationship.from === "symbol:react:src/GenericPicker.tsx:component:AliasPicker" &&
    relationship.to === "symbol:react:src/GenericPicker.tsx:props:AliasPickerProps"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/GenericPicker.tsx:props:AliasPickerProps.choices" &&
    symbol.kind === "property" &&
    symbol.summary === "type: ImportedPickerOptionList<TOption>; required"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/PickerTypes.ts:type:ImportedPickerOptionList" &&
    symbol.kind === "type"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/GenericPicker.tsx:component:DefaultedPicker:type-parameter:TSelection" &&
    symbol.kind === "type-parameter" &&
    symbol.summary === "constraint: PickerValue; default: PickerValue"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROPS" &&
    relationship.from === "symbol:react:src/GenericPicker.tsx:component:DefaultedPicker" &&
    relationship.to === "symbol:react:src/GenericPicker.tsx:props:DefaultedPickerProps"
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "jsx-type-argument" &&
    reference.symbolName === "PickerValue" &&
    reference.resolvedSymbolId === "symbol:react:src/GenericPicker.tsx:type:PickerValue"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "USES_TYPE_ARGUMENT" &&
    relationship.from === "symbol:react:src/App.tsx:component:App" &&
    relationship.to === "symbol:react:src/GenericPicker.tsx:type:PickerValue"
  ));
  const valuePropPass = result.relationships.find((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:src/App.tsx:component:App" &&
    relationship.to === "symbol:react:src/GenericPicker.tsx:props:GenericPickerProps.value"
  );
  assert.ok(valuePropPass);
  assert.ok(valuePropPass.evidence?.includes("TValue=PickerValue"));
  assert.ok(valuePropPass.evidence?.includes("type: PickerValue"));

  const optionsPropPass = result.relationships.find((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:src/App.tsx:component:App" &&
    relationship.to === "symbol:react:src/GenericPicker.tsx:props:GenericPickerProps.options"
  );
  assert.ok(optionsPropPass);
  assert.ok(optionsPropPass.evidence?.includes("TValue=PickerValue"));
  assert.ok(optionsPropPass.evidence?.includes("type: PickerValue[]"));

  const aliasSelectedPropPass = result.relationships.find((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:src/App.tsx:component:App" &&
    relationship.to === "symbol:react:src/GenericPicker.tsx:props:AliasPickerProps.selected"
  );
  assert.ok(aliasSelectedPropPass);
  assert.ok(aliasSelectedPropPass.evidence?.includes("TOption=PickerValue"));
  assert.ok(aliasSelectedPropPass.evidence?.includes("type: PickerValue"));

  const aliasChoicesPropPass = result.relationships.find((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:src/App.tsx:component:App" &&
    relationship.to === "symbol:react:src/GenericPicker.tsx:props:AliasPickerProps.choices"
  );
  assert.ok(aliasChoicesPropPass);
  assert.ok(aliasChoicesPropPass.evidence?.includes("TOption=PickerValue"));
  assert.ok(aliasChoicesPropPass.evidence?.includes("type: PickerValue[]"));

  const defaultedCurrentPropPass = result.relationships.find((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:src/App.tsx:component:App" &&
    relationship.to === "symbol:react:src/GenericPicker.tsx:props:DefaultedPickerProps.current"
  );
  assert.ok(defaultedCurrentPropPass);
  assert.ok(defaultedCurrentPropPass.evidence?.includes("TChoice=PickerValue"));
  assert.ok(defaultedCurrentPropPass.evidence?.includes("type: PickerValue"));

  const defaultedEntriesPropPass = result.relationships.find((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:src/App.tsx:component:App" &&
    relationship.to === "symbol:react:src/GenericPicker.tsx:props:DefaultedPickerProps.entries"
  );
  assert.ok(defaultedEntriesPropPass);
  assert.ok(defaultedEntriesPropPass.evidence?.includes("TChoice=PickerValue"));
  assert.ok(defaultedEntriesPropPass.evidence?.includes("type: PickerValue[]"));
});

test("analyzeVanillaWeb maps React, JSX, and TypeScript component relationships", async (t) => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const fixtureRoot = path.resolve(projectRoot, "..", "test-projects", "ReactAgentDashboard");
  if (!await pathExists(fixtureRoot)) {
    t.skip("ReactAgentDashboard sibling test-projects fixture is not present.");
    return;
  }

  const files = await scanWorkspaceFiles(fixtureRoot, { outputFolder: ".kraken-atlas" });
  const result = await analyzeVanillaWeb(fixtureRoot, files);

  assert.ok(files.some((file) => file.path === "src/App.tsx" && file.language === "typescript"));
  assert.ok(files.some((file) => file.path === "src/components/LegacyMetricBadge.jsx" && file.language === "javascript"));

  assert.ok(result.symbols.some((symbol) => symbol.kind === "component" && symbol.name === "App"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "component" && symbol.name === "LegacyMetricBadge"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "component" && symbol.name === "EmptyProjectState"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "component" && symbol.name === "ProjectToolbar"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "component" && symbol.name === "ProjectToolbarSearchInput"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "hook" && symbol.name === "useProjectSearch"));
  assert.ok(result.symbols.some((symbol) =>
    symbol.kind === "store" &&
    symbol.name === "useProjectSelectionStore" &&
    symbol.patterns?.includes("react-state-store")
  ));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "context" && symbol.name === "ProjectContext"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "function" && symbol.name === "fetchProjectSummaries" && symbol.patterns?.includes("client-service")));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/components/ProjectCard.tsx:props:ProjectCardProps.project" &&
    symbol.kind === "property" &&
    symbol.summary === "type: ProjectSummary; required" &&
    symbol.patterns?.includes("react-prop-member")
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/components/ProjectSearchForm.tsx:props:ProjectSearchFormProps.onQueryChange" &&
    symbol.kind === "property" &&
    symbol.summary === "type: (query: string) => void; required"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/components/EmptyProjectState.tsx:props:EmptyProjectStateProps.message" &&
    symbol.kind === "property" &&
    symbol.summary === "type: string; optional"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/components/ProjectToolbar.tsx:props:ProjectToolbarProps.searchInputRef" &&
    symbol.kind === "property" &&
    symbol.summary === "type: Ref<HTMLInputElement>; optional"
  ));

  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "IMPORTS_MODULE" &&
    relationship.from === "symbol:react:src/App.tsx" &&
    relationship.to === "file:src/pages/DashboardPage.tsx"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "RENDERS_COMPONENT" &&
    relationship.from === "symbol:react:src/App.tsx:component:App" &&
    relationship.to === "symbol:react:src/pages/DashboardPage.tsx:component:DashboardPage"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "USES_HOOK" &&
    relationship.from === "symbol:react:src/pages/DashboardPage.tsx:component:DashboardPage" &&
    relationship.to === "symbol:react:src/hooks/useProjectSearch.ts:hook:useProjectSearch"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "USES_STORE" &&
    relationship.from === "symbol:react:src/pages/DashboardPage.tsx:component:DashboardPage" &&
    relationship.to === "symbol:react:src/stores/useProjectSelectionStore.ts:store:useProjectSelectionStore"
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "react-store-call" &&
    reference.resolvedSymbolId === "symbol:react:src/stores/useProjectSelectionStore.ts:store:useProjectSelectionStore"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PROVIDES_CONTEXT" &&
    relationship.from === "symbol:react:src/context/ProjectContext.tsx:component:ProjectProvider" &&
    relationship.to === "symbol:react:src/context/ProjectContext.tsx:context:ProjectContext"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "CONSUMES_CONTEXT" &&
    relationship.from === "symbol:react:src/context/ProjectContext.tsx:hook:useProjectContext" &&
    relationship.to === "symbol:react:src/context/ProjectContext.tsx:context:ProjectContext"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "MAPS_ROUTE" &&
    relationship.from === "symbol:react:src/routes.ts:route:dashboard" &&
    relationship.to === "symbol:react:src/pages/DashboardPage.tsx:component:DashboardPage"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "MAPS_ROUTE" &&
    relationship.from === "symbol:react:src/routes.ts:route:data-dashboard" &&
    relationship.to === "symbol:react:src/pages/DashboardPage.tsx:component:DashboardPage"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "MAPS_ROUTE" &&
    relationship.from === "symbol:react:src/routes.ts:route:data-project" &&
    relationship.to === "symbol:react:src/pages/ProjectDetailPage.tsx:component:ProjectDetailPage"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "MAPS_ROUTE" &&
    relationship.from === "symbol:react:src/routerElements.tsx:route:path:element-settings" &&
    relationship.to === "symbol:react:src/pages/SettingsPage.tsx:component:SettingsPage"
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "react-route" &&
    reference.resolvedSymbolId === "route:react:/element-project"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "CALLS_API_ROUTE" &&
    relationship.from === "symbol:react:src/services/projectApi.ts:function:fetchProjectSummaries" &&
    relationship.to === "route:web:/api/projects?query=:param"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "RENDERS_COMPONENT" &&
    relationship.from === "symbol:react:src/pages/DashboardPage.tsx:component:DashboardPage" &&
    relationship.to === "symbol:react:src/components/ProjectToolbar.tsx:component:ProjectToolbar"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "RENDERS_COMPONENT" &&
    relationship.from === "symbol:react:src/pages/DashboardPage.tsx:component:DashboardPage" &&
    relationship.to === "symbol:react:src/components/EmptyProjectState.tsx:component:EmptyProjectState"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "RENDERS_COMPONENT" &&
    relationship.from === "symbol:react:src/components/ProjectToolbar.tsx:component:ProjectToolbar" &&
    relationship.to === "symbol:react:src/components/ProjectToolbar.tsx:component:ProjectToolbarSearchInput"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "HAS_MEMBER" &&
    relationship.from === "symbol:react:src/components/ProjectCard.tsx:props:ProjectCardProps" &&
    relationship.to === "symbol:react:src/components/ProjectCard.tsx:props:ProjectCardProps.onOpenProject"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROP" &&
    relationship.from === "symbol:react:src/components/ProjectCard.tsx:component:ProjectCard" &&
    relationship.to === "symbol:react:src/components/ProjectCard.tsx:props:ProjectCardProps.onOpenProject"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROP" &&
    relationship.from === "symbol:react:src/components/ProjectToolbar.tsx:component:ProjectToolbarSearchInput" &&
    relationship.to === "symbol:react:src/components/ProjectToolbar.tsx:props:ProjectToolbarSearchInputProps.value"
  ));
});

test("analyzeVanillaWeb maps React workflow fixture route and store styles", async (t) => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const fixtureRoot = path.resolve(projectRoot, "..", "test-projects", "ReactWorkflowBoard");
  if (!await pathExists(fixtureRoot)) {
    t.skip("ReactWorkflowBoard sibling test-projects fixture is not present.");
    return;
  }

  const files = await scanWorkspaceFiles(fixtureRoot, { outputFolder: ".kraken-atlas" });
  const result = await analyzeVanillaWeb(fixtureRoot, files);

  assert.ok(files.some((file) => file.path === "src/routes/workflowRoutes.tsx" && file.language === "typescript"));
  assert.ok(files.some((file) => file.path === "src/components/LegacyStatusBadge.jsx" && file.language === "javascript"));

  assert.ok(result.symbols.some((symbol) => symbol.kind === "component" && symbol.name === "WorkspacePage"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "component" && symbol.name === "WorkflowCard"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "component" && symbol.name === "LegacyStatusBadge"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "store" && symbol.name === "useWorkflowStore"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "function" && symbol.name === "fetchWorkflowItems" && symbol.patterns?.includes("client-service")));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/components/WorkflowSummary.tsx:props:WorkflowSummaryProps" &&
    symbol.kind === "props" &&
    symbol.patterns?.includes("react-props")
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:src/components/WorkflowSummary.tsx:props:WorkflowSummaryProps.blockedCount" &&
    symbol.summary === "type: number; optional"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROP" &&
    relationship.from === "symbol:react:src/components/WorkflowSummary.tsx:component:WorkflowSummary" &&
    relationship.to === "symbol:react:src/components/WorkflowSummary.tsx:props:WorkflowSummaryProps.onClearSelection"
  ));

  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "MAPS_ROUTE" &&
    relationship.from === "symbol:react:src/routes/workflowRoutes.tsx:route:workspace" &&
    relationship.to === "symbol:react:src/pages/WorkspacePage.tsx:component:WorkspacePage"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "MAPS_ROUTE" &&
    relationship.from === "symbol:react:src/routes/workflowRoutes.tsx:route:review" &&
    relationship.to === "symbol:react:src/pages/ReviewPage.tsx:component:ReviewPage"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "MAPS_ROUTE" &&
    relationship.from === "symbol:react:src/routes/workflowRoutes.tsx:route:archive" &&
    relationship.to === "symbol:react:src/pages/ArchivePage.tsx:component:ArchivePage"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "USES_STORE" &&
    relationship.from === "symbol:react:src/pages/WorkspacePage.tsx:component:WorkspacePage" &&
    relationship.to === "symbol:react:src/state/useWorkflowStore.ts:store:useWorkflowStore"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "USES_STORE" &&
    relationship.from === "symbol:react:src/components/WorkflowCard.tsx:component:WorkflowCard" &&
    relationship.to === "symbol:react:src/state/useWorkflowStore.ts:store:useWorkflowStore"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "CALLS_API_ROUTE" &&
    relationship.from === "symbol:react:src/services/workflowApi.ts:function:fetchWorkflowItems" &&
    relationship.to === "route:web:/api/workflows?query=:param"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "CALLS_API_ROUTE" &&
    relationship.from === "symbol:react:src/services/workflowApi.ts:function:saveWorkflowNote" &&
    relationship.to === "route:web:/api/workflows/:param/notes"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "RENDERS_COMPONENT" &&
    relationship.from === "symbol:react:src/pages/WorkspacePage.tsx:component:WorkspacePage" &&
    relationship.to === "symbol:react:src/components/WorkflowCard.tsx:component:WorkflowCard"
  ));
});

test("analyzeVanillaWeb maps Next-style React file routes", async (t) => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const fixtureRoot = path.resolve(projectRoot, "..", "test-projects", "ReactNextPortal");
  if (!await pathExists(fixtureRoot)) {
    t.skip("ReactNextPortal sibling test-projects fixture is not present.");
    return;
  }

  const files = await scanWorkspaceFiles(fixtureRoot, { outputFolder: ".kraken-atlas" });
  const result = await analyzeVanillaWeb(fixtureRoot, files);

  assert.ok(files.some((file) => file.path === "app/workflows/[workflowId]/page.tsx" && file.language === "typescript"));
  assert.ok(files.some((file) => file.path === "components/index.ts" && file.language === "typescript"));
  assert.ok(files.some((file) => file.path === "components/LegacyWorkflowNote.jsx" && file.language === "javascript"));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:typescript-project:tsconfig.json" &&
    symbol.kind === "typescript-project" &&
    symbol.summary?.includes("moduleResolution: bundler") &&
    symbol.summary?.includes("baseUrl: .") &&
    symbol.patterns?.includes("typescript-path-aliases")
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:typescript-project:tsconfig.json:path-alias:_components/_" &&
    symbol.kind === "path-alias" &&
    symbol.summary === "targets: components/*"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:typescript-project:tsconfig.json:path-alias:_components" &&
    symbol.kind === "path-alias" &&
    symbol.summary === "targets: components/index.ts"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:package:package.json" &&
    symbol.kind === "package" &&
    symbol.name === "react-next-portal" &&
    symbol.patterns?.includes("next-package") &&
    symbol.patterns?.includes("package-exports")
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:package:package.json:export:.:default" &&
    symbol.kind === "package-export" &&
    symbol.name === "." &&
    symbol.summary === "target: ./app/page.tsx"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:package:package.json:export:./components:types" &&
    symbol.kind === "package-export" &&
    symbol.name === "./components" &&
    symbol.summary === "target: ./components/index.ts; condition: types"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PACKAGE_EXPORT" &&
    relationship.from === "symbol:package:package.json" &&
    relationship.to === "symbol:package:package.json:export:./components:types"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "EXPORTS_FILE" &&
    relationship.from === "symbol:package:package.json:export:./components:types" &&
    relationship.to === "file:components/index.ts"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_TYPESCRIPT_PROJECT" &&
    relationship.from === "symbol:package:package.json" &&
    relationship.to === "symbol:typescript-project:tsconfig.json"
  ));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "component" && symbol.name === "WorkflowPage"));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:app/workflows/[workflowId]/page.tsx:props:WorkflowPageProps.params" &&
    symbol.kind === "property" &&
    symbol.summary === "type: object; required"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:app/workflows/[workflowId]/page.tsx:props:WorkflowPageProps.params.workflowId" &&
    symbol.kind === "property" &&
    symbol.summary === "type: string; required"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:components/WorkflowShell.tsx:props:WorkflowShellProps.mode" &&
    symbol.summary === "type: \"home\" | \"detail\"; optional"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:types/workflow.ts:type:WorkflowStatus" &&
    symbol.kind === "type" &&
    symbol.summary === "compiler: type-alias; type: \"ready\" | \"blocked\"" &&
    symbol.patterns?.includes("typescript-type-alias")
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:types/workflow.ts:type:WorkflowStatus:variant:literal:_ready_" &&
    symbol.kind === "union-variant" &&
    symbol.summary === "literal: \"ready\"" &&
    symbol.patterns?.includes("typescript-literal-union-value")
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:types/workflow.ts:enum:WorkflowPriority" &&
    symbol.kind === "enum" &&
    symbol.summary === "compiler: enum" &&
    symbol.patterns?.includes("typescript-enum")
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:types/workflow.ts:enum:WorkflowPriority.High" &&
    symbol.kind === "enum-member" &&
    symbol.summary === "type: \"high\"; required; readonly" &&
    symbol.patterns?.includes("typescript-enum-member")
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:types/workflow.ts:interface:WorkflowSnapshot.priority" &&
    symbol.kind === "property" &&
    symbol.summary === "type: WorkflowPriority; optional"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:types/workflow.ts:props:WorkflowSummaryCardProps" &&
    symbol.kind === "props" &&
    symbol.summary === "compiler: interface"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:types/workflow.ts:props:WorkflowToneProps" &&
    symbol.kind === "props" &&
    symbol.summary === "compiler: interface"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:types/workflow.ts:props:WorkflowToneProps.tone" &&
    symbol.kind === "property" &&
    symbol.summary === "type: \"calm\" | \"urgent\"; optional"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:types/workflow.ts:props:WorkflowPreviewCardProps" &&
    symbol.kind === "props" &&
    symbol.summary?.startsWith("compiler: type-literal intersection")
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:types/workflow.ts:props:WorkflowPreviewCardProps.compact" &&
    symbol.kind === "property" &&
    symbol.summary === "type: boolean; optional"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:types/workflow.ts:props:WorkflowActionLabelsProps.approve" &&
    symbol.kind === "property" &&
    symbol.summary === "type: string; required"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:types/workflow.ts:props:WorkflowActionStatesProps.pending" &&
    symbol.kind === "property" &&
    symbol.summary === "type: boolean; optional"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:types/workflow.ts:props:WorkflowActionPanelProps.snapshot" &&
    symbol.kind === "property" &&
    symbol.summary === "type: WorkflowSnapshot; required"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:components/WorkflowStatusPill.tsx:props:WorkflowStatusPillInferredProps" &&
    symbol.kind === "props" &&
    symbol.summary === "inferred: destructured parameters"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:components/WorkflowStatusPill.tsx:props:WorkflowStatusPillInferredProps.label" &&
    symbol.kind === "property" &&
    symbol.summary === "type: string; optional"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:components/WorkflowStatusPill.tsx:props:WorkflowStatusPillInferredProps.status" &&
    symbol.kind === "property" &&
    symbol.summary === "type: unknown; required"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "EXTENDS_PROPS" &&
    relationship.from === "symbol:react:types/workflow.ts:props:WorkflowSummaryCardProps" &&
    relationship.to === "symbol:react:types/workflow.ts:props:WorkflowToneProps"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "REFERENCES_TYPE" &&
    relationship.from === "symbol:react:types/workflow.ts:interface:WorkflowSnapshot.status" &&
    relationship.to === "symbol:react:types/workflow.ts:type:WorkflowStatus"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "REFERENCES_TYPE" &&
    relationship.from === "symbol:react:types/workflow.ts:interface:WorkflowSnapshot.priority" &&
    relationship.to === "symbol:react:types/workflow.ts:enum:WorkflowPriority"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:types/workflow.ts:interface:WorkflowEnvelope" &&
    symbol.kind === "interface" &&
    symbol.patterns?.includes("typescript-exported-contract") &&
    symbol.patterns?.includes("typescript-api-contract")
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:types/workflow.ts:interface:WorkflowEnvelope:type-parameter:TPayload" &&
    symbol.kind === "type-parameter" &&
    symbol.summary === "constraint: WorkflowSnapshot; default: WorkflowSnapshot"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "HAS_TYPE_PARAMETER" &&
    relationship.from === "symbol:react:types/workflow.ts:interface:WorkflowEnvelope" &&
    relationship.to === "symbol:react:types/workflow.ts:interface:WorkflowEnvelope:type-parameter:TPayload"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "REFERENCES_TYPE" &&
    relationship.from === "symbol:react:types/workflow.ts:interface:WorkflowEnvelope:type-parameter:TPayload" &&
    relationship.to === "symbol:react:types/workflow.ts:interface:WorkflowSnapshot"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "REFERENCES_TYPE" &&
    relationship.from === "symbol:react:types/workflow.ts:interface:WorkflowEnvelope.payload" &&
    relationship.to === "symbol:react:types/workflow.ts:interface:WorkflowEnvelope:type-parameter:TPayload"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:types/workflow.ts:type:WorkflowEvent" &&
    symbol.kind === "type" &&
    symbol.patterns?.includes("typescript-discriminated-union")
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:types/workflow.ts:type:WorkflowEvent:variant:kind:_loaded_" &&
    symbol.kind === "union-variant" &&
    symbol.summary === "discriminator: kind"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "HAS_UNION_VARIANT" &&
    relationship.from === "symbol:react:types/workflow.ts:type:WorkflowEvent" &&
    relationship.to === "symbol:react:types/workflow.ts:type:WorkflowEvent:variant:kind:_failed_"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "USES_TYPE_ARGUMENT" &&
    relationship.from === "symbol:react:types/workflow.ts:type:WorkflowEvent" &&
    relationship.to === "symbol:react:types/workflow.ts:type:WorkflowEvent:type-parameter:TPayload"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "USES_TYPE_ARGUMENT" &&
    relationship.from === "symbol:react:types/workflow.ts:type:WorkflowEvent" &&
    relationship.to === "symbol:react:types/workflow.ts:interface:WorkflowSnapshot"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:components/WorkflowTeaser.tsx:props:WorkflowTeaserProps" &&
    symbol.kind === "props" &&
    symbol.summary?.startsWith("compiler: type-literal intersection")
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:components/WorkflowTeaser.tsx:props:WorkflowTeaserProps.emphasis" &&
    symbol.kind === "property" &&
    symbol.summary === "type: \"high\" | \"low\"; optional"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:components/WorkflowTeaser.tsx:props:WorkflowTeaserProps.onSelect" &&
    symbol.kind === "property" &&
    symbol.summary === "type: (workflowId: string) => void; optional"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "ALIASES_COMPONENT_PROPS" &&
    relationship.from === "symbol:react:components/WorkflowTeaser.tsx:props:WorkflowTeaserProps" &&
    relationship.to === "symbol:react:components/WorkflowShell.tsx:component:WorkflowShell"
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "react-imported-hook-call" &&
    reference.symbolName === "useWorkflowTelemetry" &&
    reference.file === "components/WorkflowTeaser.tsx" &&
    reference.resolvedSymbolId === "symbol:react:hooks/useWorkflowTelemetry.ts:hook:useWorkflowTelemetry"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "USES_HOOK" &&
    relationship.from === "symbol:react:components/WorkflowTeaser.tsx:component:WorkflowTeaser" &&
    relationship.to === "symbol:react:hooks/useWorkflowTelemetry.ts:hook:useWorkflowTelemetry" &&
    /import resolved/u.test(relationship.evidence ?? "")
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "typescript-type-import" &&
    reference.symbolName === "WorkflowSnapshot" &&
    reference.file === "components/WorkflowShell.tsx" &&
    reference.resolvedSymbolId === "file:types/workflow.ts"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "TYPE_IMPORTS_MODULE" &&
    relationship.from === "symbol:react:components/WorkflowShell.tsx" &&
    relationship.to === "file:types/workflow.ts" &&
    /type-only; TypeScript module resolver/u.test(relationship.evidence ?? "")
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:components/InteractiveWorkflowBadge.tsx:component:InteractiveWorkflowBadge" &&
    symbol.patterns?.includes("react-client-component")
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:components/LegacyWorkflowNote.jsx:component:LegacyWorkflowNote" &&
    symbol.kind === "component" &&
    symbol.language === "javascript"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:components/LegacyWorkflowNote.jsx:props:LegacyWorkflowNoteInferredProps.message" &&
    symbol.kind === "property" &&
    symbol.summary === "type: unknown; required"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROPS" &&
    relationship.from === "symbol:react:components/WorkflowSummaryCard.tsx:component:WorkflowSummaryCard" &&
    relationship.to === "symbol:react:types/workflow.ts:props:WorkflowSummaryCardProps"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROP" &&
    relationship.from === "symbol:react:components/WorkflowSummaryCard.tsx:component:WorkflowSummaryCard" &&
    relationship.to === "symbol:react:types/workflow.ts:props:WorkflowToneProps.tone"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROP" &&
    relationship.from === "symbol:react:components/WorkflowPreviewCard.tsx:component:WorkflowPreviewCard" &&
    relationship.to === "symbol:react:types/workflow.ts:props:WorkflowPreviewCardProps.compact"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROP" &&
    relationship.from === "symbol:react:components/WorkflowPreviewCard.tsx:component:WorkflowPreviewCard" &&
    relationship.to === "symbol:react:types/workflow.ts:props:WorkflowSummaryCardProps.snapshot"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROP" &&
    relationship.from === "symbol:react:components/WorkflowPreviewCard.tsx:component:WorkflowPreviewCard" &&
    relationship.to === "symbol:react:types/workflow.ts:props:WorkflowToneProps.tone"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROP" &&
    relationship.from === "symbol:react:components/WorkflowActionPanel.tsx:component:WorkflowActionPanel" &&
    relationship.to === "symbol:react:types/workflow.ts:props:WorkflowActionLabelsProps.approve"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROP" &&
    relationship.from === "symbol:react:components/WorkflowActionPanel.tsx:component:WorkflowActionPanel" &&
    relationship.to === "symbol:react:types/workflow.ts:props:WorkflowActionStatesProps.pending"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROPS" &&
    relationship.from === "symbol:react:components/WorkflowStatusPill.tsx:component:WorkflowStatusPill" &&
    relationship.to === "symbol:react:components/WorkflowStatusPill.tsx:props:WorkflowStatusPillInferredProps"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROP" &&
    relationship.from === "symbol:react:components/WorkflowStatusPill.tsx:component:WorkflowStatusPill" &&
    relationship.to === "symbol:react:components/WorkflowStatusPill.tsx:props:WorkflowStatusPillInferredProps.status"
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:app/workflows/[workflowId]/page.tsx:component:WorkflowPage" &&
    symbol.patterns?.includes("react-server-component")
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:app/actions.ts:function:saveWorkflowDecision" &&
    symbol.patterns?.includes("react-server-action")
  ));
  assert.ok(result.symbols.some((symbol) =>
    symbol.id === "symbol:react:app/api/workflows/[workflowId]/decision/route.ts:route:path:api/workflows/:workflowId/decision" &&
    symbol.kind === "route"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "DECLARES_PROP" &&
    relationship.from === "symbol:react:components/WorkflowShell.tsx:component:WorkflowShell" &&
    relationship.to === "symbol:react:components/WorkflowShell.tsx:props:WorkflowShellProps.mode"
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "jsx-prop" &&
    reference.symbolName === "mode" &&
    reference.file === "app/page.tsx" &&
    reference.resolvedSymbolId === "symbol:react:components/WorkflowShell.tsx:props:WorkflowShellProps.mode"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:app/page.tsx:component:HomePage" &&
    relationship.to === "symbol:react:components/WorkflowShell.tsx:props:WorkflowShellProps.snapshot"
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "jsx-component" &&
    reference.symbolName === "ShellViaDefault" &&
    reference.file === "app/page.tsx" &&
    reference.resolvedSymbolId === "symbol:react:components/WorkflowShell.tsx:component:WorkflowShell"
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "jsx-component" &&
    reference.symbolName === "ShellFromBarrel" &&
    reference.file === "app/page.tsx" &&
    reference.resolvedSymbolId === "symbol:react:components/WorkflowShell.tsx:component:WorkflowShell"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:app/page.tsx:component:HomePage" &&
    relationship.to === "symbol:react:components/WorkflowShell.tsx:props:WorkflowShellProps.mode" &&
    /<ShellFromBarrel mode=/u.test(relationship.evidence ?? "")
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:app/page.tsx:component:HomePage" &&
    relationship.to === "symbol:react:components/WorkflowShell.tsx:props:WorkflowShellProps.mode" &&
    /<ShellViaDefault mode=/u.test(relationship.evidence ?? "")
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:app/page.tsx:component:HomePage" &&
    relationship.to === "symbol:react:components/WorkflowTeaser.tsx:props:WorkflowTeaserProps.emphasis"
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "jsx-component" &&
    reference.symbolName === "WorkflowSummaryCard" &&
    reference.file === "app/page.tsx" &&
    reference.resolvedSymbolId === "symbol:react:components/WorkflowSummaryCard.tsx:component:WorkflowSummaryCard"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:app/page.tsx:component:HomePage" &&
    relationship.to === "symbol:react:types/workflow.ts:props:WorkflowToneProps.tone" &&
    /<WorkflowSummaryCard tone=/u.test(relationship.evidence ?? "")
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:app/page.tsx:component:HomePage" &&
    relationship.to === "symbol:react:types/workflow.ts:props:WorkflowSummaryCardProps.snapshot" &&
    /<WorkflowSummaryCard snapshot=/u.test(relationship.evidence ?? "")
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "jsx-component" &&
    reference.symbolName === "WorkflowPreviewCard" &&
    reference.file === "app/page.tsx" &&
    reference.resolvedSymbolId === "symbol:react:components/WorkflowPreviewCard.tsx:component:WorkflowPreviewCard"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:app/page.tsx:component:HomePage" &&
    relationship.to === "symbol:react:types/workflow.ts:props:WorkflowPreviewCardProps.compact" &&
    /<WorkflowPreviewCard compact=/u.test(relationship.evidence ?? "")
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:app/page.tsx:component:HomePage" &&
    relationship.to === "symbol:react:types/workflow.ts:props:WorkflowToneProps.tone" &&
    /<WorkflowPreviewCard tone=/u.test(relationship.evidence ?? "")
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:app/page.tsx:component:HomePage" &&
    relationship.to === "symbol:react:types/workflow.ts:props:WorkflowSummaryCardProps.snapshot" &&
    /<WorkflowPreviewCard snapshot=/u.test(relationship.evidence ?? "")
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "jsx-component" &&
    reference.symbolName === "WorkflowStatusPill" &&
    reference.file === "app/page.tsx" &&
    reference.resolvedSymbolId === "symbol:react:components/WorkflowStatusPill.tsx:component:WorkflowStatusPill"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:app/page.tsx:component:HomePage" &&
    relationship.to === "symbol:react:components/WorkflowStatusPill.tsx:props:WorkflowStatusPillInferredProps.label" &&
    /<WorkflowStatusPill label=/u.test(relationship.evidence ?? "")
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:app/page.tsx:component:HomePage" &&
    relationship.to === "symbol:react:components/WorkflowStatusPill.tsx:props:WorkflowStatusPillInferredProps.status" &&
    /<WorkflowStatusPill status=/u.test(relationship.evidence ?? "")
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:app/page.tsx:component:HomePage" &&
    relationship.to === "symbol:react:types/workflow.ts:props:WorkflowActionLabelsProps.approve" &&
    /<WorkflowActionPanel approve=/u.test(relationship.evidence ?? "")
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:app/page.tsx:component:HomePage" &&
    relationship.to === "symbol:react:types/workflow.ts:props:WorkflowActionStatesProps.pending" &&
    /<WorkflowActionPanel pending=/u.test(relationship.evidence ?? "")
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "react-imported-call" &&
    reference.symbolName === "WorkflowClient.fetchWorkflowSnapshot" &&
    reference.file === "app/page.tsx" &&
    reference.resolvedSymbolId === "symbol:react:services/workflowClient.ts:function:fetchWorkflowSnapshot"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "CALLS" &&
    relationship.from === "symbol:react:app/page.tsx:component:HomePage" &&
    relationship.to === "symbol:react:services/workflowClient.ts:function:fetchWorkflowSnapshot" &&
    /import resolved/u.test(relationship.evidence ?? "")
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "jsx-namespace-component" &&
    reference.symbolName === "PortalComponents.WorkflowTeaser" &&
    reference.file === "app/page.tsx" &&
    reference.resolvedSymbolId === "symbol:react:components/WorkflowTeaser.tsx:component:WorkflowTeaser"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "RENDERS_COMPONENT" &&
    relationship.from === "symbol:react:app/page.tsx:component:HomePage" &&
    relationship.to === "symbol:react:components/WorkflowTeaser.tsx:component:WorkflowTeaser"
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "jsx-namespace-component" &&
    reference.symbolName === "PortalComponents.LegacyNote" &&
    reference.file === "app/page.tsx" &&
    reference.resolvedSymbolId === "symbol:react:components/LegacyWorkflowNote.jsx:component:LegacyWorkflowNote"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "RENDERS_COMPONENT" &&
    relationship.from === "symbol:react:app/page.tsx:component:HomePage" &&
    relationship.to === "symbol:react:components/LegacyWorkflowNote.jsx:component:LegacyWorkflowNote"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PASSES_PROP" &&
    relationship.from === "symbol:react:app/page.tsx:component:HomePage" &&
    relationship.to === "symbol:react:components/LegacyWorkflowNote.jsx:props:LegacyWorkflowNoteInferredProps.message"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "RENDERS_COMPONENT" &&
    relationship.from === "symbol:react:components/WorkflowShell.tsx:component:WorkflowShell" &&
    relationship.to === "symbol:react:components/InteractiveWorkflowBadge.tsx:component:InteractiveWorkflowBadge"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "CALLS_API_ROUTE" &&
    relationship.from === "symbol:react:app/actions.ts:function:saveWorkflowDecision" &&
    relationship.to === "route:web:/api/workflows/:param/decision"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "MAPS_ROUTE" &&
    relationship.from === "symbol:react:app/api/workflows/[workflowId]/decision/route.ts:route:path:api/workflows/:workflowId/decision" &&
    relationship.to === "symbol:react:app/api/workflows/[workflowId]/decision/route.ts:function:POST"
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "react-route" &&
    reference.file === "app/api/workflows/[workflowId]/decision/route.ts" &&
    reference.resolvedSymbolId === "route:web:/api/workflows/:param/decision"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "RE_EXPORTS_MODULE" &&
    relationship.from === "symbol:react:components/index.ts" &&
    relationship.to === "file:components/WorkflowShell.tsx"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "IMPORTS_MODULE" &&
    relationship.from === "symbol:react:app/page.tsx" &&
    relationship.to === "file:components/index.ts"
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "typescript-import" &&
    reference.symbolName === "WorkflowShell" &&
    reference.file === "app/page.tsx" &&
    reference.resolvedSymbolId === "file:components/index.ts"
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "typescript-import" &&
    reference.symbolName === "PortalComponents" &&
    reference.file === "app/page.tsx" &&
    reference.resolvedSymbolId === "file:components/index.ts"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "IMPORTS_MODULE" &&
    relationship.from === "symbol:react:app/page.tsx" &&
    relationship.to === "file:components/shell.ts"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "IMPORTS_MODULE" &&
    relationship.from === "symbol:react:app/page.tsx" &&
    relationship.to === "file:components/WorkflowShell.tsx" &&
    /via components\/shell\.ts/u.test(relationship.evidence ?? "")
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "IMPORTS_MODULE" &&
    relationship.from === "symbol:react:app/page.tsx" &&
    relationship.to === "file:components/WorkflowShell.tsx" &&
    /via components\/index\.ts/u.test(relationship.evidence ?? "")
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "barrel-import" &&
    reference.file === "app/page.tsx" &&
    reference.resolvedSymbolId === "file:components/WorkflowShell.tsx"
  ));

  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "MAPS_ROUTE" &&
    relationship.from === "symbol:react:app/page.tsx:route:root" &&
    relationship.to === "symbol:react:app/page.tsx:component:HomePage"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "MAPS_ROUTE" &&
    relationship.from === "symbol:react:app/workflows/[workflowId]/page.tsx:route:path:workflows/:workflowId" &&
    relationship.to === "symbol:react:app/workflows/[workflowId]/page.tsx:component:WorkflowPage"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "MAPS_ROUTE" &&
    relationship.from === "symbol:react:pages/reports/[reportId].tsx:route:path:reports/:reportId" &&
    relationship.to === "symbol:react:pages/reports/[reportId].tsx:component:ReportPage"
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "react-route" &&
    reference.resolvedSymbolId === "route:react:/workflows/:workflowId"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "RENDERS_COMPONENT" &&
    relationship.from === "symbol:react:app/workflows/[workflowId]/page.tsx:component:WorkflowPage" &&
    relationship.to === "symbol:react:components/WorkflowShell.tsx:component:WorkflowShell"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "CALLS" &&
    relationship.from === "symbol:react:app/workflows/[workflowId]/page.tsx:component:WorkflowPage" &&
    relationship.to === "symbol:react:services/workflowClient.ts:function:fetchWorkflowSnapshot"
  ));
  assert.ok(result.references.some((reference) =>
    reference.context === "react-imported-call" &&
    reference.file === "app/workflows/[workflowId]/page.tsx" &&
    reference.resolvedSymbolId === "symbol:react:services/workflowClient.ts:function:fetchWorkflowSnapshot"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "CALLS_API_ROUTE" &&
    relationship.from === "symbol:react:services/workflowClient.ts:function:fetchWorkflowSnapshot" &&
    relationship.to === "route:web:/api/workflows/:param/snapshot"
  ));
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

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
