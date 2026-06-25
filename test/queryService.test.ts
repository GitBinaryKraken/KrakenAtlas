import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import { FileRecord, PatternRecord, RelationshipRecord, SymbolRecord } from "../src/model/records";
import { QueryService } from "../src/query/queryService";
import { openSqliteIndex, rebuildSqliteIndex } from "../src/storage/sqliteIndex";

test("QueryService returns compact symbol, relationship, and pattern answers", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-query-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const files: FileRecord[] = [
    {
      recordType: "file",
      id: "file:Services/UserService.cs",
      path: "Services/UserService.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "a".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source"]
    },
    {
      recordType: "file",
      id: "file:Controllers/UserController.cs",
      path: "Controllers/UserController.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "b".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source", "controller"]
    },
    {
      recordType: "file",
      id: "file:Views/User/Edit.cshtml",
      path: "Views/User/Edit.cshtml",
      extension: ".cshtml",
      language: "razor",
      sizeBytes: 100,
      sha256: "c".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["razor", "source", "view"]
    },
    {
      recordType: "file",
      id: "file:Web/Web.csproj",
      path: "Web/Web.csproj",
      extension: ".csproj",
      language: "xml",
      sizeBytes: 100,
      sha256: "d".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["dotnet-project"]
    },
    {
      recordType: "file",
      id: "file:Web/Program.cs",
      path: "Web/Program.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "9".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source"]
    },
    {
      recordType: "file",
      id: "file:Web/Areas/Identity/Pages/Account/Register.cshtml.cs",
      path: "Web/Areas/Identity/Pages/Account/Register.cshtml.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "8".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source"]
    },
    {
      recordType: "file",
      id: "file:Kelp2025_WebUI/Kelp2025_WebUI.csproj",
      path: "Kelp2025_WebUI/Kelp2025_WebUI.csproj",
      extension: ".csproj",
      language: "xml",
      sizeBytes: 100,
      sha256: "7".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["dotnet-project"]
    },
    {
      recordType: "file",
      id: "file:Kelp2025_WebUI/Program.cs",
      path: "Kelp2025_WebUI/Program.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "5".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source"]
    },
    {
      recordType: "file",
      id: "file:Kelp2025_WebUI/Areas/Identity/Pages/Account/Register.cshtml.cs",
      path: "Kelp2025_WebUI/Areas/Identity/Pages/Account/Register.cshtml.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "6".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source"]
    },
    {
      recordType: "file",
      id: "file:Domain/Domain.csproj",
      path: "Domain/Domain.csproj",
      extension: ".csproj",
      language: "xml",
      sizeBytes: 100,
      sha256: "e".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["dotnet-project"]
    },
    {
      recordType: "file",
      id: "file:AdminTools/Pages/Users.cshtml.cs",
      path: "AdminTools/Pages/Users.cshtml.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "f".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source"]
    },
    {
      recordType: "file",
      id: "file:AdminApi/Program.cs",
      path: "AdminApi/Program.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "4".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source"]
    },
    {
      recordType: "file",
      id: "file:AdminTools/Pages/ImageStorage.cshtml.cs",
      path: "AdminTools/Pages/ImageStorage.cshtml.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "0".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source"]
    },
    {
      recordType: "file",
      id: "file:AdminTools/Services/AdminBridgeService.cs",
      path: "AdminTools/Services/AdminBridgeService.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "2".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source"]
    },
    {
      recordType: "file",
      id: "file:AdminTools/Pages/Geography.cshtml.cs",
      path: "AdminTools/Pages/Geography.cshtml.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "3".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source"]
    },
    {
      recordType: "file",
      id: "file:KelpApi/Services/ImageStorageDiagnosticsService.cs",
      path: "KelpApi/Services/ImageStorageDiagnosticsService.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "1".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source"]
    }
  ];
  const symbols: SymbolRecord[] = [
    {
      recordType: "symbol",
      id: "symbol:csharp:Example.UserService",
      name: "UserService",
      fullyQualifiedName: "Example.UserService",
      kind: "class",
      language: "csharp",
      file: "Services/UserService.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:Example.IUserService",
      name: "IUserService",
      fullyQualifiedName: "Example.IUserService",
      kind: "interface",
      language: "csharp",
      file: "Services/UserService.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:razor:Views/User/Edit.cshtml:button:save-user",
      name: "save-user",
      fullyQualifiedName: "save-user",
      kind: "domElement",
      language: "razor",
      file: "Views/User/Edit.cshtml",
      range: range(),
      confidence: 0.85
    },
    {
      recordType: "symbol",
      id: "symbol:javascript:wwwroot/js/user-form.js:event:save-user:click",
      name: "save-user:click",
      fullyQualifiedName: "wwwroot/js/user-form.js.save-user.click",
      kind: "eventHandler",
      language: "javascript",
      file: "wwwroot/js/user-form.js",
      range: range(),
      confidence: 0.85
    },
    {
      recordType: "symbol",
      id: "symbol:dotnet-project:Web/Web.csproj",
      name: "Web",
      fullyQualifiedName: "Web/Web.csproj",
      kind: "project",
      language: "csharp",
      file: "Web/Web.csproj",
      range: range(),
      confidence: 0.95
    },
    {
      recordType: "symbol",
      id: "symbol:dotnet-project:Domain/Domain.csproj",
      name: "Domain",
      fullyQualifiedName: "Domain/Domain.csproj",
      kind: "project",
      language: "csharp",
      file: "Domain/Domain.csproj",
      range: range(),
      confidence: 0.95
    },
    {
      recordType: "symbol",
      id: "symbol:dotnet-project:Kelp2025_WebUI/Kelp2025_WebUI.csproj",
      name: "Kelp2025_WebUI",
      fullyQualifiedName: "Kelp2025_WebUI/Kelp2025_WebUI.csproj",
      kind: "project",
      language: "csharp",
      file: "Kelp2025_WebUI/Kelp2025_WebUI.csproj",
      range: range(),
      confidence: 0.95
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:Web.Areas.Identity.Pages.Account.RegisterModel.OnPostAsync(string)",
      name: "OnPostAsync",
      fullyQualifiedName: "Web.Areas.Identity.Pages.Account.RegisterModel.OnPostAsync",
      kind: "method",
      language: "csharp",
      file: "Web/Areas/Identity/Pages/Account/Register.cshtml.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:Kelp2025_WebUI.Areas.Identity.Pages.Account.RegisterModel.OnPostAsync(string)",
      name: "OnPostAsync",
      fullyQualifiedName: "Kelp2025_WebUI.Areas.Identity.Pages.Account.RegisterModel.OnPostAsync",
      kind: "method",
      language: "csharp",
      file: "Kelp2025_WebUI/Areas/Identity/Pages/Account/Register.cshtml.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:AdminTools.Pages.UsersModel",
      name: "UsersModel",
      fullyQualifiedName: "AdminTools.Pages.UsersModel",
      kind: "class",
      language: "csharp",
      file: "AdminTools/Pages/Users.cshtml.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:AdminTools.Pages.ImageStorageModel",
      name: "ImageStorageModel",
      fullyQualifiedName: "AdminTools.Pages.ImageStorageModel",
      kind: "class",
      language: "csharp",
      file: "AdminTools/Pages/ImageStorage.cshtml.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:AdminTools.Services.AdminBridgeService",
      name: "AdminBridgeService",
      fullyQualifiedName: "AdminTools.Services.AdminBridgeService",
      kind: "class",
      language: "csharp",
      file: "AdminTools/Services/AdminBridgeService.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:AdminTools.Pages.GeographyModel",
      name: "GeographyModel",
      fullyQualifiedName: "AdminTools.Pages.GeographyModel",
      kind: "class",
      language: "csharp",
      file: "AdminTools/Pages/Geography.cshtml.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:KelpApi.Services.ImageStorageDiagnosticsService",
      name: "ImageStorageDiagnosticsService",
      fullyQualifiedName: "KelpApi.Services.ImageStorageDiagnosticsService",
      kind: "class",
      language: "csharp",
      file: "KelpApi/Services/ImageStorageDiagnosticsService.cs",
      range: range(),
      confidence: 1
    }
  ];
  const relationships: RelationshipRecord[] = [
    {
      recordType: "relationship",
      id: "relationship:implements:test",
      from: "symbol:csharp:Example.UserService",
      to: "symbol:csharp:Example.IUserService",
      type: "IMPLEMENTS",
      file: "Services/UserService.cs",
      range: range(),
      evidence: "public class UserService : IUserService",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:handles_event:web:test",
      from: "symbol:javascript:wwwroot/js/user-form.js:event:save-user:click",
      to: "symbol:razor:Views/User/Edit.cshtml:button:save-user",
      type: "HANDLES_EVENT",
      file: "wwwroot/js/user-form.js",
      range: range(),
      evidence: "document.getElementById(\"save-user\").addEventListener(\"click\"",
      confidence: 0.75
    },
    {
      recordType: "relationship",
      id: "relationship:contains:web:test",
      from: "symbol:javascript:wwwroot/js/user-form.js",
      to: "symbol:javascript:wwwroot/js/user-form.js:event:save-user:click",
      type: "CONTAINS",
      file: "wwwroot/js/user-form.js",
      range: range(),
      evidence: "event handler belongs to script",
      confidence: 0.8
    },
    {
      recordType: "relationship",
      id: "relationship:calls:web:test",
      from: "symbol:javascript:wwwroot/js/user-form.js",
      to: "route:web:/api/users",
      type: "CALLS",
      file: "wwwroot/js/user-form.js",
      range: range(),
      evidence: "fetch(\"/api/users\"",
      confidence: 0.65
    },
    {
      recordType: "relationship",
      id: "relationship:injects:test",
      from: "symbol:csharp:Example.UserController",
      to: "symbol:csharp:Example.IUserService",
      type: "INJECTS",
      file: "Controllers/UserController.cs",
      range: range(),
      evidence: "public UserController(IUserService users)",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:calls:csharp:trim",
      from: "symbol:csharp:Example.UserService.SaveUser(Example.UserRequest)",
      to: "symbol:csharp:string.Trim()",
      type: "CALLS",
      file: "Services/UserService.cs",
      range: range(),
      evidence: "request.Name.Trim()",
      confidence: 0.95
    },
    {
      recordType: "relationship",
      id: "relationship:calls:csharp:cross-project",
      from: "symbol:csharp:Web.UserController.SaveUser()",
      to: "symbol:csharp:Domain.IUserService.SaveUser(Domain.UserRequest)",
      type: "CALLS",
      file: "Web/UserController.cs",
      range: range(),
      evidence: "_users.SaveUser(request)",
      confidence: 0.95
    },
    {
      recordType: "relationship",
      id: "relationship:project_references:dotnet:web-domain",
      from: "symbol:dotnet-project:Web/Web.csproj",
      to: "symbol:dotnet-project:Domain/Domain.csproj",
      type: "PROJECT_REFERENCES",
      file: "Web/Web.csproj",
      range: range(),
      evidence: "..\\Domain\\Domain.csproj",
      confidence: 0.95
    },
    {
      recordType: "relationship",
      id: "relationship:maps_route:web:save-user",
      from: "route:web:/users/save-user",
      to: "symbol:csharp:Web.UserController.SaveUser()",
      type: "MAPS_ROUTE",
      file: "Web/Program.cs",
      range: range(),
      evidence: "app.MapPost(\"/users/save-user\", SaveUser)",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:calls:web:register-create-user",
      from: "symbol:csharp:Web.Areas.Identity.Pages.Account.RegisterModel.OnPostAsync(string)",
      to: "symbol:csharp:Example.UserService.CreateUser()",
      type: "CALLS",
      file: "Web/Areas/Identity/Pages/Account/Register.cshtml.cs",
      range: range(),
      evidence: "Create initial user profile setup",
      confidence: 0.95
    },
    {
      recordType: "relationship",
      id: "relationship:calls:kelp-webui:register-create-user",
      from: "symbol:csharp:Kelp2025_WebUI.Areas.Identity.Pages.Account.RegisterModel.OnPostAsync(string)",
      to: "symbol:csharp:Example.UserService.CreateUser()",
      type: "CALLS",
      file: "Kelp2025_WebUI/Areas/Identity/Pages/Account/Register.cshtml.cs",
      range: range(),
      evidence: "Create initial user profile setup",
      confidence: 0.95
    },
    {
      recordType: "relationship",
      id: "relationship:maps_route:kelp-webui:register",
      from: "route:csharp:/Identity/Account/Register",
      to: "symbol:csharp:Kelp2025_WebUI.Areas.Identity.Pages.Account.RegisterModel.OnPostAsync(string)",
      type: "MAPS_ROUTE",
      file: "Kelp2025_WebUI/Program.cs",
      range: range(),
      evidence: "Map initial user profile setup after user registration route",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:uses_config:kelp-webui:registration",
      from: "file:Kelp2025_WebUI/Program.cs",
      to: "config:csharp:Registration",
      type: "USES_CONFIG_KEY",
      file: "Kelp2025_WebUI/Program.cs",
      range: range(),
      evidence: "Read initial user profile setup after user registration options",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:injects:kelp-webui:registration",
      from: "symbol:csharp:Kelp2025_WebUI.Program",
      to: "symbol:csharp:Kelp2025_WebUI.Services.KelpUserManager",
      type: "INJECTS",
      file: "Kelp2025_WebUI/Program.cs",
      range: range(),
      evidence: "Register initial user profile setup service after user registration",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:registers:kelp-webui:registration",
      from: "symbol:csharp:Kelp2025_WebUI.Program",
      to: "symbol:csharp:Kelp2025_WebUI.Services.KelpUserManager",
      type: "REGISTERS",
      file: "Kelp2025_WebUI/Program.cs",
      range: range(),
      evidence: "Register service used by initial user profile setup after user registration",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:calls:admin:save-user",
      from: "symbol:csharp:AdminTools.Pages.UsersModel.OnPostSaveUserAsync()",
      to: "symbol:csharp:AdminTools.Services.UserMaintenance.SaveUser()",
      type: "CALLS",
      file: "AdminTools/Pages/Users.cshtml.cs",
      range: range(),
      evidence: "Save user from admin tools",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:injects:admin:image-storage-config",
      from: "symbol:csharp:AdminTools.Pages.ImageStorageModel",
      to: "symbol:csharp:IConfiguration",
      type: "INJECTS",
      file: "AdminTools/Pages/ImageStorage.cshtml.cs",
      range: range(),
      evidence: "Image storage configuration",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:inherits:admin:image-storage-page-model",
      from: "symbol:csharp:AdminTools.Pages.ImageStorageModel",
      to: "symbol:csharp:PageModel",
      type: "INHERITS",
      file: "AdminTools/Pages/ImageStorage.cshtml.cs",
      range: range(),
      evidence: "ImageStorageModel : PageModel",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:injects:admin:bridge-config",
      from: "symbol:csharp:AdminTools.Services.AdminBridgeService",
      to: "symbol:csharp:IConfiguration",
      type: "INJECTS",
      file: "AdminTools/Services/AdminBridgeService.cs",
      range: range(),
      evidence: "Admin bridge configuration",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:inherits:admin:geography-page-model",
      from: "symbol:csharp:AdminTools.Pages.GeographyModel",
      to: "symbol:csharp:PageModel",
      type: "INHERITS",
      file: "AdminTools/Pages/Geography.cshtml.cs",
      range: range(),
      evidence: "GeographyModel : PageModel",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:injects:kelp:image-storage-config",
      from: "symbol:csharp:KelpApi.Services.ImageStorageDiagnosticsService",
      to: "symbol:csharp:IConfiguration",
      type: "INJECTS",
      file: "KelpApi/Services/ImageStorageDiagnosticsService.cs",
      range: range(),
      evidence: "Image storage configuration",
      confidence: 0.9
    }
  ];
  const patterns: PatternRecord[] = [
    {
      recordType: "pattern",
      id: "pattern:dotnet:interface-implementation-pair",
      name: "Interface implementation pair",
      category: "architecture",
      language: "csharp",
      confidence: 0.35,
      frequency: 1,
      counterExampleCount: 0,
      instances: [{ name: "IMPLEMENTS", files: ["Services/UserService.cs"], symbols: ["symbol:csharp:Example.UserService"] }],
      rulesObserved: ["Concrete classes implement interfaces."],
      agentGuidance: "Mirror interface/implementation pairs."
    },
    {
      recordType: "pattern",
      id: "pattern:aspnet:controller-service-flow",
      name: "Controller-service flow",
      category: "feature-flow",
      language: "csharp",
      confidence: 0.8,
      frequency: 1,
      counterExampleCount: 0,
      instances: [
        { name: "User feature", files: ["Controllers/UserController.cs", "Services/UserService.cs"], symbols: ["symbol:csharp:Example.UserController", "symbol:csharp:Example.UserService"] },
        { name: "Admin user feature", files: ["AdminTools/Pages/Users.cshtml.cs"], symbols: ["symbol:csharp:AdminTools.Pages.UsersModel"] }
      ],
      rulesObserved: ["Controllers depend on service interfaces."],
      agentGuidance: "Add endpoint behavior through the existing controller-service pair."
    }
  ];

  await rebuildSqliteIndex(indexPath, { files, symbols, relationships, patterns });
  const database = await openSqliteIndex(indexPath);
  try {
    const service = new QueryService(database);
    const symbolResult = service.findSymbols("UserService");
    const relationshipResult = service.findRelationships("UserService");
    const patternResult = service.findPatterns("interface");
    const patternMapResult = service.findPatternMap();
    const flowResult = service.findFlow("save-user");
    const trimRelationships = service.findRelationships("string.Trim");
    const whereToAddResult = service.whereToAdd("add user endpoint field");
    const scopedService = new QueryService(database, { projectContext: "Web" });
    const scopedFlowResult = scopedService.findFlow("save-user");
    const scopedSearchResult = scopedService.search("save-user");
    const scopedWhereToAddResult = scopedService.whereToAdd("save-user");
    const scopedIdentityWhereToAddResult = scopedService.whereToAdd("initial user creation profile setup");
    const partialContextRegistrationWhereToAddResult = new QueryService(database, { projectContext: "WebUI" }).whereToAdd("add initial profile setup steps after user registration");
    const partialContextSearchResult = new QueryService(database, { projectContext: "WebUI" }).search("profile setup registration");
    const scopedSharedDependencyFlowResult = new QueryService(database, { projectContext: "AdminTools" }).findFlow("image storage");
    const partialContextWhereToAddResult = new QueryService(database, { projectContext: "WebUI" }).whereToAdd("initial user creation profile setup");
    const ambiguousContextWhereToAddResult = new QueryService(database, { projectContext: "Admin" }).whereToAdd("save user");
    const broadWhereToAddResult = new QueryService(database, { projectContext: "Web" }).whereToAdd("user");

    assert.strictEqual(symbolResult.symbols[0], "symbol:csharp:Example.UserService");
    assert.ok(relationshipResult.relationships.some((relationship) => relationship.type === "IMPLEMENTS"));
    const implementsRelationship = relationshipResult.relationships.find((relationship) => relationship.type === "IMPLEMENTS");
    assert.strictEqual((implementsRelationship?.fromLocation as Record<string, any>)?.file, "Services/UserService.cs");
    assert.strictEqual((implementsRelationship?.fromLocation as Record<string, any>)?.range?.startLine, 1);
    assert.strictEqual((implementsRelationship?.fromLocation as Record<string, any>)?.approximate, false);
    assert.strictEqual((implementsRelationship?.toLocation as Record<string, any>)?.file, "Services/UserService.cs");
    assert.strictEqual((implementsRelationship?.toLocation as Record<string, any>)?.range?.startLine, 1);
    assert.strictEqual((implementsRelationship?.toLocation as Record<string, any>)?.approximate, false);
    assert.strictEqual(patternResult.patterns[0].id, "pattern:dotnet:interface-implementation-pair");
    assert.match(patternMapResult.answer, /Pattern map found 2 detected project pattern\(s\) across 2 architecture area\(s\)/);
    assert.ok(patternMapResult.evidence.some((item) => item.recordType === "patternMapArea" && item.category === "feature-flow"));
    assert.ok(patternMapResult.patterns.some((item) => item.id === "pattern:aspnet:controller-service-flow"));
    assert.ok(patternMapResult.files.includes("Controllers/UserController.cs"));
    assert.ok(patternMapResult.nextQueries.some((query) => query.includes("pattern:aspnet:controller-service-flow")));
    assert.ok(flowResult.flow.some((edge) => edge.type === "HANDLES_EVENT"));
    assert.ok(flowResult.flow.some((edge) => edge.type === "CALLS"));
    assert.ok(flowResult.flow.some((edge) => edge.type === "PROJECT_REFERENCES"));
    assert.ok(!flowResult.flow.some((edge) => edge.to === "symbol:csharp:string.Trim()"));
    assert.ok(!relationshipResult.relationships.some((edge) => edge.to === "symbol:csharp:string.Trim()"));
    assert.ok(!relationshipResult.nextQueries.some((query) => query.includes("string.Trim")));
    assert.ok(trimRelationships.relationships.some((edge) => edge.to === "symbol:csharp:string.Trim()"));
    assert.ok(whereToAddResult.evidence.some((item) => item.recordType === "fileRecommendation" && item.file === "Controllers/UserController.cs"));
    assert.ok((whereToAddResult.evidence.find((item) => item.file === "Controllers/UserController.cs")?.reasons as string[]).length > 0);
    assert.ok(scopedFlowResult.flow.some((edge) => edge.file === "Web/UserController.cs"));
    assert.ok(scopedFlowResult.flow.some((edge) => edge.type === "PROJECT_REFERENCES"));
    assert.ok(!scopedFlowResult.flow.some((edge) => stringValue(edge.file).startsWith("AdminTools/")));
    assert.ok(!scopedSearchResult.files.some((file) => file.startsWith("AdminTools/")));
    assert.ok(!scopedWhereToAddResult.files.some((file) => file.startsWith("AdminTools/")));
    assert.ok(!scopedWhereToAddResult.files.includes("Web/Program.cs"));
    assert.ok(scopedIdentityWhereToAddResult.files.includes("Web/Areas/Identity/Pages/Account/Register.cshtml.cs"));
    if (scopedIdentityWhereToAddResult.files.includes("Web/Program.cs")) {
      assert.ok(scopedIdentityWhereToAddResult.files.indexOf("Web/Areas/Identity/Pages/Account/Register.cshtml.cs") < scopedIdentityWhereToAddResult.files.indexOf("Web/Program.cs"));
    }
    assert.ok(partialContextWhereToAddResult.files.includes("Kelp2025_WebUI/Areas/Identity/Pages/Account/Register.cshtml.cs"));
    assert.ok(!partialContextWhereToAddResult.files.some((file) => file.startsWith("AdminTools/")));
    assert.ok(partialContextRegistrationWhereToAddResult.files.includes("Kelp2025_WebUI/Areas/Identity/Pages/Account/Register.cshtml.cs"));
    if (partialContextRegistrationWhereToAddResult.files.includes("Kelp2025_WebUI/Program.cs")) {
      assert.ok(
        partialContextRegistrationWhereToAddResult.files.indexOf("Kelp2025_WebUI/Areas/Identity/Pages/Account/Register.cshtml.cs")
          < partialContextRegistrationWhereToAddResult.files.indexOf("Kelp2025_WebUI/Program.cs")
      );
    }
    assert.ok(partialContextSearchResult.files.includes("Kelp2025_WebUI/Areas/Identity/Pages/Account/Register.cshtml.cs"));
    assert.ok(!partialContextSearchResult.files.some((file) => file.startsWith("AdminTools/")));
    assert.ok(scopedSharedDependencyFlowResult.flow.some((edge) => stringValue(edge.file).startsWith("AdminTools/")));
    assert.ok(!scopedSharedDependencyFlowResult.flow.some((edge) => stringValue(edge.file) === "AdminTools/Services/AdminBridgeService.cs"));
    assert.ok(!scopedSharedDependencyFlowResult.flow.some((edge) => stringValue(edge.file) === "AdminTools/Pages/Geography.cshtml.cs"));
    assert.ok(!scopedSharedDependencyFlowResult.flow.some((edge) => stringValue(edge.file).startsWith("KelpApi/")));
    assert.match(ambiguousContextWhereToAddResult.answer, /Ambiguous --context "Admin"/);
    assert.strictEqual(ambiguousContextWhereToAddResult.confidence, 0.1);
    assert.ok(ambiguousContextWhereToAddResult.evidence.some((item) => item.recordType === "contextCandidate" && item.context === "AdminTools"));
    assert.ok(ambiguousContextWhereToAddResult.evidence.some((item) => item.recordType === "contextCandidate" && item.context === "AdminApi"));
    assert.ok(ambiguousContextWhereToAddResult.nextQueries.some((query) => query.includes('--context "AdminTools"')));
    assert.ok(ambiguousContextWhereToAddResult.nextQueries.some((query) => query.includes('--context "AdminApi"')));
    assert.deepStrictEqual(ambiguousContextWhereToAddResult.files, []);
    assert.ok(broadWhereToAddResult.confidence <= 0.65);
    assert.ok(broadWhereToAddResult.evidence.some((item) => item.recordType === "caveat" && /Query is broad/.test(stringValue(item.message))));
    assert.ok(relationshipResult.nextQueries.length > 0);
  } finally {
    database.close();
  }
});

