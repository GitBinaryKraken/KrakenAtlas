import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import { renderContextPack } from "../src/context/agentContext";
import { renderAgentResponse } from "../src/format/agentFormatter";
import { withQueryService } from "../src/query/queryService";
import { rebuildProject } from "../src/rebuild/rebuildProject";
import { updateProject } from "../src/rebuild/updateProject";

test("rebuildProject writes agent-queryable map outputs", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const sourceFixture = path.join(projectRoot, "test-fixtures", "vanilla-web-simple");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-rebuild-"));
  await copyDirectory(sourceFixture, workspaceRoot);

  const result = await rebuildProject({
    extensionPath: projectRoot,
    workspaceRoot
  });

  const outputRoot = path.join(workspaceRoot, ".kraken-atlas");
  const manifest = JSON.parse(await fs.readFile(path.join(outputRoot, "manifest.json"), "utf8"));
  const project = JSON.parse(await fs.readFile(path.join(outputRoot, "project.json"), "utf8"));
  const relationships = await fs.readFile(path.join(outputRoot, "relationships.jsonl"), "utf8");
  const patterns = await fs.readFile(path.join(outputRoot, "patterns.jsonl"), "utf8");
  const agentReadme = await fs.readFile(path.join(outputRoot, "agent-readme.md"), "utf8");

  assert.strictEqual(result.fileCount > 0, true);
  assert.strictEqual(manifest.outputs.project, "project.json");
  assert.strictEqual(manifest.outputs.findings, "findings.jsonl");
  assert.ok(await fs.readFile(path.join(outputRoot, "findings.jsonl"), "utf8") !== undefined);
  assert.ok(project.projectTypes.includes("vanilla-js"));
  assert.match(relationships, /LOADS_SCRIPT/);
  assert.match(patterns, /pattern:web:vanilla-js-dom-event/);
  assert.match(agentReadme, /Use it before opening broad source files/);
  assert.match(agentReadme, /Kraken Atlas: Export Context Pack/);
});

test("search treats filename-shaped queries as exact map lookups", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const sourceFixture = path.join(projectRoot, "test-fixtures", "vanilla-web-simple");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-exact-file-"));
  await copyDirectory(sourceFixture, workspaceRoot);
  await rebuildProject({ extensionPath: projectRoot, workspaceRoot });

  await withQueryService(workspaceRoot, (service) => {
    const present = service.search("Edit.cshtml");
    const absent = service.search(".tmp_map_page.html");
    assert.match(present.answer, /exact indexed file match/);
    assert.ok(present.files.some((file) => file.endsWith("Edit.cshtml")));
    assert.strictEqual(absent.answer, 'No exact indexed file match for ".tmp_map_page.html".');
    assert.deepStrictEqual(absent.files, []);
    assert.ok(absent.evidence.some((item) => item.recordType === "exactFileSearch" && item.found === false));
  });
});

test("validation context packs exclude unrelated rendering and browser-state edges", () => {
  const pack = renderContextPack({
    query: "add validation to composable location editing",
    answer: "Likely edit locations.",
    confidence: 0.5,
    files: ["Adapters/LocationAdapter.cs"], symbols: [], patterns: [], flow: [], nextQueries: [],
    evidence: [{ recordType: "fileRecommendation", file: "Adapters/LocationAdapter.cs", score: 10, reasons: ["Search match."] }],
    relationships: [
      { type: "READS_QUERY_STRING", from: "js:map", to: "query:location", file: "wwwroot/map.js" },
      { type: "RENDERS_VIEW", from: "component:aside", to: "file:Views/Aside.cshtml", file: "Components/Aside.cs" }
    ],
    estimatedContextSavings: "Returns graph records and line ranges instead of full source files."
  });

  assert.match(pack, /No direct validation\/auth relationship evidence was found/);
  assert.doesNotMatch(pack, /READS_QUERY_STRING:/);
  assert.doesNotMatch(pack, /RENDERS_VIEW:/);
});

test("updateProject skips unchanged maps and partially refreshes vanilla web changes", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const sourceFixture = path.join(projectRoot, "test-fixtures", "vanilla-web-simple");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-update-"));
  await copyDirectory(sourceFixture, workspaceRoot);

  await rebuildProject({
    extensionPath: projectRoot,
    workspaceRoot
  });

  const skipped = await updateProject({
    extensionPath: projectRoot,
    workspaceRoot
  });

  assert.strictEqual(skipped.mode, "skipped");
  assert.deepStrictEqual(skipped.changedFiles, []);

  await fs.appendFile(path.join(workspaceRoot, "wwwroot", "js", "user-form.js"), "\nfetch(\"/api/users/audit\");\n", "utf8");

  const updated = await updateProject({
    extensionPath: projectRoot,
    workspaceRoot
  });
  const relationships = await fs.readFile(path.join(workspaceRoot, ".kraken-atlas", "relationships.jsonl"), "utf8");

  assert.strictEqual(updated.mode, "partial");
  assert.deepStrictEqual(updated.changedFiles, ["wwwroot/js/user-form.js"]);
  assert.match(relationships, /\/api\/users\/audit/);
});

