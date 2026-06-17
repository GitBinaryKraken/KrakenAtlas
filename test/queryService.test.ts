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

    assert.strictEqual(symbolResult.symbols[0], "symbol:csharp:Example.UserService");
    assert.ok(relationshipResult.relationships.some((relationship) => relationship.type === "IMPLEMENTS"));
    assert.strictEqual(patternResult.patterns[0].id, "pattern:dotnet:interface-implementation-pair");
    assert.ok(flowResult.flow.some((edge) => edge.type === "HANDLES_EVENT"));
    assert.ok(flowResult.flow.some((edge) => edge.type === "CALLS"));
    assert.ok(flowResult.flow.some((edge) => edge.type === "PROJECT_REFERENCES"));
    assert.ok(!flowResult.flow.some((edge) => edge.to === "symbol:csharp:string.Trim()"));
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
    assert.ok(partialContextRegistrationWhereToAddResult.files.includes("Kelp2025_WebUI/Program.cs"));
    assert.ok(
      partialContextRegistrationWhereToAddResult.files.indexOf("Kelp2025_WebUI/Areas/Identity/Pages/Account/Register.cshtml.cs")
        < partialContextRegistrationWhereToAddResult.files.indexOf("Kelp2025_WebUI/Program.cs")
    );
    assert.ok(partialContextSearchResult.files.includes("Kelp2025_WebUI/Areas/Identity/Pages/Account/Register.cshtml.cs"));
    assert.ok(!partialContextSearchResult.files.some((file) => file.startsWith("AdminTools/")));
    assert.ok(scopedSharedDependencyFlowResult.flow.some((edge) => stringValue(edge.file).startsWith("AdminTools/")));
    assert.ok(!scopedSharedDependencyFlowResult.flow.some((edge) => stringValue(edge.file) === "AdminTools/Services/AdminBridgeService.cs"));
    assert.ok(!scopedSharedDependencyFlowResult.flow.some((edge) => stringValue(edge.file) === "AdminTools/Pages/Geography.cshtml.cs"));
    assert.ok(!scopedSharedDependencyFlowResult.flow.some((edge) => stringValue(edge.file).startsWith("KelpApi/")));
    assert.ok(relationshipResult.nextQueries.length > 0);
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
