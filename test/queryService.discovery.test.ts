import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import { renderContextPack } from "../src/context/agentContext";
import { renderAgentResponse } from "../src/format/agentFormatter";
import { FileRecord, PatternRecord, ReferenceRecord, RelationshipRecord, SymbolRecord } from "../src/model/records";
import { buildContextPruningResult } from "../src/query/queryContextPruning";
import { QueryService } from "../src/query/queryService";
import type { FileRecommendation } from "../src/query/whereToAddRanking";
import { openSqliteIndex, rebuildSqliteIndex } from "../src/storage/sqliteIndex";
import { fileRecord, range, stringValue } from "../test-support/queryTestHelpers";

test("search diversifies repeated hits from the same file", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-search-ranking-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const files: FileRecord[] = [
    fileRecord("Web/Controllers/ProfileControllerBase.cs"),
    fileRecord("Web/Data/DatabaseConnectionContext.cs"),
    fileRecord("Web/Config/ConnectionStrings.json"),
    fileRecord("Web/Services/ProfileDatabaseService.cs")
  ];
  const symbols: SymbolRecord[] = [
    ...["EditDocument", "RemovePart", "TryParseIndex", "ResolveRequest", "NormalizeRegion", "InsertPart"].map((name) => ({
      recordType: "symbol" as const,
      id: `symbol:csharp:Web.Controllers.ProfileControllerBase.${name}(string)`,
      name,
      fullyQualifiedName: `Web.Controllers.ProfileControllerBase.${name}`,
      kind: "method",
      language: "csharp",
      file: "Web/Controllers/ProfileControllerBase.cs",
      range: range(),
      summary: "database connection string helper",
      confidence: 1
    })),
    {
      recordType: "symbol",
      id: "symbol:csharp:Web.Services.ProfileDatabaseService",
      name: "ProfileDatabaseService",
      fullyQualifiedName: "Web.Services.ProfileDatabaseService",
      kind: "class",
      language: "csharp",
      file: "Web/Services/ProfileDatabaseService.cs",
      range: range(),
      summary: "database connection string",
      confidence: 1
    }
  ];

  await rebuildSqliteIndex(indexPath, { files, symbols, relationships: [], references: [], patterns: [] });
  const database = await openSqliteIndex(indexPath);
  try {
    const result = new QueryService(database, { projectContext: "Web" }).search("connection string database");

    assert.ok(result.files.includes("Web/Config/ConnectionStrings.json"));
    assert.ok(result.files.includes("Web/Data/DatabaseConnectionContext.cs"));
    assert.ok(result.files.includes("Web/Services/ProfileDatabaseService.cs"));
    assert.ok(result.evidence.slice(0, 6).filter((item) => item.path === "Web/Controllers/ProfileControllerBase.cs").length <= 2);

    const weakResult = new QueryService(database, { projectContext: "Web" }).search("connection string missingterm");
    assert.ok(weakResult.confidence <= 0.4);
    assert.ok(weakResult.evidence.some((item) => item.recordType === "caveat" && /Search hits are weak/.test(stringValue(item.message))));
  } finally {
    database.close();
  }
});
test("references use connected graph evidence when semantic reference rows are empty", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-reference-fallback-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const files: FileRecord[] = [
    fileRecord("Views/Shared/ComposableContent/_EditorShell.cshtml"),
    fileRecord("KelpApiDomain/PageMediaBlockConfig.cs"),
    fileRecord("Components/PageParts/CarouselViewComponent.cs")
  ];
  const symbols: SymbolRecord[] = [
    {
      recordType: "symbol",
      id: "symbol:csharp:KelpApiDomain.PageMediaBlockConfig",
      name: "PageMediaBlockConfig",
      fullyQualifiedName: "KelpApiDomain.PageMediaBlockConfig",
      kind: "class",
      language: "csharp",
      file: "KelpApiDomain/PageMediaBlockConfig.cs",
      range: range(),
      summary: "Carousel config serialized through ConfigJson",
      confidence: 1
    }
  ];
  const relationships: RelationshipRecord[] = [
    {
      recordType: "relationship",
      id: "relationship:razor-editor-uses-config",
      from: "symbol:razor:Views/Shared/ComposableContent/_EditorShell.cshtml",
      to: "symbol:csharp:PageMediaBlockConfig.FromJson",
      type: "USES_CSHARP_SYMBOL",
      file: "Views/Shared/ComposableContent/_EditorShell.cshtml",
      range: range(),
      evidence: "PageMediaBlockConfig.FromJson(part.ConfigJson, part.Content)",
      confidence: 0.65
    }
  ];

  await rebuildSqliteIndex(indexPath, { files, symbols, relationships, references: [], patterns: [] });
  const database = await openSqliteIndex(indexPath);
  try {
    const result = new QueryService(database).findReferences("PageMediaBlockConfig");

    assert.match(result.answer, /0 source reference record\(s\) and 1 connected relationship edge\(s\)/);
    assert.ok(result.confidence >= 0.8);
    assert.ok(result.relationships.some((item) => item.type === "USES_CSHARP_SYMBOL"));
    assert.ok(result.files.includes("KelpApiDomain/PageMediaBlockConfig.cs"));
    assert.ok(result.files.includes("Views/Shared/ComposableContent/_EditorShell.cshtml"));
    assert.ok(result.nextQueries.includes('kraken-atlas query relationships "PageMediaBlockConfig"'));
    assert.ok(result.nextQueries.includes('kraken-atlas query search "PageMediaBlockConfig"'));
  } finally {
    database.close();
  }
});

