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

async function copyDirectory(source: string, destination: string): Promise<void> {
  await fs.mkdir(destination, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.name === ".kraken-atlas") {
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
