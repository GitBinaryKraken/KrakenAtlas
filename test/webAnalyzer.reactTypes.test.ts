import * as assert from "assert";
import * as path from "path";
import test from "node:test";
import { analyzeVanillaWeb } from "../src/analyzers/webAnalyzer";
import { scanWorkspaceFiles } from "../src/scanner/fileScanner";
import { pathExists } from "../test-support/webAnalyzerTestHelpers";

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