test("relationship and flow queries keep exact property anchors inspectable", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-anchor-flow-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const files: FileRecord[] = [
    fileRecord("Kelp2025_WebUI/Views/Shared/ComposableContent/_EditorShell.cshtml"),
    fileRecord("Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs"),
    fileRecord("Kelp2025_WebUI/Components/PageParts/CarouselViewComponent.cs"),
    fileRecord("Kelp2025_WebUI/Areas/Identity/Pages/Account/Register.cshtml.cs")
  ];
  const relationships: RelationshipRecord[] = [
    {
      recordType: "relationship",
      id: "relationship:writes-field:carousel-configjson",
      from: "symbol:javascript:Kelp2025_WebUI/Views/Shared/ComposableContent/_EditorShell.cshtml:writer:configjson",
      to: "symbol:razor:Kelp2025_WebUI/Views/Shared/ComposableContent/_EditorShell.cshtml:input:Parts_0_.ConfigJson",
      type: "WRITES_FIELD",
      file: "Kelp2025_WebUI/Views/Shared/ComposableContent/_EditorShell.cshtml",
      range: range(),
      evidence: "carousel applyConfig writes Parts[0].ConfigJson",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:binds-model:carousel-configjson",
      from: "symbol:razor:Kelp2025_WebUI/Views/Shared/ComposableContent/_EditorShell.cshtml:input:Parts_0_.ConfigJson",
      to: "model-binding:Parts[].ConfigJson",
      type: "BINDS_MODEL_PROPERTY",
      file: "Kelp2025_WebUI/Views/Shared/ComposableContent/_EditorShell.cshtml",
      range: range(),
      evidence: "name=\"Parts[0].ConfigJson\"",
      confidence: 0.75
    },
    {
      recordType: "relationship",
      id: "relationship:maps-property:carousel-configjson",
      from: "symbol:csharp:KelpApiDomain.ComposableEditorPartViewModel.ConfigJson",
      to: "symbol:csharp:KelpApiDomain.SavePageDraftPartRequest.ConfigJson",
      type: "MAPS_PROPERTY",
      file: "Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs",
      range: range(),
      evidence: "ConfigJson = part.ConfigJson",
      confidence: 0.82
    },
    {
      recordType: "relationship",
      id: "relationship:renders-view:carousel",
      from: "symbol:csharp:Kelp2025_WebUI.Components.PageParts.CarouselViewComponent",
      to: "file:Kelp2025_WebUI/Views/Shared/Components/Carousel/Default.cshtml",
      type: "RENDERS_VIEW",
      file: "Kelp2025_WebUI/Components/PageParts/CarouselViewComponent.cs",
      range: range(),
      evidence: "CarouselViewComponent renders carousel Default.cshtml",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:calls:identity-registration",
      from: "symbol:csharp:Kelp2025_WebUI.Areas.Identity.Pages.Account.RegisterModel.OnPostAsync(string)",
      to: "symbol:csharp:Kelp2025_WebUI.Services.UserRegistrationService.CreateUser()",
      type: "CALLS",
      file: "Kelp2025_WebUI/Areas/Identity/Pages/Account/Register.cshtml.cs",
      range: range(),
      evidence: "model binding user registration persistence",
      confidence: 0.9
    }
  ];

  await rebuildSqliteIndex(indexPath, { files, symbols: [], relationships, references: [], patterns: [] });
  const database = await openSqliteIndex(indexPath);
  try {
    const service = new QueryService(database, { projectContext: "Kelp2025_WebUI" });
    const configRelationships = service.findRelationships("ConfigJson");
    const writesOnly = service.findRelationships("ConfigJson", { edgeTypes: ["WRITES_FIELD"], limit: 10 });
    const flow = service.findFlow("carousel ConfigJson model binding persistence");

    assert.ok(configRelationships.relationships.some((relationship) => relationship.type === "WRITES_FIELD"));
    assert.ok(configRelationships.relationships.some((relationship) => relationship.type === "BINDS_MODEL_PROPERTY"));
    assert.ok(configRelationships.relationships.some((relationship) => relationship.type === "MAPS_PROPERTY"));
    assert.ok(writesOnly.relationships.length > 0);
    assert.ok(writesOnly.relationships.every((relationship) => relationship.type === "WRITES_FIELD"));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "WRITES_FIELD"));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "BINDS_MODEL_PROPERTY"));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "MAPS_PROPERTY"));
    assert.ok(!flow.files.includes("Kelp2025_WebUI/Areas/Identity/Pages/Account/Register.cshtml.cs"));
  } finally {
    database.close();
  }
});