test("realistic .NET feature-flow fixture supports flow and where-to-add queries", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const sourceFixture = path.join(projectRoot, "test-fixtures", "dotnet-feature-flow");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-feature-flow-"));
  await copyDirectory(sourceFixture, workspaceRoot);

  await rebuildProject({
    extensionPath: projectRoot,
    workspaceRoot
  });

  await withQueryService(workspaceRoot, (service) => {
    const flow = service.findFlow("user preferences");
    const whereToAdd = service.whereToAdd("add user preference field");
    const whereToAddContextPack = renderContextPack(whereToAdd);
    const badgeFlow = service.findFlow("badge");
    const badgeWhereToAdd = service.whereToAdd("add badge field");
    const interfaceMethodRelationships = service.findRelationships("symbol:csharp:DotnetFeatureFlow.Services.IBadgeManagementService.SaveLocationBadgeAsync(DotnetFeatureFlow.Services.BadgeForm)");
    const repositoryRelationships = service.findRelationships("UserPreferencesRepository");
    const dbContextRelationships = service.findRelationships("ApplicationDbContext");
    const dataAccessPattern = service.findPatterns("ef data access");
    const repositoryDataFlowPattern = service.findPatterns("repository data");
    const validationAuthPattern = service.findPatterns("validation");
    const hostedServicePattern = service.findPatterns("hosted");
    const middlewarePattern = service.findPatterns("middleware");
    const requestHandlerPattern = service.findPatterns("handler");
    const persistWhereToAdd = service.whereToAdd("persist preference field");
    const validationWhereToAdd = service.whereToAdd("add validation for preference request");
    const backgroundWhereToAdd = service.whereToAdd("add background preference digest");
    const middlewareWhereToAdd = service.whereToAdd("add preference middleware audit");
    const handlerWhereToAdd = service.whereToAdd("add preference request handler");
    const optionsRelationships = service.findRelationships("UserPreferenceOptions");
    const optionsConfigRelationships = service.findRelationships("config:csharp:UserPreferences");
    const validatorRelationships = service.findRelationships("UserPreferenceRequestValidator");
    const authRelationships = service.findRelationships("CanEditPreferences");
    const workerRelationships = service.findRelationships("PreferenceDigestWorker");
    const middlewareRelationships = service.findRelationships("PreferenceAuditMiddleware");
    const npgsqlRelationships = service.findRelationships("UseNpgsql");
    const handlerRelationships = service.findRelationships("PreviewPreferenceHandler");
    const optionsPattern = service.findPatterns("options");
    const settingWhereToAdd = service.whereToAdd("add preference setting");

    assert.ok(flow.files.includes("Views/UserPreferences/Edit.cshtml"));
    assert.ok(flow.files.includes("wwwroot/js/user-preferences.js"));
    assert.ok(flow.files.includes("Controllers/UserPreferencesController.cs"));
    assert.ok(flow.files.includes("Services/UserPreferencesService.cs"));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "POSTS_TO"));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "CALLS" && String(relationship.file).includes("Services/")));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "CALLS_REPOSITORY"));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "QUERIES"));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "WRITES"));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "USES_OPTIONS"));
    assert.ok(whereToAdd.evidence.some((item) => item.recordType === "fileRecommendation" && item.file === "Views/UserPreferences/Edit.cshtml"));
    assert.ok(whereToAdd.files.includes("Services/UserPreferencesService.cs"));
    assert.match(whereToAddContextPack, /## File Recommendations/);
    assert.match(whereToAddContextPack, /Views\/UserPreferences\/Edit\.cshtml/);
    assert.match(whereToAddContextPack, /Stop expanding once the listed evidence answers the immediate coding task/);
    assert.ok(settingWhereToAdd.files.includes("Options/UserPreferenceOptions.cs"));
    assert.ok(settingWhereToAdd.files.includes("Program.cs"));
    assert.ok(settingWhereToAdd.files.includes("Services/UserPreferencesService.cs"));
    assert.ok(persistWhereToAdd.files.includes("Data/UserPreference.cs"));
    assert.ok(persistWhereToAdd.files.includes("Data/ApplicationDbContext.cs"));
    assert.ok(persistWhereToAdd.files.includes("Repositories/UserPreferencesRepository.cs"));
    assert.ok(persistWhereToAdd.files.includes("Services/UserPreferencesService.cs"));
    assert.ok(validationWhereToAdd.files.includes("Validation/UserPreferenceRequestValidator.cs"));
    assert.ok(validationWhereToAdd.files.includes("Services/UserPreferencesService.cs"));
    assert.ok(validationWhereToAdd.files.includes("Controllers/UserPreferencesController.cs"));
    if (validationWhereToAdd.files.includes("Program.cs")) {
      assert.ok(validationWhereToAdd.files.indexOf("Validation/UserPreferenceRequestValidator.cs") < validationWhereToAdd.files.indexOf("Program.cs"));
      assert.ok(validationWhereToAdd.files.indexOf("Controllers/UserPreferencesController.cs") < validationWhereToAdd.files.indexOf("Program.cs"));
    }
    assert.ok(backgroundWhereToAdd.files.includes("Background/PreferenceDigestWorker.cs"));
    assert.ok(middlewareWhereToAdd.files.includes("Middleware/PreferenceAuditMiddleware.cs"));
    assert.ok(handlerWhereToAdd.files.includes("Handlers/PreviewPreferenceHandler.cs"));
    assert.ok(badgeFlow.files.includes("Pages/Badges.cshtml"));
    assert.ok(badgeFlow.files.includes("Pages/Badges.cshtml.cs"));
    assert.ok(badgeFlow.files.includes("Services/BadgeManagementService.cs"));
    assert.ok(badgeFlow.relationships.some((relationship) => relationship.type === "POSTS_TO" && relationship.to === "route:razor-page-handler:Badges.SaveLocationBadge"));
    assert.ok(badgeFlow.relationships.some((relationship) => relationship.type === "MAPS_ROUTE" && relationship.to === "route:razor-page-handler:Badges.SaveLocationBadge"));
    assert.ok(!badgeFlow.files.includes("Views/UserPreferences/Edit.cshtml"));
    assert.ok(badgeWhereToAdd.files.indexOf("Pages/Badges.cshtml") < badgeWhereToAdd.files.indexOf("Services/UserPreferencesService.cs") || !badgeWhereToAdd.files.includes("Services/UserPreferencesService.cs"));
    assert.ok(interfaceMethodRelationships.relationships.some((relationship) => relationship.from === "symbol:csharp:DotnetFeatureFlow.Services.BadgeManagementService.SaveLocationBadgeAsync(DotnetFeatureFlow.Services.BadgeForm)"));
    assert.ok(repositoryRelationships.relationships.some((relationship) => relationship.type === "USES_DBSET" && relationship.to === "symbol:csharp:DotnetFeatureFlow.Data.ApplicationDbContext.UserPreferences"));
    assert.ok(repositoryRelationships.relationships.some((relationship) => relationship.type === "QUERIES" && relationship.to === "symbol:csharp:DotnetFeatureFlow.Data.ApplicationDbContext.UserPreferences"));
    assert.ok(repositoryRelationships.relationships.some((relationship) => relationship.type === "WRITES" && relationship.to === "symbol:csharp:DotnetFeatureFlow.Data.ApplicationDbContext.UserPreferences"));
    assert.ok(repositoryRelationships.relationships.some((relationship) => relationship.type === "CALLS_REPOSITORY" && relationship.to === "symbol:csharp:DotnetFeatureFlow.Repositories.IUserPreferencesRepository.GetPreference(Guid)"));
    assert.ok(dbContextRelationships.relationships.some((relationship) => relationship.type === "DBSET_FOR" && relationship.to === "symbol:csharp:DotnetFeatureFlow.Data.UserPreference"));
    assert.ok(dataAccessPattern.patterns.some((pattern) => pattern.id === "pattern:dotnet:ef-data-access"));
    assert.ok(repositoryDataFlowPattern.patterns.some((pattern) => pattern.id === "pattern:dotnet:repository-data-flow"));
    assert.ok(validationAuthPattern.patterns.some((pattern) => pattern.id === "pattern:dotnet:validation-auth"));
    assert.ok(hostedServicePattern.patterns.some((pattern) => pattern.id === "pattern:dotnet:hosted-service"));
    assert.ok(middlewarePattern.patterns.some((pattern) => pattern.id === "pattern:dotnet:middleware-pipeline"));
    assert.ok(requestHandlerPattern.patterns.some((pattern) => pattern.id === "pattern:dotnet:request-handler"));
    assert.ok(validatorRelationships.relationships.some((relationship) => relationship.type === "VALIDATES" && relationship.to === "symbol:csharp:DotnetFeatureFlow.Services.UserPreferenceRequest"));
    assert.ok(validatorRelationships.relationships.some((relationship) => relationship.type === "REGISTERS" && relationship.from === "symbol:csharp:DotnetFeatureFlow.Validation.UserPreferenceRequestValidator"));
    assert.ok(authRelationships.relationships.some((relationship) => relationship.type === "REQUIRES_AUTH" && relationship.to === "auth:csharp:policy:CanEditPreferences"));
    assert.ok(workerRelationships.relationships.some((relationship) => relationship.type === "RUNS_HOSTED_SERVICE" && relationship.to === "symbol:csharp:DotnetFeatureFlow.Background.PreferenceDigestWorker"));
    assert.ok(middlewareRelationships.relationships.some((relationship) => relationship.type === "USES_MIDDLEWARE" && relationship.to === "symbol:csharp:DotnetFeatureFlow.Middleware.PreferenceAuditMiddleware"));
    assert.ok(!npgsqlRelationships.relationships.some((relationship) => relationship.type === "USES_MIDDLEWARE"));
    assert.ok(handlerRelationships.relationships.some((relationship) => relationship.type === "HANDLES_REQUEST" && relationship.to === "symbol:csharp:DotnetFeatureFlow.Handlers.PreviewPreferenceRequest"));
    assert.ok(optionsRelationships.relationships.some((relationship) => relationship.type === "BINDS_OPTIONS" && relationship.to === "symbol:csharp:DotnetFeatureFlow.Options.UserPreferenceOptions"));
    assert.ok(optionsRelationships.relationships.some((relationship) => relationship.type === "USES_OPTIONS" && relationship.to === "symbol:csharp:DotnetFeatureFlow.Options.UserPreferenceOptions"));
    assert.ok(optionsConfigRelationships.relationships.some((relationship) => relationship.type === "USES_CONFIG_KEY" && relationship.to === "config:csharp:UserPreferences"));
    assert.ok(optionsPattern.patterns.some((pattern) => pattern.id === "pattern:dotnet:options-config"));
  });
});

