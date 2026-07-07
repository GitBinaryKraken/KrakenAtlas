import * as assert from "assert";
import * as path from "path";
import test from "node:test";
import { analyzeVanillaWeb } from "../src/analyzers/webAnalyzer";
import { scanWorkspaceFiles } from "../src/scanner/fileScanner";
import { pathExists } from "../test-support/webAnalyzerTestHelpers";

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