test("relationship queries filter by persisted map fact source kind", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-relationship-source-kind-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const files: FileRecord[] = [
    fileRecord("Web/UserController.cs"),
    fileRecord("Data/UserProfileMapper.cs")
  ];
  const relationships: RelationshipRecord[] = [
    {
      recordType: "relationship",
      id: "relationship:csharp:call:user-profile-save",
      from: "symbol:csharp:Web.UserController.SaveUserProfile()",
      to: "symbol:csharp:Domain.UserProfileService.SaveUserProfile()",
      type: "CALLS",
      file: "Web/UserController.cs",
      range: range(),
      evidence: "compiler-resolved call for UserProfile save",
      confidence: 0.95
    },
    {
      recordType: "relationship",
      id: "relationship:csharp-projection:UserProfileRow:UserProfileModel",
      from: "symbol:csharp:Data.UserProfileRow",
      to: "symbol:csharp:Api.UserProfileModel",
      type: "PROJECTS_MODEL",
      file: "Data/UserProfileMapper.cs",
      range: range(),
      evidence: "UserProfileRow projects to UserProfileModel",
      confidence: 0.78
    }
  ];

  await rebuildSqliteIndex(indexPath, { files, symbols: [], relationships, references: [], patterns: [] });
  const database = await openSqliteIndex(indexPath);
  try {
    const service = new QueryService(database);
    const all = service.findRelationships("UserProfile", { limit: 10 });
    const inferred = service.findRelationships("UserProfile", { sourceKinds: ["inferred"], limit: 10 });
    const compilerResolved = service.findRelationships("UserProfile", { sourceKinds: ["compiler-resolved"], limit: 10 });

    assert.ok(all.relationships.some((relationship) => relationship.type === "CALLS"));
    assert.ok(all.relationships.some((relationship) => relationship.type === "PROJECTS_MODEL"));
    assert.deepStrictEqual(inferred.relationships.map((relationship) => relationship.type), ["PROJECTS_MODEL"]);
    assert.ok(inferred.relationships.every((relationship) => relationship.sourceKind === "inferred"));
    assert.deepStrictEqual(compilerResolved.relationships.map((relationship) => relationship.type), ["CALLS"]);
    assert.ok(compilerResolved.relationships.every((relationship) => relationship.sourceKind === "compiler-resolved"));
    assert.ok(inferred.evidence.some((item) => item.recordType === "relationshipFilter" && Array.isArray(item.sourceKinds)));
  } finally {
    database.close();
  }
});

