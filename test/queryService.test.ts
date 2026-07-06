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
      id: "file:Kelp2025_WebUI/Data/KelpUser.cs",
      path: "Kelp2025_WebUI/Data/KelpUser.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "a1".repeat(32),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source"]
    },
    {
      recordType: "file",
      id: "file:Kelp2025_WebUI/Data/ApplicationDbContext.cs",
      path: "Kelp2025_WebUI/Data/ApplicationDbContext.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "a2".repeat(32),
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
      id: "symbol:csharp:Kelp2025_WebUI.Data.KelpUser",
      name: "KelpUser",
      fullyQualifiedName: "Kelp2025_WebUI.Data.KelpUser",
      kind: "class",
      language: "csharp",
      file: "Kelp2025_WebUI/Data/KelpUser.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:Kelp2025_WebUI.Data.ApplicationDbContext",
      name: "ApplicationDbContext",
      fullyQualifiedName: "Kelp2025_WebUI.Data.ApplicationDbContext",
      kind: "class",
      language: "csharp",
      file: "Kelp2025_WebUI/Data/ApplicationDbContext.cs",
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
      id: "relationship:inherits:kelp-webui:user-identity",
      from: "symbol:csharp:Kelp2025_WebUI.Data.KelpUser",
      to: "symbol:csharp:Microsoft.AspNetCore.Identity.IdentityUser",
      type: "INHERITS",
      file: "Kelp2025_WebUI/Data/KelpUser.cs",
      range: range(),
      evidence: "KelpUser extends IdentityUser for AspNetUsers custom user properties",
      confidence: 0.95
    },
    {
      recordType: "relationship",
      id: "relationship:inherits:kelp-webui:dbcontext-identity",
      from: "symbol:csharp:Kelp2025_WebUI.Data.ApplicationDbContext",
      to: "symbol:csharp:Microsoft.AspNetCore.Identity.EntityFrameworkCore.IdentityDbContext<KelpUser>",
      type: "INHERITS",
      file: "Kelp2025_WebUI/Data/ApplicationDbContext.cs",
      range: range(),
      evidence: "ApplicationDbContext inherits IdentityDbContext<KelpUser>",
      confidence: 0.95
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
    const hotspotResult = service.findArchitectureHotspots();
    const flowResult = service.findFlow("save-user");
    const trimRelationships = service.findRelationships("string.Trim");
    const whereToAddResult = service.whereToAdd("add user endpoint field");
    const planChangeResult = service.planChange("add user endpoint field");
    const scopedService = new QueryService(database, { projectContext: "Web" });
    const scopedFlowResult = scopedService.findFlow("save-user");
    const scopedSearchResult = scopedService.search("save-user");
    const scopedWhereToAddResult = scopedService.whereToAdd("save-user");
    const scopedIdentityWhereToAddResult = scopedService.whereToAdd("initial user creation profile setup");
    const partialContextRegistrationWhereToAddResult = new QueryService(database, { projectContext: "WebUI" }).whereToAdd("add initial profile setup steps after user registration");
    const partialContextSearchResult = new QueryService(database, { projectContext: "WebUI" }).search("profile setup registration");
    const scopedSharedDependencyFlowResult = new QueryService(database, { projectContext: "AdminTools" }).findFlow("image storage");
    const partialContextWhereToAddResult = new QueryService(database, { projectContext: "WebUI" }).whereToAdd("initial user creation profile setup");
    const partialContextNewUserVariableWhereToAddResult = new QueryService(database, { projectContext: "WebUI" }).whereToAdd("new user variable");
    const partialContextNewAspectUserParameterWhereToAddResult = new QueryService(database, { projectContext: "WebUI" }).whereToAdd("new aspect user parameter");
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
    assert.match(hotspotResult.answer, /architecture hotspot candidate/);
    assert.ok(hotspotResult.evidence.some((item) => item.recordType === "architectureHotspot" && typeof item.file === "string"));
    assert.ok(hotspotResult.evidence.some((item) => item.recordType === "hotspotSummary" && item.source === "node_usage_summary"));
    assert.ok(hotspotResult.evidence.some((item) => item.recordType === "architectureHotspot" && item.hotspotSource === "node_usage_summary"));
    assert.ok(hotspotResult.nextQueries.some((query) => query.includes("kraken-atlas query relationships")));
    assert.ok(flowResult.flow.some((edge) => edge.type === "HANDLES_EVENT"));
    assert.ok(flowResult.flow.some((edge) => edge.type === "CALLS"));
    assert.ok(flowResult.flow.some((edge) => edge.type === "PROJECT_REFERENCES"));
    assert.ok(!flowResult.flow.some((edge) => edge.to === "symbol:csharp:string.Trim()"));
    assert.ok(!relationshipResult.relationships.some((edge) => edge.to === "symbol:csharp:string.Trim()"));
    assert.ok(!relationshipResult.nextQueries.some((query) => query.includes("string.Trim")));
    assert.ok(trimRelationships.relationships.some((edge) => edge.to === "symbol:csharp:string.Trim()"));
    assert.ok(whereToAddResult.evidence.some((item) => item.recordType === "fileRecommendation" && item.file === "Controllers/UserController.cs"));
    assert.ok((whereToAddResult.evidence.find((item) => item.file === "Controllers/UserController.cs")?.reasons as string[]).length > 0);
    assert.ok(typeof whereToAddResult.evidence.find((item) => item.file === "Controllers/UserController.cs")?.usageSummary === "object");
    assert.ok(whereToAddResult.evidence.some((item) =>
      item.recordType === "patternFit" &&
      item.patternId === "pattern:aspnet:controller-service-flow" &&
      Array.isArray(item.matchedFiles) &&
      item.matchedFiles.includes("Controllers/UserController.cs")
    ));
    assert.match(planChangeResult.answer, /Implementation plan/);
    assert.ok(planChangeResult.files.length > 0);
    assert.ok(planChangeResult.evidence.some((item) => item.recordType === "fileRecommendation"));
    assert.ok(planChangeResult.evidence.some((item) => item.recordType === "changePlanSummary"));
    assert.ok(planChangeResult.evidence.some((item) => item.recordType === "contextPackCommand"));
    assert.ok(planChangeResult.nextQueries.some((query) => query.includes("context plan-change")));
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
    assert.strictEqual(partialContextNewUserVariableWhereToAddResult.files[0], "Kelp2025_WebUI/Data/KelpUser.cs");
    assert.ok(partialContextNewUserVariableWhereToAddResult.files.includes("Kelp2025_WebUI/Data/ApplicationDbContext.cs"));
    assert.ok(!partialContextNewUserVariableWhereToAddResult.files.some((file) => file.includes("Controller")));
    assert.strictEqual(partialContextNewAspectUserParameterWhereToAddResult.files[0], "Kelp2025_WebUI/Data/KelpUser.cs");
    assert.ok(!partialContextNewAspectUserParameterWhereToAddResult.files.some((file) => file.includes("Controller")));
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

test("where-to-add carries matched node tags into recommendations and context packs", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-node-tag-ranking-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const requestId = "symbol:csharp:KelpApiDomain.SavePageDraftRequest";
  const files: FileRecord[] = [
    fileRecord("Kelp2025_WebUI/Services/Content/ContentEditorAdapter.cs"),
    fileRecord("KelpApiDomain/ViewModels/Pages/PageDraftModels.cs")
  ];
  const symbols: SymbolRecord[] = [
    {
      recordType: "symbol",
      id: "symbol:csharp:Kelp2025_WebUI.Services.Content.ContentEditorAdapter.BuildRequest()",
      name: "BuildRequest",
      fullyQualifiedName: "Kelp2025_WebUI.Services.Content.ContentEditorAdapter.BuildRequest",
      kind: "method",
      language: "csharp",
      file: "Kelp2025_WebUI/Services/Content/ContentEditorAdapter.cs",
      range: range(),
      confidence: 1
    },
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
  const relationships: RelationshipRecord[] = [{
    recordType: "relationship",
    id: "relationship:maps-property:page-draft-meta-description",
    from: "symbol:csharp:Kelp2025_WebUI.Services.Content.ContentEditorAdapter.BuildRequest()",
    to: "symbol:csharp:KelpApiDomain.SavePageDraftRequest.MetaDescription",
    type: "MAPS_PROPERTY",
    file: "Kelp2025_WebUI/Services/Content/ContentEditorAdapter.cs",
    range: range(),
    evidence: "MetaDescription = input.MetaDescription",
    confidence: 0.88
  }];

  await rebuildSqliteIndex(indexPath, { files, symbols, relationships, references: [], patterns: [] });
  const database = await openSqliteIndex(indexPath);
  try {
    const service = new QueryService(database, { projectContext: "Kelp2025_WebUI" });
    const result = service.whereToAdd("add meta description to page draft");
    const recommendation = result.evidence.find((item) =>
      item.recordType === "fileRecommendation" &&
      item.file === "Kelp2025_WebUI/Services/Content/ContentEditorAdapter.cs"
    );

    assert.ok(recommendation);
    const matchedTags = Array.isArray(recommendation?.matchedTags) ? recommendation.matchedTags : [];
    const reasons = Array.isArray(recommendation?.reasons) ? recommendation.reasons : [];
    assert.ok(matchedTags.includes("page-draft"));
    assert.ok(matchedTags.includes("meta-description"));
    assert.ok(reasons.some((reason) => typeof reason === "string" && reason.startsWith("Node tag match:")));

    const plan = service.planChange("add meta description to page draft");
    const planRecommendation = plan.evidence.find((item) =>
      item.recordType === "fileRecommendation" &&
      item.file === "Kelp2025_WebUI/Services/Content/ContentEditorAdapter.cs"
    );
    const planMatchedTags = Array.isArray(planRecommendation?.matchedTags) ? planRecommendation.matchedTags : [];
    assert.ok(planMatchedTags.includes("page-draft"));
    const contextPack = renderContextPack(plan);
    assert.match(contextPack, /Node tags: .*page-draft/);
    assert.match(contextPack, /Node tags: .*meta-description/);
  } finally {
    database.close();
  }
});

test("where-to-add warns when a requested field touches a shared request DTO", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-shared-contract-warning-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const requestId = "symbol:csharp:KelpApiDomain.SavePageDraftRequest";
  const files: FileRecord[] = [
    fileRecord("KelpApiDomain/ViewModels/Pages/PageDraftModels.cs"),
    fileRecord("Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs"),
    fileRecord("KelpApi/Controllers/PageController.cs")
  ];
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
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:Kelp2025_WebUI.Services.ComposableContent.PageComposableContentEditorAdapter.BuildRequest()",
      name: "BuildRequest",
      fullyQualifiedName: "Kelp2025_WebUI.Services.ComposableContent.PageComposableContentEditorAdapter.BuildRequest",
      kind: "method",
      language: "csharp",
      file: "Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:KelpApi.Controllers.PageController.SaveDraft(KelpApiDomain.SavePageDraftRequest)",
      name: "SaveDraft",
      fullyQualifiedName: "KelpApi.Controllers.PageController.SaveDraft",
      kind: "method",
      language: "csharp",
      file: "KelpApi/Controllers/PageController.cs",
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
  const relationships: RelationshipRecord[] = [
    {
      recordType: "relationship",
      id: "relationship:maps-property:save-page-draft-title",
      from: "symbol:csharp:Kelp2025_WebUI.Services.ComposableContent.PageComposableContentEditorAdapter.BuildRequest()",
      to: "symbol:csharp:KelpApiDomain.SavePageDraftRequest.PageTitle",
      type: "MAPS_PROPERTY",
      file: "Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs",
      range: range(),
      evidence: "PageTitle = model.PageTitle",
      confidence: 0.82
    },
    {
      recordType: "relationship",
      id: "relationship:handles-request:save-page-draft",
      from: "symbol:csharp:KelpApi.Controllers.PageController.SaveDraft(KelpApiDomain.SavePageDraftRequest)",
      to: requestId,
      type: "HANDLES_REQUEST",
      file: "KelpApi/Controllers/PageController.cs",
      range: range(),
      evidence: "SaveDraft(SavePageDraftRequest request)",
      confidence: 0.88
    }
  ];

  await rebuildSqliteIndex(indexPath, { files, symbols, references, relationships, patterns: [] });
  const database = await openSqliteIndex(indexPath);
  try {
    const service = new QueryService(database, { projectContext: "Kelp2025_WebUI" });
    const where = service.whereToAdd("add field to shared page draft request");
    const boundary = where.evidence.find((item) => item.recordType === "sharedContractBoundary");

    assert.ok(boundary);
    assert.strictEqual(boundary.nodeId, requestId);
    assert.deepStrictEqual(boundary.declaredIn, { KelpApiDomain: 1 });
    assert.ok(Array.isArray(boundary.roles) && boundary.roles.includes("request-dto"));
    assert.ok(Array.isArray(boundary.usedFrom) && boundary.usedFrom.includes("Kelp2025_WebUI"));
    assert.ok(Array.isArray(boundary.usedFrom) && boundary.usedFrom.includes("KelpApi"));
    assert.ok(Array.isArray(boundary.members) && boundary.members.includes("PageTitle"));
    const contractRecommendation = where.evidence.find((item) =>
      item.recordType === "fileRecommendation" &&
      item.file === "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs"
    );
    const contractRoles = Array.isArray(contractRecommendation?.symbolRoles) ? contractRecommendation.symbolRoles : [];
    const contractMembers = Array.isArray(contractRecommendation?.memberHints) ? contractRecommendation.memberHints as Array<Record<string, unknown>> : [];
    assert.ok(contractRecommendation);
    assert.ok(contractRoles.includes("request-dto"));
    assert.strictEqual((contractRecommendation?.projectHint as Record<string, unknown> | undefined)?.project, "KelpApiDomain");
    assert.ok(contractMembers.some((member) => member.name === "PageTitle"));

    const agentOutput = renderAgentResponse(where);
    assert.match(agentOutput, /Shared contract:/);
    assert.match(agentOutput, /SavePageDraftRequest/);
    assert.match(agentOutput, /members .*PageTitle/);

    const plan = service.planChange("add field to shared page draft request");
    assert.ok(plan.evidence.some((item) => item.recordType === "sharedContractBoundary" && item.nodeId === requestId));
    const checklist = plan.evidence.find((item) => item.recordType === "sharedContractChecklist" && item.nodeId === requestId);
    const checklistItems = Array.isArray(checklist?.items) ? checklist.items as Array<Record<string, unknown>> : [];
    assert.ok(checklist);
    assert.ok(checklistItems.some((item) => item.area === "contract"));
    assert.ok(checklistItems.some((item) => item.area === "mapping"));
    assert.ok(checklistItems.some((item) => item.area === "api-handler"));
    assert.ok(checklistItems.some((item) => item.area === "validation"));
    assert.ok(checklistItems.some((item) => item.area === "client-or-serialization"));
    assert.ok(checklistItems.some((item) => item.area === "tests"));
    assert.ok(plan.files.includes("KelpApiDomain/ViewModels/Pages/PageDraftModels.cs"));

    const planOutput = renderAgentResponse(plan);
    assert.match(planOutput, /Contract checklist:/);
    assert.match(planOutput, /Contract shape/);

    const contextPack = renderContextPack(plan);
    assert.match(contextPack, /Shared Contract Boundaries/);
    assert.match(contextPack, /Shared Contract Checklist/);
    assert.match(contextPack, /Client\/serialization impact/);
    assert.match(contextPack, /Guidance: project KelpApiDomain; roles .*request-dto/);
    assert.match(contextPack, /Members: SavePageDraftRequest\.PageTitle/);
  } finally {
    database.close();
  }
});