test("where-to-add ranks feature-specific form files before base controllers and composition roots", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-query-ranking-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const files: FileRecord[] = [
    {
      recordType: "file",
      id: "file:Web/Controllers/ProfileController.cs",
      path: "Web/Controllers/ProfileController.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "a".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source", "controller"]
    },
    {
      recordType: "file",
      id: "file:Web/Controllers/ProfileControllerBase.cs",
      path: "Web/Controllers/ProfileControllerBase.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "b".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source", "controller"]
    },
    {
      recordType: "file",
      id: "file:Web/Program.cs",
      path: "Web/Program.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "c".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source"]
    },
    {
      recordType: "file",
      id: "file:Web/Views/Profile/Edit.cshtml",
      path: "Web/Views/Profile/Edit.cshtml",
      extension: ".cshtml",
      language: "razor",
      sizeBytes: 100,
      sha256: "d".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["razor", "source", "view"]
    }
  ];
  const symbols: SymbolRecord[] = [
    {
      recordType: "symbol",
      id: "symbol:csharp:Web.Controllers.ProfileController.Save(ProfileRequest)",
      name: "Save",
      fullyQualifiedName: "Web.Controllers.ProfileController.Save",
      kind: "method",
      language: "csharp",
      file: "Web/Controllers/ProfileController.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:Web.Controllers.ProfileControllerBase.ResolveProfileRequest(string)",
      name: "ResolveProfileRequest",
      fullyQualifiedName: "Web.Controllers.ProfileControllerBase.ResolveProfileRequest",
      kind: "method",
      language: "csharp",
      file: "Web/Controllers/ProfileControllerBase.cs",
      range: range(),
      confidence: 1
    }
  ];
  const relationships: RelationshipRecord[] = [
    {
      recordType: "relationship",
      id: "relationship:auth:web:profile",
      from: "symbol:csharp:Web.Controllers.ProfileController.Save(ProfileRequest)",
      to: "auth:csharp:policy:CanEditProfile",
      type: "REQUIRES_AUTH",
      file: "Web/Controllers/ProfileController.cs",
      range: range(),
      evidence: "Validate and save profile request",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:calls:web:profile-base",
      from: "symbol:csharp:Web.Controllers.ProfileControllerBase.ResolveProfileRequest(string)",
      to: "symbol:csharp:string.Trim()",
      type: "CALLS",
      file: "Web/Controllers/ProfileControllerBase.cs",
      range: range(),
      evidence: "Resolve generic request",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:maps:web:profile",
      from: "route:csharp:/profile/save",
      to: "symbol:csharp:Web.Controllers.ProfileController.Save(ProfileRequest)",
      type: "MAPS_ROUTE",
      file: "Web/Program.cs",
      range: range(),
      evidence: "Map profile route",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:posts:web:profile",
      from: "symbol:razor:Web/Views/Profile/Edit.cshtml:form:profile-form",
      to: "route:csharp:/profile/save",
      type: "POSTS_TO",
      file: "Web/Views/Profile/Edit.cshtml",
      range: range(),
      evidence: "profile-form posts profile request",
      confidence: 0.9
    }
  ];

  await rebuildSqliteIndex(indexPath, { files, symbols, relationships, patterns: [] });
  const database = await openSqliteIndex(indexPath);
  try {
    const result = new QueryService(database, { projectContext: "Web" }).whereToAdd("add validation for profile request");

    assert.ok(result.files.includes("Web/Controllers/ProfileController.cs"));
    assert.ok(result.files.includes("Web/Views/Profile/Edit.cshtml"));
    if (result.files.includes("Web/Controllers/ProfileControllerBase.cs")) {
      assert.ok(result.files.indexOf("Web/Controllers/ProfileController.cs") < result.files.indexOf("Web/Controllers/ProfileControllerBase.cs"));
    }
    if (result.files.includes("Web/Program.cs")) {
      assert.ok(result.files.indexOf("Web/Controllers/ProfileController.cs") < result.files.indexOf("Web/Program.cs"));
    }
  } finally {
    database.close();
  }
});

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

function range() {
  return {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 1
  };
}

function fileRecord(filePath: string): FileRecord {
  return {
    recordType: "file",
    id: `file:${filePath}`,
    path: filePath,
    extension: path.extname(filePath),
    language: filePath.endsWith(".json") ? "json" : "csharp",
    sizeBytes: 100,
    sha256: "a".repeat(64),
    modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
    isGenerated: false,
    tags: ["source"]
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