test("flow includes exact requested metadata property anchors across page editor mappings", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-metadata-flow-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const files: FileRecord[] = [
    fileRecord("Kelp2025_WebUI/Views/Shared/ComposableContent/_EditorShell.cshtml"),
    fileRecord("Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs"),
    fileRecord("KelpApiDomain/ViewModels/Pages/PageDraftModels.cs")
  ];
  const saveDraftPageId = "symbol:csharp:Kelp2025_WebUI.Services.ComposableContent.PageComposableContentEditorAdapter.SaveDraftPage(KelpApiDomain.ComposableEditorDocumentViewModel, string)";
  const relationships: RelationshipRecord[] = [
    {
      recordType: "relationship",
      id: "relationship:calls:save-page-title-facade",
      from: saveDraftPageId,
      to: "symbol:csharp:Kelp2025_WebUI.Services.ComposableContent.PageComposableContentEditorAdapter.ApplyPageTitleFacade(KelpApiDomain.ComposableEditorDocumentViewModel)",
      type: "CALLS",
      file: "Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs",
      range: range(),
      evidence: "ApplyPageTitleFacade(model)",
      confidence: 0.95
    },
    {
      recordType: "relationship",
      id: "relationship:calls:save-page-part-kind",
      from: saveDraftPageId,
      to: "symbol:csharp:KelpApiDomain.PagePartComponentTypes.InferPartKind(int)",
      type: "CALLS",
      file: "Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs",
      range: range(),
      evidence: "PagePartComponentTypes.InferPartKind(part.TypeCode)",
      confidence: 0.95
    },
    ...["Path", "Type", "PublishDate", "PageTitle", "MetaDescription", "MetaKeywords"].map((property, index): RelationshipRecord => ({
      recordType: "relationship",
      id: `relationship:maps-property:page-draft:${property.toLowerCase()}`,
      from: saveDraftPageId,
      to: `symbol:csharp:KelpApiDomain.SavePageDraftRequest.${property}`,
      type: "MAPS_PROPERTY",
      file: "Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs",
      range: { ...range(), startLine: 40 + index, endLine: 40 + index },
      evidence: `${property} = model.${property}`,
      confidence: 0.82
    })),
    {
      recordType: "relationship",
      id: "relationship:binds-model:metadata-description",
      from: "symbol:razor:Kelp2025_WebUI/Views/Shared/ComposableContent/_EditorShell.cshtml:input:MetaDescription",
      to: "model-binding:MetaDescription",
      type: "BINDS_MODEL_PROPERTY",
      file: "Kelp2025_WebUI/Views/Shared/ComposableContent/_EditorShell.cshtml",
      range: range(),
      evidence: "name=\"MetaDescription\"",
      confidence: 0.75
    },
    {
      recordType: "relationship",
      id: "relationship:binds-model:metadata-keywords",
      from: "symbol:razor:Kelp2025_WebUI/Views/Shared/ComposableContent/_EditorShell.cshtml:input:MetaKeywords",
      to: "model-binding:MetaKeywords",
      type: "BINDS_MODEL_PROPERTY",
      file: "Kelp2025_WebUI/Views/Shared/ComposableContent/_EditorShell.cshtml",
      range: range(),
      evidence: "name=\"MetaKeywords\"",
      confidence: 0.75
    }
  ];

  await rebuildSqliteIndex(indexPath, { files, symbols: [], relationships, references: [], patterns: [] });
  const database = await openSqliteIndex(indexPath);
  try {
    const flow = new QueryService(database, { projectContext: "Kelp2025_WebUI" }).findFlow("page editor saves MetaDescription MetaKeywords PageTitle block");
    const coverage = flow.evidence.find((item) => item.recordType === "flowCoverage");

    assert.ok(flow.relationships.some((relationship) => stringValue(relationship.evidence).includes("MetaDescription")));
    assert.ok(flow.relationships.some((relationship) => stringValue(relationship.evidence).includes("MetaKeywords")));
    assert.ok(Array.isArray(coverage?.matchedConcepts) && coverage.matchedConcepts.includes("metadescription"));
    assert.ok(Array.isArray(coverage?.matchedConcepts) && coverage.matchedConcepts.includes("metakeywords"));
    assert.ok(Array.isArray(coverage?.matchedConcepts) && coverage.matchedConcepts.includes("saves"));
    assert.ok(Array.isArray(coverage?.missingConcepts) && !coverage.missingConcepts.includes("metadescription"));
    assert.ok(Array.isArray(coverage?.missingConcepts) && !coverage.missingConcepts.includes("metakeywords"));
  } finally {
    database.close();
  }
});