test("Kelp multi-project fixture produces shared-contract context focus", async (t) => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const workspaceRoot = path.resolve(projectRoot, "..", "test-projects");
  const requiredProjects = ["Kelp2025_WebUI", "KelpApi", "KelpApiDomain", "KelpApiLogicLayer"];
  for (const project of requiredProjects) {
    if (!await pathExists(path.join(workspaceRoot, project))) {
      t.skip("Kelp sibling test-projects corpus is not present.");
      return;
    }
  }

  const result = await rebuildProject({
    extensionPath: projectRoot,
    workspaceRoot
  });

  assert.ok(result.fileCount > 100);
  assert.ok((result.scanSummary?.excludedByReason["directory:bin"] ?? 0) > 0);
  assert.ok((result.scanSummary?.excludedByReason["directory:obj"] ?? 0) > 0);

  await withQueryService(workspaceRoot, (service) => {
    const plan = service.planChange("add meta description to page draft");
    const contextPack = renderContextPack(plan, { workspaceRoot });
    const pruning = plan.evidence.find((item) => item.recordType === "contextPruning");
    const boundaries = plan.evidence.filter((item) => item.recordType === "sharedContractBoundary");
    const domainRecommendation = plan.evidence.find((item) =>
      item.recordType === "fileRecommendation" &&
      item.file === "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs"
    );
    const domainRoles = Array.isArray(domainRecommendation?.symbolRoles) ? domainRecommendation.symbolRoles : [];
    const domainMembers = Array.isArray(domainRecommendation?.memberHints)
      ? domainRecommendation.memberHints as Array<Record<string, unknown>>
      : [];

    assert.ok(plan.files.includes("KelpApiDomain/ViewModels/Pages/PageDraftModels.cs"));
    assert.ok(plan.files.includes("Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs"));
    assert.ok(boundaries.some((boundary) =>
      Array.isArray(boundary.projects) &&
      boundary.projects.includes("KelpApiDomain") &&
      boundary.projects.includes("Kelp2025_WebUI")
    ));
    assert.ok(pruning);
    assert.ok(Number(pruning?.keptRelationshipCount) < Number(pruning?.originalRelationshipCount));
    assert.ok(!plan.relationships.some((relationship) => String(relationship.file).includes("Areas/Identity/Pages/Account/ExternalLogin")));
    assert.strictEqual((domainRecommendation?.projectHint as Record<string, unknown> | undefined)?.project, "KelpApiDomain");
    assert.ok(domainRoles.includes("request-dto"));
    assert.ok(domainMembers.some((member) => member.name === "MetaDescription"));
    assert.match(contextPack, /## Context Focus/);
    assert.match(contextPack, /Tags: .*page-draft/);
    assert.match(contextPack, /Shared Contract Checklist/);
    assert.match(contextPack, /Guidance: project KelpApiDomain; roles .*request-dto/);
  }, { projectContext: "Kelp2025_WebUI" });
});