test("context pruning keeps selected tag and project relationships while dropping adjacent noise", () => {
  const requestId = "symbol:csharp:KelpApiDomain.SavePageDraftRequest";
  const recommendations: FileRecommendation[] = [{
    recordType: "fileRecommendation",
    file: "Kelp2025_WebUI/Services/PageDraftAdapter.cs",
    score: 20,
    reasons: [],
    matchedTerms: ["page", "draft"],
    matchedTags: ["page-draft"],
    patternsToFollow: [],
    relationshipEvidenceCount: 1,
    searchEvidenceCount: 0,
    relationshipDetails: [],
    anchorDetails: []
  }];
  const boundaries = [{
    recordType: "sharedContractBoundary",
    nodeId: requestId,
    name: "SavePageDraftRequest",
    file: "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs",
    projects: ["KelpApiDomain", "Kelp2025_WebUI", "KelpApi"],
    usedFrom: ["Kelp2025_WebUI", "KelpApi"]
  }];
  const relationships = [
    {
      id: "relationship:maps:page-draft",
      type: "MAPS_PROPERTY",
      from: "symbol:csharp:Kelp2025_WebUI.Services.PageDraftAdapter.BuildRequest()",
      to: "symbol:csharp:KelpApiDomain.SavePageDraftRequest.PageTitle",
      file: "Kelp2025_WebUI/Services/PageDraftAdapter.cs"
    },
    {
      id: "relationship:handles:page-draft",
      type: "HANDLES_REQUEST",
      from: "symbol:csharp:KelpApi.Controllers.PageController.SaveDraft(KelpApiDomain.SavePageDraftRequest)",
      to: requestId,
      file: "KelpApi/Controllers/PageController.cs"
    },
    {
      id: "relationship:maps:admin-report",
      type: "MAPS_PROPERTY",
      from: "symbol:csharp:AdminTools.Services.ReportAdapter.BuildRequest()",
      to: "symbol:csharp:AdminTools.Contracts.AdminReportRequest.Title",
      file: "AdminTools/Services/ReportAdapter.cs"
    },
    {
      id: "relationship:calls:identity-email-store",
      type: "CALLS",
      from: "symbol:csharp:Kelp2025_WebUI.Areas.Identity.Pages.Account.ExternalLoginModel.ExternalLoginModel()",
      to: "symbol:csharp:Kelp2025_WebUI.Areas.Identity.Pages.Account.ExternalLoginModel.GetEmailStore()",
      file: "Kelp2025_WebUI/Areas/Identity/Pages/Account/ExternalLogin.cshtml.cs"
    }
  ];

  const result = buildContextPruningResult(
    "add field to shared page draft request",
    ["KelpApiDomain/ViewModels/Pages/PageDraftModels.cs", "Kelp2025_WebUI/Services/PageDraftAdapter.cs"],
    recommendations,
    boundaries,
    relationships,
    [
      { nodeId: requestId, tag: "page-draft" },
      { nodeId: "symbol:csharp:KelpApiDomain.SavePageDraftRequest.PageTitle", tag: "page-draft" },
      { nodeId: "symbol:csharp:AdminTools.Contracts.AdminReportRequest.Title", tag: "admin-report" },
      { nodeId: "symbol:csharp:Kelp2025_WebUI.Areas.Identity.Pages.Account.ExternalLoginModel", tag: "pages" },
      { nodeId: "symbol:csharp:Kelp2025_WebUI.Areas.Identity.Pages.Account.ExternalLoginModel.GetEmailStore", tag: "identity-pages-account" }
    ],
    [
      { nodeId: requestId, project: "KelpApiDomain" },
      { nodeId: requestId, project: "Kelp2025_WebUI" },
      { nodeId: requestId, project: "KelpApi" },
      { nodeId: "symbol:csharp:AdminTools.Contracts.AdminReportRequest.Title", project: "AdminTools" },
      { nodeId: "symbol:csharp:Kelp2025_WebUI.Areas.Identity.Pages.Account.ExternalLoginModel", project: "Kelp2025_WebUI" },
      { nodeId: "symbol:csharp:Kelp2025_WebUI.Areas.Identity.Pages.Account.ExternalLoginModel.GetEmailStore", project: "Kelp2025_WebUI" }
    ]
  );

  assert.deepStrictEqual(result.relationships.map((relationship) => relationship.id), [
    "relationship:maps:page-draft",
    "relationship:handles:page-draft"
  ]);
  assert.strictEqual(result.evidence[0]?.recordType, "contextPruning");
  assert.strictEqual(result.evidence[0]?.originalRelationshipCount, 4);
  assert.strictEqual(result.evidence[0]?.keptRelationshipCount, 2);
  assert.ok(Array.isArray(result.evidence[0]?.tags) && result.evidence[0].tags.includes("page-draft"));
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