test("flow confidence drops when requested feature concepts are missing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-flow-coverage-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const files: FileRecord[] = [fileRecord("Web/Services/EditAccessService.cs")];
  const relationships: RelationshipRecord[] = [{
    recordType: "relationship",
    id: "relationship:calls:edit-access-authenticated",
    from: "symbol:csharp:Web.Services.EditAccessService.GetOrCreateAsync()",
    to: "symbol:csharp:Web.Services.EditAccessService.CurrentUserIsAuthenticated()",
    type: "CALLS",
    file: "Web/Services/EditAccessService.cs",
    range: range(),
    evidence: "CurrentUserIsAuthenticated()",
    confidence: 0.95
  }];

  await rebuildSqliteIndex(indexPath, { files, symbols: [], relationships, references: [], patterns: [] });
  const database = await openSqliteIndex(indexPath);
  try {
    const flow = new QueryService(database, { projectContext: "Web" }).findFlow("authenticated user flags a location review for moderation");
    const coverage = flow.evidence.find((item) => item.recordType === "flowCoverage");

    assert.ok(flow.relationships.length > 0);
    assert.ok(flow.confidence <= 0.6);
    assert.ok(Array.isArray(coverage?.missingConcepts) && coverage.missingConcepts.includes("review"));
    assert.ok(flow.evidence.some((item) => item.recordType === "caveat" && /partial slice/.test(stringValue(item.message))));
  } finally {
    database.close();
  }
});

test("natural-language flow pivots to strong exact symbol anchors", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-flow-anchor-pivot-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const files: FileRecord[] = [
    fileRecord("Web/Views/Location/Index.cshtml"),
    fileRecord("Api/Controllers/LocationController.cs"),
    fileRecord("Logic/Services/LocationService.cs")
  ];
  const flagReviewId = "symbol:csharp:Api.Controllers.LocationController.FlagReview(FlagLocationReviewRequest)";
  const symbols: SymbolRecord[] = [{
    recordType: "symbol",
    id: flagReviewId,
    name: "FlagReview",
    fullyQualifiedName: "Api.Controllers.LocationController.FlagReview",
    kind: "method",
    language: "csharp",
    file: "Api/Controllers/LocationController.cs",
    range: range(),
    confidence: 1
  }];
  const relationships: RelationshipRecord[] = [
    {
      recordType: "relationship",
      id: "relationship:maps-route:review-flag",
      from: "route:csharp:POST review/flag",
      to: flagReviewId,
      type: "MAPS_ROUTE",
      file: "Api/Controllers/LocationController.cs",
      range: range(),
      evidence: "POST review/flag",
      confidence: 0.95
    },
    {
      recordType: "relationship",
      id: "relationship:auth:review-flag",
      from: flagReviewId,
      to: "auth:csharp:authenticated",
      type: "REQUIRES_AUTH",
      file: "Api/Controllers/LocationController.cs",
      range: range(),
      evidence: "Authenticated user",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:calls:review-flag-service",
      from: flagReviewId,
      to: "symbol:csharp:Logic.Services.ILocationService.FlagLocationReview(FlagLocationReviewRequest)",
      type: "CALLS",
      file: "Api/Controllers/LocationController.cs",
      range: range(),
      evidence: "FlagLocationReview(request)",
      confidence: 0.95
    }
  ];

  await rebuildSqliteIndex(indexPath, { files, symbols, relationships, references: [], patterns: [] });
  const database = await openSqliteIndex(indexPath);
  try {
    const flow = new QueryService(database, { projectContext: "Web" }).findFlow("authenticated user flags a location review for moderation");

    assert.ok(flow.evidence.some((item) => item.recordType === "strongAnchor" && item.id === flagReviewId && item.crossContext === true));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "MAPS_ROUTE" && relationship.to === flagReviewId));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "REQUIRES_AUTH" && relationship.from === flagReviewId));
    assert.ok(flow.relationships.some((relationship) => relationship.type === "CALLS" && relationship.from === flagReviewId));
    assert.ok(flow.nextQueries[0].includes(flagReviewId));
  } finally {
    database.close();
  }
});