test("Razor carousel fixture supports cross-language editor flow queries", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const sourceFixture = path.join(projectRoot, "test-fixtures", "razor-carousel-feature");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-carousel-flow-"));
  await copyDirectory(sourceFixture, workspaceRoot);

  await rebuildProject({
    extensionPath: projectRoot,
    workspaceRoot
  });

  await withQueryService(workspaceRoot, (service) => {
    const whereToAdd = service.whereToAdd("make image carousels editable in the composable editor");
    const flow = service.findFlow("image carousel rendering and editing");
    const relationships = service.findRelationships("Views/Shared/ComposableContent/_EditorShell.cshtml");
    const componentRelationships = service.findRelationships("CarouselViewComponent");
    const flowContextPack = renderContextPack(flow, { workspaceRoot });

    assert.ok(whereToAdd.files.includes("Views/Shared/ComposableContent/_EditorShell.cshtml"));
    assert.ok(whereToAdd.files.includes("Components/PageParts/CarouselViewComponent.cs") || whereToAdd.files.includes("Views/Shared/Components/Carousel/Default.cshtml"));
    assert.match(whereToAdd.answer, /Existing implementation evidence found/);
    assert.ok(whereToAdd.evidence.some((item) => item.recordType === "capabilityAssessment"));
    assert.ok(flow.files.includes("Views/Shared/ComposableContent/_EditorShell.cshtml"));
    assert.ok(flow.files.includes("Components/PageParts/CarouselViewComponent.cs"));
    assert.ok(flow.files.includes("Views/Shared/Components/Carousel/Default.cshtml"));
    assert.ok(flow.files.includes("KelpApiDomain/PageMediaBlockConfig.cs"));
    assert.ok(flow.files.includes("Services/ComposableContent/PageComposableContentEditorAdapter.cs"));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "WRITES_FIELD" && String(relationship.to).includes("ConfigJson")));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "BINDS_MODEL_PROPERTY" && String(relationship.to).includes("Parts[].ConfigJson")));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "MAPS_PROPERTY" && String(relationship.evidence).includes("ConfigJson = part.ConfigJson")));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "SELECTS_ELEMENT" && String(relationship.evidence).includes("data-carousel-field")));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "INVOKES_VIEW_COMPONENT" && relationship.to === "symbol:csharp:CarouselViewComponent"));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "RENDERS_VIEW" && relationship.to === "file:Views/Shared/Components/Carousel/Default.cshtml"));
    assert.ok(relationships.relationships.some((relationship) => relationship.type === "WRITES_FIELD"));
    assert.ok(componentRelationships.relationships.some((relationship) => relationship.type === "RENDERS_VIEW"));
    assert.ok(componentRelationships.relationships.some((relationship) => relationship.type === "RENDERS_VIEW" && String(relationship.file).includes("CarouselViewComponent.cs")));
    assert.match(flowContextPack, /## Evidence Excerpts/);
    assert.match(flowContextPack, /data-carousel-field/);
    assert.match(flowContextPack, /ConfigJson/);
    assert.match(flowContextPack, /Views\/Shared\/Components\/Carousel\/Default\.cshtml:1/);
    assert.match(flowContextPack, /@model KelpApiDomain\.PageMediaBlockConfig/);
  });
});

