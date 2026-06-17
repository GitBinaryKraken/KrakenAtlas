import * as assert from "assert";
import test from "node:test";
import { SymbolRecord, RelationshipRecord } from "../src/model/records";
import { detectPatterns, renderConventionsMarkdown } from "../src/patterns/patternDetector";

test("detectPatterns emits .NET and web convention records from graph relationships", () => {
  const symbols: SymbolRecord[] = [
    symbol("symbol:csharp:Example.UserController", "UserController", "class", "csharp"),
    symbol("symbol:csharp:Example.UserService", "UserService", "class", "csharp"),
    symbol("symbol:csharp:Example.IUserService", "IUserService", "interface", "csharp")
  ];
  const relationships: RelationshipRecord[] = [
    relationship("symbol:csharp:Example.UserService", "symbol:csharp:Example.IUserService", "IMPLEMENTS", "Services/UserService.cs"),
    relationship("symbol:csharp:Example.UserController", "symbol:csharp:Example.IUserService", "INJECTS", "Controllers/UserController.cs"),
    relationship("symbol:csharp:Example.UserService", "symbol:csharp:Example.IUserService", "REGISTERS", "Program.cs"),
    relationship("symbol:csharp:Example.AppDbContext.Users", "symbol:csharp:Example.User", "DBSET_FOR", "Data/AppDbContext.cs"),
    relationship("symbol:csharp:Example.UserRepository.GetUser(Guid)", "symbol:csharp:Example.AppDbContext.Users", "USES_DBSET", "Repositories/UserRepository.cs"),
    relationship("symbol:csharp:Example.UserService.GetUser(Guid)", "symbol:csharp:Example.IUserRepository.GetUser(Guid)", "CALLS_REPOSITORY", "Services/UserService.cs"),
    relationship("symbol:csharp:Example.UserRepository.GetUser(Guid)", "symbol:csharp:Example.AppDbContext.Users", "QUERIES", "Repositories/UserRepository.cs"),
    relationship("symbol:csharp:Example.UserRepository.SaveUser(User)", "symbol:csharp:Example.AppDbContext.Users", "WRITES", "Repositories/UserRepository.cs"),
    relationship("config:csharp:Users", "symbol:csharp:Example.UserOptions", "BINDS_OPTIONS", "Program.cs"),
    relationship("symbol:csharp:Example.UserService", "symbol:csharp:Example.UserOptions", "USES_OPTIONS", "Services/UserService.cs"),
    relationship("file:Program.cs", "config:csharp:Users", "USES_CONFIG_KEY", "Program.cs"),
    relationship("symbol:csharp:Example.UserRequestValidator", "symbol:csharp:Example.UserRequest", "VALIDATES", "Validation/UserRequestValidator.cs"),
    relationship("symbol:csharp:Example.UserService", "symbol:csharp:Example.IValidator<Example.UserRequest>", "USES_VALIDATOR", "Services/UserService.cs"),
    relationship("symbol:csharp:Example.UserController.Save(Example.UserRequest)", "auth:csharp:policy:CanEditUsers", "REQUIRES_AUTH", "Controllers/UserController.cs"),
    relationship("file:Program.cs", "symbol:csharp:Example.UserDigestWorker", "RUNS_HOSTED_SERVICE", "Program.cs"),
    relationship("file:Program.cs", "middleware:csharp:UseAuthorization", "USES_MIDDLEWARE", "Program.cs"),
    relationship("symbol:csharp:Example.PreviewUserHandler", "symbol:csharp:Example.PreviewUserRequest", "HANDLES_REQUEST", "Handlers/PreviewUserHandler.cs"),
    relationship("symbol:dotnet-project:Web/Web.csproj", "symbol:dotnet-project:Domain/Domain.csproj", "PROJECT_REFERENCES", "Web/Web.csproj"),
    relationship("symbol:csharp:Example.UserController.GetUser(Guid)", "route:csharp:Controllers/UserController.cs:GetUser", "MAPS_ROUTE", "Controllers/UserController.cs"),
    relationship("symbol:csharp:Example.UserController.GetUser(Guid)", "symbol:csharp:Example.IUserService.GetUser(Guid)", "CALLS", "Controllers/UserController.cs"),
    relationship("symbol:razor:Views/User/Edit.cshtml:form:user-edit-form", "route:web:User.Save", "POSTS_TO", "Views/User/Edit.cshtml"),
    relationship("symbol:javascript:wwwroot/js/user-form.js:event:save-user:click", "symbol:razor:Views/User/Edit.cshtml:button:save-user", "HANDLES_EVENT", "wwwroot/js/user-form.js"),
    relationship("symbol:javascript:wwwroot/js/user-form.js", "route:web:/api/users", "CALLS", "wwwroot/js/user-form.js")
  ];

  const patterns = detectPatterns({ symbols, relationships });
  const ids = patterns.map((pattern) => pattern.id);

  assert.ok(ids.includes("pattern:dotnet:constructor-injection"));
  assert.ok(ids.includes("pattern:dotnet:interface-implementation-pair"));
  assert.ok(ids.includes("pattern:dotnet:service-registration"));
  assert.ok(ids.includes("pattern:dotnet:ef-data-access"));
  assert.ok(ids.includes("pattern:dotnet:repository-data-flow"));
  assert.ok(ids.includes("pattern:dotnet:options-config"));
  assert.ok(ids.includes("pattern:dotnet:validation-auth"));
  assert.ok(ids.includes("pattern:dotnet:hosted-service"));
  assert.ok(ids.includes("pattern:dotnet:middleware-pipeline"));
  assert.ok(ids.includes("pattern:dotnet:request-handler"));
  assert.ok(ids.includes("pattern:dotnet:project-references"));
  assert.ok(ids.includes("pattern:aspnet:controller-service-flow"));
  assert.ok(ids.includes("pattern:web:html-form-handler"));
  assert.ok(ids.includes("pattern:web:vanilla-js-dom-event"));
  assert.ok(ids.includes("pattern:web:fetch-endpoint"));

  const markdown = renderConventionsMarkdown(patterns);
  assert.match(markdown, /Constructor injection/);
  assert.match(markdown, /EF data access/);
  assert.match(markdown, /Repository data flow/);
  assert.match(markdown, /Options\/config binding/);
  assert.match(markdown, /Validation and authorization/);
  assert.match(markdown, /Hosted service/);
  assert.match(markdown, /Middleware pipeline/);
  assert.match(markdown, /Request handler/);
  assert.match(markdown, /\.NET project references/);
  assert.match(markdown, /Fetch endpoint call/);
});

function symbol(id: string, name: string, kind: string, language: string): SymbolRecord {
  return {
    recordType: "symbol",
    id,
    name,
    fullyQualifiedName: id.replace("symbol:csharp:", ""),
    kind,
    language,
    file: "Example.cs",
    range: {
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1
    },
    confidence: 1
  };
}

function relationship(from: string, to: string, type: string, file: string): RelationshipRecord {
  return {
    recordType: "relationship",
    id: `relationship:${type}:${from}->${to}`,
    from,
    to,
    type,
    file,
    range: {
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1
    },
    evidence: type,
    confidence: 0.9
  };
}