test("browser-state intent outranks lexical server symbols and multi-edge output keeps rare edges visible", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-browser-intent-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const scriptPath = "Web/wwwroot/js/maps/kelp-map-explorer.js";
  const browserReaderId = `symbol:javascript:${scriptPath}:browser-state:query-string:read:574`;
  const serverMethodId = "symbol:csharp:Web.Services.MapSearchProtectionService.ResolveQueryShape(SearchQuery)";
  const files: FileRecord[] = [fileRecord(scriptPath), fileRecord("Web/Services/MapSearchProtectionService.cs")];
  const symbols: SymbolRecord[] = [
    {
      recordType: "symbol",
      id: browserReaderId,
      name: "query string read",
      fullyQualifiedName: browserReaderId,
      kind: "browserStateReader",
      language: "javascript",
      file: scriptPath,
      range: range(),
      confidence: 0.95
    },
    {
      recordType: "symbol",
      id: serverMethodId,
      name: "ResolveQueryShape",
      fullyQualifiedName: "Web.Services.MapSearchProtectionService.ResolveQueryShape",
      kind: "method",
      language: "csharp",
      file: "Web/Services/MapSearchProtectionService.cs",
      range: range(),
      confidence: 1
    }
  ];
  const relationships: RelationshipRecord[] = [
    {
      recordType: "relationship",
      id: "relationship:reads-browser-query",
      from: browserReaderId,
      to: "browser-state:query-string",
      type: "READS_QUERY_STRING",
      file: scriptPath,
      range: range(),
      evidence: "new URLSearchParams(global.location.search)",
      confidence: 0.95
    },
    {
      recordType: "relationship",
      id: "relationship:server-query-shape",
      from: serverMethodId,
      to: "symbol:csharp:Web.SearchQuery.Filters",
      type: "CALLS",
      file: "Web/Services/MapSearchProtectionService.cs",
      range: range(),
      evidence: "map filters query shape",
      confidence: 0.9
    },
    ...Array.from({ length: 35 }, (_, index): RelationshipRecord => ({
      recordType: "relationship",
      id: `relationship:contains:${index}`,
      from: `symbol:javascript:${scriptPath}`,
      to: `symbol:javascript:${scriptPath}:function:${index}`,
      type: "CONTAINS",
      file: scriptPath,
      range: { ...range(), startLine: index + 1, endLine: index + 1 },
      evidence: `function item${index}`,
      confidence: 1
    }))
  ];

  await rebuildSqliteIndex(indexPath, { files, symbols, relationships, references: [], patterns: [] });
  const database = await openSqliteIndex(indexPath);
  try {
    const service = new QueryService(database, { projectContext: "Web" });
    const flow = service.findFlow("map filters change browser query string");
    const whereToAdd = service.whereToAdd("write map filters into the browser query string");
    const filtered = service.findRelationships("kelp-map-explorer.js", { edgeTypes: ["READS_QUERY_STRING", "CONTAINS"], limit: 30 });

    assert.strictEqual(flow.files[0], scriptPath);
    assert.ok(flow.relationships.some((relationship) => relationship.type === "READS_QUERY_STRING"));
    assert.ok(!flow.files.includes("Web/Services/MapSearchProtectionService.cs"));
    assert.ok(flow.confidence <= 0.65);
    assert.ok(flow.evidence.some((item) => item.recordType === "caveat" && /no browser URL writer/.test(stringValue(item.message))));
    assert.deepStrictEqual(whereToAdd.files, [scriptPath]);
    assert.ok(whereToAdd.evidence.some((item) => item.recordType === "capabilityAssessment" && item.status === "adjacent-only"));
    assert.strictEqual(filtered.relationships[0].type, "READS_QUERY_STRING");
    assert.ok(filtered.relationships.some((relationship) => relationship.type === "CONTAINS"));
    assert.ok(filtered.evidence.some((item) => item.recordType === "relationshipFilter"));
  } finally {
    database.close();
  }
});

test("exact relationship queries include and label graph-connected edges outside seed context", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-context-expansion-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const interfaceId = "symbol:csharp:Connector.ITranslationService";
  const implementationId = "symbol:csharp:Connector.TranslationService";
  const files = [fileRecord("Web/Program.cs"), fileRecord("Connector/ITranslationService.cs"), fileRecord("Connector/TranslationService.cs")];
  const symbols: SymbolRecord[] = [
    {
      recordType: "symbol", id: interfaceId, name: "ITranslationService", fullyQualifiedName: "Connector.ITranslationService",
      kind: "interface", language: "csharp", file: "Connector/ITranslationService.cs", range: range(), confidence: 1
    },
    {
      recordType: "symbol", id: implementationId, name: "TranslationService", fullyQualifiedName: "Connector.TranslationService",
      kind: "class", language: "csharp", file: "Connector/TranslationService.cs", range: range(), confidence: 1
    }
  ];
  const relationships: RelationshipRecord[] = [
    {
      recordType: "relationship", id: "relationship:implements:translation", from: implementationId, to: interfaceId,
      type: "IMPLEMENTS", file: "Connector/TranslationService.cs", range: range(), evidence: "ITranslationService", confidence: 0.9
    },
    {
      recordType: "relationship", id: "relationship:registers:translation", from: implementationId, to: interfaceId,
      type: "REGISTERS", file: "Web/Program.cs", range: range(), evidence: "AddScoped", confidence: 0.9
    }
  ];
  await rebuildSqliteIndex(indexPath, { files, symbols, relationships, references: [], patterns: [] });
  const database = await openSqliteIndex(indexPath);
  try {
    const result = new QueryService(database, { projectContext: "Web" }).findRelationships(interfaceId);
    assert.ok(result.relationships.some((relationship) => relationship.type === "IMPLEMENTS"));
    assert.ok(result.relationships.some((relationship) => relationship.type === "REGISTERS"));
    assert.ok(result.evidence.some((item) => item.recordType === "contextExpansion" && /IMPLEMENTS=1/.test(stringValue(item.message))));
  } finally {
    database.close();
  }
});