test("JavaScript controller fixture returns an ordered click-to-selection-to-highlight flow", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const sourceFixture = path.join(projectRoot, "test-fixtures", "javascript-controller-flow");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-js-controller-flow-"));
  await copyDirectory(sourceFixture, workspaceRoot);
  await rebuildProject({ extensionPath: projectRoot, workspaceRoot });

  await withQueryService(workspaceRoot, (service) => {
    const flow = service.findFlow("search result selection map highlight");
    const output = renderAgentResponse(flow);
    assert.ok(flow.files.includes("wwwroot/js/explorer.js"));
    assert.ok(flow.files.includes("wwwroot/js/search-controller.js"));
    assert.ok(flow.files.includes("wwwroot/js/map-controller.js"));
    assert.ok(flow.relationships.some((edge) => edge.type === "CALLS" && /selectResult/u.test(String(edge.evidence))));
    assert.ok(flow.relationships.some((edge) => edge.type === "CALLS" && /selectItem/u.test(String(edge.evidence))));
    assert.ok(flow.relationships.some((edge) => edge.type === "CALLS" && /focusItem/u.test(String(edge.evidence))));
    assert.ok(flow.relationships.some((edge) => edge.type === "EMITS_EVENT" && edge.to === "event:javascript:selectionChange"));
    assert.ok(flow.relationships.some((edge) => edge.type === "SUBSCRIBES_EVENT" && edge.to === "event:javascript:selectionChange"));
    assert.ok(flow.relationships.some((edge) => edge.type === "UPDATES_ELEMENT_STATE"));
    assert.match(output, /wwwroot\/js\/map-controller\.js/);
    assert.ok(output.indexOf("selectResult") < output.indexOf("selectItem"));
    assert.ok(output.indexOf("selectItem") < output.indexOf("EMITS_EVENT"));
  });
});