test("relationship queries bridge C# model symbols to Razor value lifecycle edges", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-value-lifecycle-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const files: FileRecord[] = [
    fileRecord("Kelp2025_WebUI/Models/ProfileHomePortFormModel.cs"),
    fileRecord("Kelp2025_WebUI/Views/Forms/ProfileHomePort.cshtml"),
    fileRecord("Kelp2025_WebUI/Views/Persona/Update.cshtml")
  ];
  const classId = "symbol:csharp:Kelp2025_WebUI.Models.ProfileHomePortFormModel";
  const homePortId = "symbol:csharp:Kelp2025_WebUI.Models.ProfileHomePortFormModel.HomePortId";
  const symbols: SymbolRecord[] = [
    {
      recordType: "symbol",
      id: classId,
      name: "ProfileHomePortFormModel",
      fullyQualifiedName: "Kelp2025_WebUI.Models.ProfileHomePortFormModel",
      kind: "class",
      language: "csharp",
      file: "Kelp2025_WebUI/Models/ProfileHomePortFormModel.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: homePortId,
      name: "HomePortId",
      fullyQualifiedName: "Kelp2025_WebUI.Models.ProfileHomePortFormModel.HomePortId",
      kind: "property",
      language: "csharp",
      file: "Kelp2025_WebUI/Models/ProfileHomePortFormModel.cs",
      range: range(),
      confidence: 1
    }
  ];
  const relationships: RelationshipRecord[] = [
    {
      recordType: "relationship",
      id: "relationship:uses-csharp-symbol:homeport",
      from: "symbol:razor:Kelp2025_WebUI/Views/Forms/ProfileHomePort.cshtml",
      to: "symbol:csharp:Model.HomePortId",
      type: "USES_CSHARP_SYMBOL",
      file: "Kelp2025_WebUI/Views/Forms/ProfileHomePort.cshtml",
      range: range(),
      evidence: "Model.HomePortId",
      confidence: 0.65
    },
    {
      recordType: "relationship",
      id: "relationship:binds-model:homeport",
      from: "symbol:razor:Kelp2025_WebUI/Views/Forms/ProfileHomePort.cshtml:input:HomePortId",
      to: "model-binding:HomePortId",
      type: "BINDS_MODEL_PROPERTY",
      file: "Kelp2025_WebUI/Views/Forms/ProfileHomePort.cshtml",
      range: range(),
      evidence: "name=\"HomePortId\"",
      confidence: 0.75
    },
    {
      recordType: "relationship",
      id: "relationship:uses-csharp-symbol:update-homeport",
      from: "symbol:razor:Kelp2025_WebUI/Views/Persona/Update.cshtml",
      to: "symbol:csharp:Model.BioHomeportId",
      type: "USES_CSHARP_SYMBOL",
      file: "Kelp2025_WebUI/Views/Persona/Update.cshtml",
      range: range(),
      evidence: "Model.BioHomeportId",
      confidence: 0.55
    }
  ];

  await rebuildSqliteIndex(indexPath, { files, symbols, relationships, references: [], patterns: [] });
  const database = await openSqliteIndex(indexPath);
  try {
    const result = new QueryService(database, { projectContext: "Kelp2025_WebUI" }).findRelationships("ProfileHomePortFormModel");

    assert.ok(result.relationships.some((relationship) => relationship.type === "BINDS_MODEL_PROPERTY" && stringValue(relationship.to).includes("HomePortId")));
    assert.ok(result.relationships.some((relationship) => relationship.type === "USES_CSHARP_SYMBOL" && stringValue(relationship.evidence).includes("Model.HomePortId")));
    assert.ok(result.files.includes("Kelp2025_WebUI/Views/Forms/ProfileHomePort.cshtml"));
  } finally {
    database.close();
  }
});

test("relationship queries summarize cross-project datatype usage", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-datatype-projects-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const files: FileRecord[] = [
    fileRecord("KelpApiDomain/ViewModels/Pages/PageDraftModels.cs"),
    fileRecord("Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs"),
    fileRecord("KelpApi/Controllers/PageController.cs")
  ];
  const requestId = "symbol:csharp:KelpApiDomain.SavePageDraftRequest";
  const symbols: SymbolRecord[] = [
    {
      recordType: "symbol",
      id: requestId,
      name: "SavePageDraftRequest",
      fullyQualifiedName: "KelpApiDomain.SavePageDraftRequest",
      kind: "class",
      language: "csharp",
      file: "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:KelpApiDomain.SavePageDraftRequest.PageTitle",
      name: "PageTitle",
      fullyQualifiedName: "KelpApiDomain.SavePageDraftRequest.PageTitle",
      kind: "property",
      language: "csharp",
      file: "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:KelpApiDomain.SavePageDraftRequest.MetaDescription",
      name: "MetaDescription",
      fullyQualifiedName: "KelpApiDomain.SavePageDraftRequest.MetaDescription",
      kind: "property",
      language: "csharp",
      file: "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs",
      range: range(),
      confidence: 1
    }
  ];
  const references: ReferenceRecord[] = [
    {
      recordType: "reference",
      id: "reference:csharp:webui-save-page-draft",
      symbolName: "SavePageDraftRequest",
      resolvedSymbolId: requestId,
      file: "Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs",
      range: range(),
      context: "type-usage",
      snippet: "new SavePageDraftRequest",
      confidence: 0.9
    },
    {
      recordType: "reference",
      id: "reference:csharp:api-save-page-draft",
      symbolName: "SavePageDraftRequest",
      resolvedSymbolId: requestId,
      file: "KelpApi/Controllers/PageController.cs",
      range: range(),
      context: "parameter",
      snippet: "SavePageDraftRequest request",
      confidence: 0.9
    }
  ];
  const relationships: RelationshipRecord[] = [{
    recordType: "relationship",
    id: "relationship:maps-property:save-page-draft",
    from: "symbol:csharp:KelpApiDomain.ComposableEditorDocumentViewModel.PageTitle",
    to: "symbol:csharp:KelpApiDomain.SavePageDraftRequest.PageTitle",
    type: "MAPS_PROPERTY",
    file: "Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs",
    range: range(),
    evidence: "PageTitle = model.PageTitle",
    confidence: 0.82
  }];

  await rebuildSqliteIndex(indexPath, { files, symbols, references, relationships, patterns: [] });
  const database = await openSqliteIndex(indexPath);
  try {
    const result = new QueryService(database, { projectContext: "Kelp2025_WebUI" }).findRelationships("SavePageDraftRequest");
    const usage = result.evidence.find((item) => item.recordType === "datatypeProjectUsage");
    const roles = result.evidence.find((item) => item.recordType === "nodeRoleSummary");
    const tags = result.evidence.find((item) => item.recordType === "nodeTagSummary");
    const members = result.evidence.find((item) => item.recordType === "nodeMemberSummary");

    assert.ok(usage);
    assert.ok(roles);
    assert.ok(tags);
    assert.ok(members);
    assert.deepStrictEqual(usage?.declaredIn, { KelpApiDomain: 1 });
    assert.deepStrictEqual(usage?.referencedFrom, { Kelp2025_WebUI: 1, KelpApi: 1 });
    assert.ok(Array.isArray(roles?.roles));
    assert.ok((roles?.roles as Array<Record<string, unknown>>).some((role) => role.role === "domain-contract"));
    assert.ok((roles?.roles as Array<Record<string, unknown>>).some((role) => role.role === "request-dto"));
    assert.ok(Array.isArray(tags?.tags));
    assert.ok((tags?.tags as Array<Record<string, unknown>>).some((tag) => tag.tag === "page-draft"));
    assert.ok((tags?.tags as Array<Record<string, unknown>>).some((tag) => tag.tag === "save-page-draft"));
    assert.strictEqual(members?.memberCount, 2);
    assert.ok(Array.isArray(members?.members));
    assert.ok((members?.members as Array<Record<string, unknown>>).some((member) => member.name === "PageTitle"));
    assert.ok(result.relationships.some((relationship) => relationship.type === "MAPS_PROPERTY"));
  } finally {
    database.close();
  }
});