test("ReactAgentDashboard fixture rebuilds into queryable React map facts", async (t) => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const sourceFixture = path.resolve(projectRoot, "..", "test-projects", "ReactAgentDashboard");
  if (!await pathExists(sourceFixture)) {
    t.skip("ReactAgentDashboard sibling test-projects fixture is not present.");
    return;
  }

  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-react-dashboard-"));
  await copyDirectory(sourceFixture, workspaceRoot);
  await rebuildProject({ extensionPath: projectRoot, workspaceRoot });

  const project = JSON.parse(await fs.readFile(path.join(workspaceRoot, ".kraken-atlas", "project.json"), "utf8"));
  const patterns = await fs.readFile(path.join(workspaceRoot, ".kraken-atlas", "patterns.jsonl"), "utf8");

  assert.ok(project.projectTypes.includes("react"));
  assert.ok(project.projectTypes.includes("typescript"));
  assert.ok(!project.projectTypes.includes("aspnet-core"));
  assert.ok(!project.projectTypes.includes("vanilla-js"));
  assert.match(patterns, /pattern:react:component-composition/);
  assert.match(patterns, /pattern:react:hook-context-flow/);
  assert.match(patterns, /pattern:react:state-store-flow/);
  assert.match(patterns, /pattern:react:route-api-flow/);

  await withQueryService(workspaceRoot, (service) => {
    const relationships = service.findRelationships("DashboardPage");
    const propsRelationships = service.findRelationships("ProjectCardProps");
    const toolbarRelationships = service.findRelationships("ProjectToolbar");
    const storeRelationships = service.findRelationships("useProjectSelectionStore");
    const patternMap = service.findPatternMap();

    assert.ok(relationships.files.includes("src/pages/DashboardPage.tsx"));
    assert.ok(relationships.relationships.some((relationship) => relationship.type === "MAPS_ROUTE"));
    assert.ok(relationships.relationships.some((relationship) => relationship.type === "RENDERS_COMPONENT"));
    assert.ok(relationships.relationships.some((relationship) => relationship.type === "PASSES_PROP"));
    assert.ok(relationships.relationships.some((relationship) =>
      relationship.type === "MAPS_ROUTE" &&
      relationship.from === "symbol:react:src/routes.ts:route:data-dashboard"
    ));
    assert.ok(toolbarRelationships.files.includes("src/components/ProjectToolbar.tsx"));
    assert.ok(toolbarRelationships.relationships.some((relationship) =>
      relationship.type === "RENDERS_COMPONENT" &&
      relationship.to === "symbol:react:src/components/ProjectToolbar.tsx:component:ProjectToolbarSearchInput"
    ));
    assert.ok(toolbarRelationships.relationships.some((relationship) =>
      relationship.type === "DECLARES_PROP" &&
      relationship.to === "symbol:react:src/components/ProjectToolbar.tsx:props:ProjectToolbarProps.resultCount"
    ));
    assert.ok(relationships.evidence.some((item) =>
      item.recordType === "nodeRoleSummary" &&
      Array.isArray(item.roles) &&
      item.roles.some((role) => typeof role === "object" && role !== null && (role as { role?: unknown }).role === "react-component")
    ));
    assert.ok(propsRelationships.files.includes("src/components/ProjectCard.tsx"));
    assert.ok(propsRelationships.relationships.some((relationship) =>
      relationship.type === "HAS_MEMBER" &&
      typeof relationship.to === "string" &&
      relationship.to.endsWith(".onOpenProject")
    ));
    assert.ok(propsRelationships.relationships.some((relationship) =>
      relationship.type === "DECLARES_PROP" &&
      typeof relationship.to === "string" &&
      relationship.to.endsWith(".onOpenProject")
    ));
    assert.ok(propsRelationships.evidence.some((item) =>
      item.recordType === "nodeMemberSummary" &&
      Array.isArray(item.members) &&
      item.members.some((member) => typeof member === "object" && member !== null && (member as { name?: unknown }).name === "project")
    ));
    assert.ok(storeRelationships.files.includes("src/stores/useProjectSelectionStore.ts"));
    assert.ok(storeRelationships.relationships.some((relationship) => relationship.type === "USES_STORE"));
    assert.ok(storeRelationships.evidence.some((item) =>
      item.recordType === "nodeRoleSummary" &&
      Array.isArray(item.roles) &&
      item.roles.some((role) => typeof role === "object" && role !== null && (role as { role?: unknown }).role === "state-store")
    ));
    assert.ok(patternMap.patterns.some((pattern) => pattern.id === "pattern:react:component-composition"));
    assert.ok(patternMap.patterns.some((pattern) => pattern.id === "pattern:react:hook-context-flow"));
    assert.ok(patternMap.patterns.some((pattern) => pattern.id === "pattern:react:state-store-flow"));
    assert.ok(patternMap.patterns.some((pattern) => pattern.id === "pattern:react:route-api-flow"));
  });
});

test("ReactWorkflowBoard fixture rebuilds into queryable route and store map facts", async (t) => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const sourceFixture = path.resolve(projectRoot, "..", "test-projects", "ReactWorkflowBoard");
  if (!await pathExists(sourceFixture)) {
    t.skip("ReactWorkflowBoard sibling test-projects fixture is not present.");
    return;
  }

  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-react-workflow-"));
  await copyDirectory(sourceFixture, workspaceRoot);
  await rebuildProject({ extensionPath: projectRoot, workspaceRoot });

  const project = JSON.parse(await fs.readFile(path.join(workspaceRoot, ".kraken-atlas", "project.json"), "utf8"));
  const patterns = await fs.readFile(path.join(workspaceRoot, ".kraken-atlas", "patterns.jsonl"), "utf8");

  assert.ok(project.projectTypes.includes("react"));
  assert.ok(project.projectTypes.includes("typescript"));
  assert.match(patterns, /pattern:react:state-store-flow/);
  assert.match(patterns, /pattern:react:route-api-flow/);

  await withQueryService(workspaceRoot, (service) => {
    const workspaceRelationships = service.findRelationships("WorkspacePage");
    const storeRelationships = service.findRelationships("useWorkflowStore");
    const summaryPropsRelationships = service.findRelationships("WorkflowSummaryProps");
    const patternMap = service.findPatternMap();

    assert.ok(workspaceRelationships.files.includes("src/pages/WorkspacePage.tsx"));
    assert.ok(workspaceRelationships.relationships.some((relationship) => relationship.type === "MAPS_ROUTE"));
    assert.ok(workspaceRelationships.relationships.some((relationship) => relationship.type === "USES_STORE"));
    assert.ok(storeRelationships.files.includes("src/state/useWorkflowStore.ts"));
    assert.ok(storeRelationships.relationships.some((relationship) => relationship.type === "USES_STORE"));
    assert.ok(storeRelationships.evidence.some((item) =>
      item.recordType === "nodeRoleSummary" &&
      Array.isArray(item.roles) &&
      item.roles.some((role) => typeof role === "object" && role !== null && (role as { role?: unknown }).role === "state-store")
    ));
    assert.ok(summaryPropsRelationships.files.includes("src/components/WorkflowSummary.tsx"));
    assert.ok(summaryPropsRelationships.relationships.some((relationship) =>
      relationship.type === "HAS_MEMBER" &&
      relationship.to === "symbol:react:src/components/WorkflowSummary.tsx:props:WorkflowSummaryProps.onClearSelection"
    ));
    assert.ok(summaryPropsRelationships.evidence.some((item) =>
      item.recordType === "nodeMemberSummary" &&
      Array.isArray(item.members) &&
      item.members.some((member) => typeof member === "object" && member !== null && (member as { name?: unknown }).name === "blockedCount")
    ));
    assert.ok(patternMap.patterns.some((pattern) => pattern.id === "pattern:react:state-store-flow"));
  });
});

test("ReactNextPortal fixture rebuilds Next-style file routes into queryable map facts", async (t) => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const sourceFixture = path.resolve(projectRoot, "..", "test-projects", "ReactNextPortal");
  if (!await pathExists(sourceFixture)) {
    t.skip("ReactNextPortal sibling test-projects fixture is not present.");
    return;
  }

  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-react-next-"));
  await copyDirectory(sourceFixture, workspaceRoot);
  await rebuildProject({ extensionPath: projectRoot, workspaceRoot });

  const project = JSON.parse(await fs.readFile(path.join(workspaceRoot, ".kraken-atlas", "project.json"), "utf8"));
  const patterns = await fs.readFile(path.join(workspaceRoot, ".kraken-atlas", "patterns.jsonl"), "utf8");

  assert.ok(project.projectTypes.includes("react"));
  assert.ok(project.projectTypes.includes("typescript"));
  assert.match(patterns, /pattern:react:component-composition/);
  assert.match(patterns, /pattern:react:route-api-flow/);

  await withQueryService(workspaceRoot, (service) => {
    const homeRelationships = service.findRelationships("app/page.tsx");
    const workflowRelationships = service.findRelationships("WorkflowPage");
    const workflowPropsRelationships = service.findRelationships("WorkflowPageProps");
    const reportRelationships = service.findRelationships("ReportPage");
    const barrelRelationships = service.findRelationships("components/index.ts");
    const shellRelationships = service.findRelationships("WorkflowShell");
    const badgeRelationships = service.findRelationships("InteractiveWorkflowBadge");
    const actionRelationships = service.findRelationships("saveWorkflowDecision");
    const routeHandlerRelationships = service.findRelationships("app/api/workflows/[workflowId]/decision/route.ts");

    assert.ok(homeRelationships.relationships.some((relationship) =>
      relationship.type === "IMPORTS_MODULE" &&
      relationship.to === "file:components/WorkflowShell.tsx"
    ));
    assert.ok(workflowRelationships.files.includes("app/workflows/[workflowId]/page.tsx"));
    assert.ok(workflowRelationships.relationships.some((relationship) =>
      relationship.type === "MAPS_ROUTE" &&
      relationship.from === "symbol:react:app/workflows/[workflowId]/page.tsx:route:path:workflows/:workflowId"
    ));
    assert.ok(workflowRelationships.relationships.some((relationship) =>
      relationship.type === "CALLS" &&
      relationship.to === "symbol:react:services/workflowClient.ts:function:fetchWorkflowSnapshot"
    ));
    assert.ok(workflowRelationships.relationships.some((relationship) =>
      relationship.type === "RENDERS_COMPONENT" &&
      relationship.to === "symbol:react:components/WorkflowShell.tsx:component:WorkflowShell"
    ));
    assert.ok(workflowPropsRelationships.relationships.some((relationship) =>
      relationship.type === "HAS_MEMBER" &&
      relationship.to === "symbol:react:app/workflows/[workflowId]/page.tsx:props:WorkflowPageProps.params.workflowId"
    ));
    assert.ok(workflowPropsRelationships.evidence.some((item) =>
      item.recordType === "nodeMemberSummary" &&
      Array.isArray(item.members) &&
      item.members.some((member) => typeof member === "object" && member !== null && (member as { name?: unknown }).name === "params.workflowId")
    ));
    assert.ok(reportRelationships.relationships.some((relationship) =>
      relationship.type === "MAPS_ROUTE" &&
      relationship.from === "symbol:react:pages/reports/[reportId].tsx:route:path:reports/:reportId"
    ));
    assert.ok(barrelRelationships.relationships.some((relationship) =>
      relationship.type === "RE_EXPORTS_MODULE" &&
      relationship.to === "file:components/WorkflowShell.tsx"
    ));
    assert.ok(shellRelationships.files.includes("components/WorkflowShell.tsx"));
    assert.ok(shellRelationships.relationships.some((relationship) =>
      relationship.type === "DECLARES_PROP" &&
      relationship.to === "symbol:react:components/WorkflowShell.tsx:props:WorkflowShellProps.mode"
    ));
    assert.ok(shellRelationships.evidence.some((item) =>
      item.recordType === "nodeMemberSummary" &&
      Array.isArray(item.members) &&
      item.members.some((member) => typeof member === "object" && member !== null && (member as { name?: unknown }).name === "mode")
    ));
    assert.ok(badgeRelationships.relationships.some((relationship) =>
      relationship.type === "DECLARES_PROP" &&
      relationship.to === "symbol:react:components/InteractiveWorkflowBadge.tsx:props:InteractiveWorkflowBadgeProps.status"
    ));
    assert.ok(badgeRelationships.evidence.some((item) =>
      item.recordType === "nodeRoleSummary" &&
      Array.isArray(item.roles) &&
      item.roles.some((role) => typeof role === "object" && role !== null && (role as { role?: unknown }).role === "client-component")
    ));
    assert.ok(actionRelationships.relationships.some((relationship) =>
      relationship.type === "CALLS_API_ROUTE" &&
      relationship.to === "route:web:/api/workflows/:param/decision"
    ));
    assert.ok(actionRelationships.evidence.some((item) =>
      item.recordType === "nodeRoleSummary" &&
      Array.isArray(item.roles) &&
      item.roles.some((role) => typeof role === "object" && role !== null && (role as { role?: unknown }).role === "server-action")
    ));
    assert.ok(routeHandlerRelationships.relationships.some((relationship) =>
      relationship.type === "MAPS_ROUTE" &&
      relationship.to === "symbol:react:app/api/workflows/[workflowId]/decision/route.ts:function:POST"
    ));
  });
});

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectory(source: string, destination: string): Promise<void> {
  await fs.mkdir(destination, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.name === ".kraken-atlas" || entry.name === "node_modules" || entry.name === "dist" || entry.name === ".vite") {
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
