using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using KrakenAtlas.Core;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Operations;

namespace KrakenAtlas.Analyzers.Roslyn;

internal static partial class CSharpFrameworkAnalyzer
{
    private static readonly StringComparer PathComparer = OperatingSystem.IsWindows()
        ? StringComparer.OrdinalIgnoreCase
        : StringComparer.Ordinal;

    public static async Task CollectAsync(
        string workspaceKey,
        IReadOnlyList<RoslynProjectAnalysis> projectAnalyses,
        IReadOnlyDictionary<string, DiscoveredFile> filesByPath,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyDictionary<string, ISymbol> symbolHandles,
        IReadOnlyDictionary<string, string> projectKeysByAssembly,
        ICollection<DiscoveredCodeRelation> relations,
        CancellationToken cancellationToken)
    {
        var relationKeys = relations
            .Select(CreateRelationIdentity)
            .ToHashSet(StringComparer.Ordinal);
        var endpoints = new List<HttpEndpointFact>();
        var requests = new List<HttpRequestFact>();
        var middleware = new List<MiddlewareFact>();
        var hostSurface = new List<AspNetHostFact>();

        foreach (var entry in symbolHandles)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (entry.Value is not IMethodSymbol method
                || !symbols.TryGetValue(entry.Key, out var methodEntity))
            {
                continue;
            }
            CollectHttpEndpoints(
                workspaceKey,
                entry.Key,
                method,
                methodEntity,
                symbols,
                projectKeysByAssembly,
                endpoints,
                AddRelation);
            CollectTestCase(
                workspaceKey,
                entry.Key,
                method,
                methodEntity,
                symbols,
                AddRelation);
        }

        foreach (var analysis in projectAnalyses)
        {
            foreach (var syntaxTree in analysis.Compilation.SyntaxTrees)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (string.IsNullOrWhiteSpace(syntaxTree.FilePath)
                    || !filesByPath.TryGetValue(NormalizePath(syntaxTree.FilePath), out var sourceFile)
                    || sourceFile.ProjectKey != analysis.Project.StableKey)
                {
                    continue;
                }

                var root = await syntaxTree.GetRootAsync(cancellationToken);
                var semanticModel = analysis.Compilation.GetSemanticModel(syntaxTree);
                foreach (var invocationSyntax in root.DescendantNodes().OfType<InvocationExpressionSyntax>().Reverse())
                {
                    if (semanticModel.GetOperation(invocationSyntax, cancellationToken) is not IInvocationOperation invocation)
                    {
                        continue;
                    }
                    CollectAspNetHostCall(
                        workspaceKey,
                        analysis.Project,
                        sourceFile,
                        semanticModel,
                        invocationSyntax,
                        invocation,
                        symbols,
                        projectKeysByAssembly,
                        hostSurface,
                        AddRelation,
                        cancellationToken);
                    CollectServiceRegistration(
                        workspaceKey,
                        analysis.Project,
                        sourceFile,
                        semanticModel,
                        invocationSyntax,
                        invocation,
                        symbols,
                        projectKeysByAssembly,
                        AddRelation,
                        cancellationToken);
                    CollectMinimalApiEndpoint(
                        workspaceKey,
                        analysis.Project,
                        sourceFile,
                        semanticModel,
                        invocationSyntax,
                        invocation,
                        symbols,
                        projectKeysByAssembly,
                        endpoints,
                        AddRelation,
                        cancellationToken);
                    CollectMinimalApiMetadata(
                        workspaceKey,
                        analysis.Project,
                        sourceFile,
                        semanticModel,
                        invocationSyntax,
                        invocation,
                        symbols,
                        projectKeysByAssembly,
                        AddRelation,
                        cancellationToken);
                    CollectMiddleware(
                        workspaceKey,
                        analysis.Project,
                        sourceFile,
                        semanticModel,
                        invocationSyntax,
                        invocation,
                        symbols,
                        projectKeysByAssembly,
                        middleware,
                        AddRelation,
                        cancellationToken);
                    CollectHttpRequest(
                        workspaceKey,
                        analysis.Project,
                        sourceFile,
                        semanticModel,
                        invocationSyntax,
                        invocation,
                        symbols,
                        projectKeysByAssembly,
                        requests,
                        AddRelation,
                        cancellationToken);
                    CollectSqlOperation(
                        workspaceKey,
                        analysis.Project,
                        sourceFile,
                        semanticModel,
                        invocationSyntax,
                        invocation,
                        symbols,
                        projectKeysByAssembly,
                        AddRelation,
                        cancellationToken);
                }
            }
        }

        ConnectMiddlewarePipeline(middleware, symbols, AddRelation);
        ConnectAspNetHostSurface(hostSurface, symbols, AddRelation);
        await CollectEfCoreAsync(
            workspaceKey,
            projectAnalyses,
            filesByPath,
            symbols,
            symbolHandles,
            projectKeysByAssembly,
            AddRelation,
            cancellationToken);

        ConnectHttpRoutes(symbols, relations);

        void AddRelation(DiscoveredCodeRelation relation)
        {
            if (relationKeys.Add(CreateRelationIdentity(relation)))
            {
                relations.Add(relation);
            }
        }
    }

    internal static void ConnectHttpRoutes(
        IReadOnlyDictionary<string, DiscoveredCodeSymbol> symbols,
        ICollection<DiscoveredCodeRelation> relations)
    {
        var relationKeys = relations.Select(CreateRelationIdentity).ToHashSet(StringComparer.Ordinal);
        var endpoints = symbols.Values
            .Where(symbol => symbol.Kind == "http_endpoint" && symbol.Locations.Count > 0)
            .Select(symbol => ParseHttpFact(symbol))
            .Where(fact => fact is not null)
            .Cast<HttpEndpointFact>()
            .ToArray();
        var requests = symbols.Values
            .Where(symbol => symbol.Kind == "http_request" && symbol.Locations.Count > 0)
            .Select(symbol => ParseHttpRequest(symbol))
            .Where(fact => fact is not null)
            .Cast<HttpRequestFact>()
            .ToArray();

        foreach (var request in requests)
        {
            foreach (var endpoint in endpoints.Where(endpoint =>
                endpoint.Verb == request.Verb && RouteMatches(request.RouteTemplate, endpoint.RouteTemplate)))
            {
                var relation = new DiscoveredCodeRelation(
                    request.EntityKey,
                    endpoint.EntityKey,
                    "matches_endpoint",
                    "static",
                    request.Evidence,
                    "framework",
                    "route_template");
                if (relationKeys.Add(CreateRelationIdentity(relation)))
                {
                    relations.Add(relation);
                }
            }
        }
    }

    private static HttpEndpointFact? ParseHttpFact(DiscoveredCodeSymbol symbol)
    {
        var separator = symbol.Name.IndexOf(' ');
        return separator <= 0
            ? null
            : new HttpEndpointFact(
                symbol.StableKey,
                symbol.Name[..separator],
                symbol.Name[(separator + 1)..],
                symbol.Locations[0]);
    }

    private static HttpRequestFact? ParseHttpRequest(DiscoveredCodeSymbol symbol)
    {
        var separator = symbol.Name.IndexOf(' ');
        return separator <= 0
            ? null
            : new HttpRequestFact(
                symbol.StableKey,
                symbol.Name[..separator],
                symbol.Name[(separator + 1)..],
                symbol.Locations[0]);
    }

    private static void CollectHttpEndpoints(
        string workspaceKey,
        string methodKey,
        IMethodSymbol method,
        DiscoveredCodeSymbol methodEntity,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyDictionary<string, string> projectKeysByAssembly,
        ICollection<HttpEndpointFact> endpoints,
        Action<DiscoveredCodeRelation> addRelation)
    {
        if (!IsController(method.ContainingType))
        {
            return;
        }

        var controllerRoute = GetAttributeTemplate(method.ContainingType.GetAttributes(), "RouteAttribute");
        var httpAttributes = method.GetAttributes()
            .Where(attribute => GetHttpVerb(attribute.AttributeClass?.Name) is not null)
            .ToArray();
        foreach (var attribute in httpAttributes)
        {
            var verb = GetHttpVerb(attribute.AttributeClass?.Name)!;
            var actionRoute = GetConstructorString(attribute);
            var route = CombineRoute(controllerRoute, actionRoute, method.ContainingType.Name, method.Name);
            var authorization = HasAttribute(method.GetAttributes(), "AllowAnonymousAttribute")
                || HasAttribute(method.ContainingType.GetAttributes(), "AllowAnonymousAttribute")
                    ? "anonymous"
                    : HasAttribute(method.GetAttributes(), "AuthorizeAttribute")
                        || HasAttribute(method.ContainingType.GetAttributes(), "AuthorizeAttribute")
                            ? "authorized"
                            : "unspecified";
            var evidence = methodEntity.Locations.First();
            var attributeDetails = method.GetAttributes()
                .Concat(method.ContainingType.GetAttributes())
                .Select(attribute => attribute.AttributeClass?.Name)
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .Distinct(StringComparer.Ordinal)
                .Cast<string>()
                .OrderBy(name => name, StringComparer.Ordinal)
                .ToArray();
            var entityKey = CreateSyntheticKey(
                "http_endpoint",
                $"{workspaceKey}|{methodKey}|{verb}|{route}");
            symbols[entityKey] = new DiscoveredCodeSymbol(
                entityKey,
                methodEntity.ProjectKey,
                "http_endpoint",
                $"{verb} {route}",
                $"{verb} {route}",
                string.Join(" | ", new[] { $"{verb} {route}", authorization }.Concat(attributeDetails)),
                "not_applicable",
                methodKey,
                [evidence],
                "http");
            endpoints.Add(new HttpEndpointFact(entityKey, verb, route, evidence));
            addRelation(new DiscoveredCodeRelation(
                entityKey,
                methodKey,
                "handled_by",
                "direct",
                evidence,
                "framework",
                authorization));
            addRelation(new DiscoveredCodeRelation(
                methodKey,
                entityKey,
                "exposes_endpoint",
                null,
                evidence,
                "framework",
                authorization));
            CollectEndpointContracts(
                workspaceKey,
                methodEntity.ProjectKey,
                entityKey,
                method,
                evidence,
                symbols,
                projectKeysByAssembly,
                addRelation);
            CollectAuthorizationPolicies(
                workspaceKey,
                methodEntity.ProjectKey,
                entityKey,
                method.GetAttributes().Concat(method.ContainingType.GetAttributes()),
                evidence,
                symbols,
                addRelation);
        }
    }

    private static void CollectServiceRegistration(
        string workspaceKey,
        DiscoveredProject project,
        DiscoveredFile sourceFile,
        SemanticModel semanticModel,
        InvocationExpressionSyntax invocationSyntax,
        IInvocationOperation invocation,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyDictionary<string, string> projectKeysByAssembly,
        Action<DiscoveredCodeRelation> addRelation,
        CancellationToken cancellationToken)
    {
        var lifetime = invocation.TargetMethod.Name switch
        {
            "AddScoped" => "scoped",
            "AddTransient" => "transient",
            "AddSingleton" => "singleton",
            _ => null
        };
        var registrationMethod = invocation.TargetMethod.ReducedFrom ?? invocation.TargetMethod;
        if (lifetime is null
            || invocation.TargetMethod.TypeArguments.Length == 0
            || registrationMethod.ContainingNamespace.ToDisplayString()
                != "Microsoft.Extensions.DependencyInjection")
        {
            return;
        }

        var serviceType = invocation.TargetMethod.TypeArguments[0] as INamedTypeSymbol;
        if (serviceType is null)
        {
            return;
        }
        var implementationType = invocation.TargetMethod.TypeArguments.Length > 1
            ? invocation.TargetMethod.TypeArguments[1] as INamedTypeSymbol
            : FindFactoryImplementation(invocationSyntax, semanticModel, cancellationToken)
                ?? (serviceType.TypeKind == TypeKind.Class ? serviceType : null);
        var serviceKey = CSharpDeclarationAnalyzer.ResolveKnownKey(
            workspaceKey, project.StableKey, serviceType, symbols, projectKeysByAssembly);
        var implementationKey = implementationType is null
            ? null
            : CSharpDeclarationAnalyzer.ResolveKnownKey(
                workspaceKey, project.StableKey, implementationType, symbols, projectKeysByAssembly);
        if (serviceKey is null)
        {
            return;
        }

        var evidence = CreateLocation(sourceFile, invocationSyntax);
        var sourceKey = CSharpDeclarationAnalyzer.ResolveSourceKey(
            workspaceKey,
            project.StableKey,
            semanticModel.GetEnclosingSymbol(invocationSyntax.SpanStart, cancellationToken),
            symbols);
        var registrationKey = CreateSyntheticKey(
            "service_registration",
            $"{workspaceKey}|{serviceKey}|{implementationKey}|{lifetime}|{sourceFile.RelativePath}|{invocationSyntax.SpanStart}");
        var serviceName = serviceType.ToDisplayString();
        var implementationName = implementationType?.ToDisplayString() ?? "factory_unresolved";
        symbols[registrationKey] = new DiscoveredCodeSymbol(
            registrationKey,
            project.StableKey,
            "service_registration",
            serviceType.Name,
            $"{serviceName} -> {implementationName}",
            $"{lifetime} {serviceName} => {implementationName}",
            "not_applicable",
            sourceKey,
            [evidence]);
        addRelation(new DiscoveredCodeRelation(
            registrationKey, serviceKey, "registers_service", null, evidence, "framework", lifetime));

        if (implementationKey is null || implementationType is null)
        {
            return;
        }
        addRelation(new DiscoveredCodeRelation(
            registrationKey, implementationKey, "registers_implementation", null, evidence, "framework", lifetime));
        if (serviceKey != implementationKey)
        {
            addRelation(new DiscoveredCodeRelation(
                serviceKey, implementationKey, "resolves_to", "di", evidence, "framework", lifetime));
        }

        if (serviceType.TypeKind != TypeKind.Interface)
        {
            return;
        }
        foreach (var serviceMember in serviceType.GetMembers())
        {
            var implementation = implementationType.FindImplementationForInterfaceMember(serviceMember);
            if (implementation is null)
            {
                continue;
            }
            var serviceMemberKey = CSharpDeclarationAnalyzer.ResolveKnownKey(
                workspaceKey, project.StableKey, serviceMember, symbols, projectKeysByAssembly);
            var implementationMemberKey = CSharpDeclarationAnalyzer.ResolveKnownKey(
                workspaceKey, project.StableKey, implementation, symbols, projectKeysByAssembly);
            if (serviceMemberKey is not null && implementationMemberKey is not null)
            {
                addRelation(new DiscoveredCodeRelation(
                    serviceMemberKey,
                    implementationMemberKey,
                    "dispatches_to",
                    "di",
                    evidence,
                    "framework",
                    lifetime));
            }
        }
    }

    private static void CollectTestCase(
        string workspaceKey,
        string methodKey,
        IMethodSymbol method,
        DiscoveredCodeSymbol methodEntity,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        Action<DiscoveredCodeRelation> addRelation)
    {
        var framework = method.GetAttributes()
            .Select(attribute => GetTestFramework(attribute.AttributeClass?.ToDisplayString()))
            .FirstOrDefault(value => value is not null);
        if (framework is null || methodEntity.Locations.Count == 0)
        {
            return;
        }

        var evidence = methodEntity.Locations[0];
        var entityKey = CreateSyntheticKey("test_case", $"{workspaceKey}|{methodKey}|{framework}");
        symbols[entityKey] = new DiscoveredCodeSymbol(
            entityKey,
            methodEntity.ProjectKey,
            "test_case",
            method.Name,
            methodEntity.QualifiedName,
            $"{framework} test | {methodEntity.Signature}",
            "not_applicable",
            methodKey,
            [evidence],
            "csharp");
        addRelation(new DiscoveredCodeRelation(
            entityKey,
            methodKey,
            "executes_test",
            "direct",
            evidence,
            "framework",
            framework));
    }

    private static void CollectHttpRequest(
        string workspaceKey,
        DiscoveredProject project,
        DiscoveredFile sourceFile,
        SemanticModel semanticModel,
        InvocationExpressionSyntax invocationSyntax,
        IInvocationOperation invocation,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyDictionary<string, string> projectKeysByAssembly,
        ICollection<HttpRequestFact> requests,
        Action<DiscoveredCodeRelation> addRelation,
        CancellationToken cancellationToken)
    {
        var (verb, urlExpression) = GetHttpRequestArguments(invocationSyntax, invocation, semanticModel);
        if (verb is null || urlExpression is null)
        {
            return;
        }
        var routeTemplate = ExtractStringTemplate(urlExpression, semanticModel, cancellationToken);
        if (routeTemplate is null)
        {
            return;
        }
        routeTemplate = NormalizeRequestRoute(routeTemplate);
        if (!routeTemplate.StartsWith("/", StringComparison.Ordinal))
        {
            return;
        }

        var sourceKey = CSharpDeclarationAnalyzer.ResolveSourceKey(
            workspaceKey,
            project.StableKey,
            semanticModel.GetEnclosingSymbol(invocationSyntax.SpanStart, cancellationToken),
            symbols);
        var evidence = CreateLocation(sourceFile, invocationSyntax);
        var requestKey = CreateSyntheticKey(
            "http_request",
            $"{workspaceKey}|{sourceKey}|{verb}|{routeTemplate}|{sourceFile.RelativePath}|{invocationSyntax.SpanStart}");
        symbols[requestKey] = new DiscoveredCodeSymbol(
            requestKey,
            project.StableKey,
            "http_request",
            $"{verb} {routeTemplate}",
            $"{verb} {routeTemplate}",
            $"{verb} {routeTemplate}",
            "not_applicable",
            sourceKey,
            [evidence],
            "http");
        requests.Add(new HttpRequestFact(requestKey, verb, routeTemplate, evidence));
        addRelation(new DiscoveredCodeRelation(
            sourceKey, requestKey, "sends_http", "static", evidence, "framework", "request_template"));

        var enclosing = semanticModel.GetEnclosingSymbol(invocationSyntax.SpanStart, cancellationToken) as IMethodSymbol;
        var contract = enclosing is null ? null : UnwrapContractType(enclosing.ReturnType);
        var contractKey = contract is null
            ? null
            : CSharpDeclarationAnalyzer.ResolveKnownKey(
                workspaceKey, project.StableKey, contract, symbols, projectKeysByAssembly);
        if (contractKey is not null)
        {
            addRelation(new DiscoveredCodeRelation(
                requestKey, contractKey, "returns_contract", null, evidence, "framework"));
        }
    }

    private static void CollectSqlOperation(
        string workspaceKey,
        DiscoveredProject project,
        DiscoveredFile sourceFile,
        SemanticModel semanticModel,
        InvocationExpressionSyntax invocationSyntax,
        IInvocationOperation invocation,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyDictionary<string, string> projectKeysByAssembly,
        Action<DiscoveredCodeRelation> addRelation,
        CancellationToken cancellationToken)
    {
        if (!IsDapperOperation(invocation.TargetMethod)
            || invocationSyntax.ArgumentList.Arguments.Count == 0)
        {
            return;
        }
        var sqlExpression = invocationSyntax.ArgumentList.Arguments[0].Expression;
        var sql = ExtractStringTemplate(sqlExpression, semanticModel, cancellationToken, preserveInterpolationText: true);
        if (string.IsNullOrWhiteSpace(sql))
        {
            return;
        }
        var databaseObjects = ExtractDatabaseObjects(sql);
        if (databaseObjects.Count == 0)
        {
            return;
        }

        var operationKind = ClassifySql(sql);
        var sourceKey = CSharpDeclarationAnalyzer.ResolveSourceKey(
            workspaceKey,
            project.StableKey,
            semanticModel.GetEnclosingSymbol(invocationSyntax.SpanStart, cancellationToken),
            symbols);
        var evidence = CreateLocation(sourceFile, sqlExpression);
        var operationKey = CreateSyntheticKey(
            "database_operation",
            $"{workspaceKey}|{sourceKey}|{operationKind}|{Hash(sql)}|{sourceFile.RelativePath}|{invocationSyntax.SpanStart}");
        symbols[operationKey] = new DiscoveredCodeSymbol(
            operationKey,
            project.StableKey,
            "database_operation",
            operationKind,
            $"PostgreSQL {operationKind} {string.Join(", ", databaseObjects)}",
            $"{operationKind} PostgreSQL | objects {databaseObjects.Count}",
            "not_applicable",
            sourceKey,
            [evidence],
            "sql");
        addRelation(new DiscoveredCodeRelation(
            sourceKey, operationKey, "executes_sql", "static", evidence, "database", "postgresql"));

        foreach (var databaseObject in databaseObjects)
        {
            var objectKey = CreateSyntheticKey("database_object", $"{workspaceKey}|postgresql|{databaseObject}");
            if (!symbols.ContainsKey(objectKey))
            {
                symbols[objectKey] = new DiscoveredCodeSymbol(
                    objectKey,
                    project.StableKey,
                    "database_object",
                    databaseObject.Split('.').Last(),
                    databaseObject,
                    $"PostgreSQL table {databaseObject}",
                    "not_applicable",
                    null,
                    [evidence],
                    "sql");
            }
            else
            {
                var existing = symbols[objectKey];
                if (!existing.Locations.Contains(evidence))
                {
                    symbols[objectKey] = existing with
                    {
                        Locations = existing.Locations.Append(evidence).ToArray()
                    };
                }
            }
            addRelation(new DiscoveredCodeRelation(
                operationKey, objectKey, operationKind, null, evidence, "database", "postgresql"));
        }

        var materializedType = invocation.TargetMethod.TypeArguments.FirstOrDefault() as INamedTypeSymbol;
        var materializedKey = materializedType is null
            ? null
            : CSharpDeclarationAnalyzer.ResolveKnownKey(
                workspaceKey, project.StableKey, materializedType, symbols, projectKeysByAssembly);
        if (materializedKey is not null)
        {
            addRelation(new DiscoveredCodeRelation(
                operationKey, materializedKey, "materializes", null, evidence, "database"));
        }
    }

    private static INamedTypeSymbol? FindFactoryImplementation(
        InvocationExpressionSyntax invocation,
        SemanticModel semanticModel,
        CancellationToken cancellationToken)
    {
        foreach (var creation in invocation.ArgumentList.Arguments
            .SelectMany(argument => argument.DescendantNodesAndSelf().OfType<ObjectCreationExpressionSyntax>()))
        {
            if (semanticModel.GetTypeInfo(creation, cancellationToken).Type is INamedTypeSymbol type)
            {
                return type;
            }
        }
        return null;
    }

    private static (string? Verb, ExpressionSyntax? UrlExpression) GetHttpRequestArguments(
        InvocationExpressionSyntax syntax,
        IInvocationOperation operation,
        SemanticModel semanticModel)
    {
        var methodName = operation.TargetMethod.Name;
        var directVerb = methodName switch
        {
            "GetAsync" or "GetStringAsync" => "GET",
            "PostAsync" or "PostAsJsonAsync" => "POST",
            "PutAsync" or "PutAsJsonAsync" => "PUT",
            "PatchAsync" or "PatchAsJsonAsync" => "PATCH",
            "DeleteAsync" => "DELETE",
            _ => null
        };
        if (directVerb is not null && syntax.ArgumentList.Arguments.Count > 0)
        {
            return (directVerb, syntax.ArgumentList.Arguments[0].Expression);
        }

        if (operation.Type?.ToDisplayString() != "System.Net.Http.HttpRequestMessage"
            || syntax.ArgumentList.Arguments.Count < 2)
        {
            return (null, null);
        }
        var methodExpression = syntax.ArgumentList.Arguments[0].Expression;
        var methodSymbol = semanticModel.GetSymbolInfo(methodExpression).Symbol;
        var verb = methodSymbol is IPropertySymbol { ContainingType.Name: "HttpMethod" } property
            ? property.Name.ToUpperInvariant()
            : null;
        return (verb, syntax.ArgumentList.Arguments[1].Expression);
    }

    private static string? ExtractStringTemplate(
        ExpressionSyntax expression,
        SemanticModel semanticModel,
        CancellationToken cancellationToken,
        bool preserveInterpolationText = false)
    {
        if (semanticModel.GetConstantValue(expression, cancellationToken) is { HasValue: true, Value: string value })
        {
            return value;
        }
        if (expression is InterpolatedStringExpressionSyntax interpolated)
        {
            var builder = new StringBuilder();
            foreach (var content in interpolated.Contents)
            {
                if (content is InterpolatedStringTextSyntax text)
                {
                    builder.Append(text.TextToken.ValueText);
                }
                else if (content is InterpolationSyntax interpolation)
                {
                    var placeholder = preserveInterpolationText
                        ? interpolation.Expression.ToString()
                        : interpolation.Expression.DescendantNodesAndSelf()
                            .OfType<IdentifierNameSyntax>()
                            .LastOrDefault()?.Identifier.ValueText ?? "value";
                    builder.Append('{').Append(placeholder).Append('}');
                }
            }
            return builder.ToString();
        }
        if (expression is BinaryExpressionSyntax binary)
        {
            var left = ExtractStringTemplate(binary.Left, semanticModel, cancellationToken, preserveInterpolationText);
            var right = ExtractStringTemplate(binary.Right, semanticModel, cancellationToken, preserveInterpolationText);
            return left is null || right is null ? null : left + right;
        }
        if (semanticModel.GetSymbolInfo(expression, cancellationToken).Symbol is ILocalSymbol local)
        {
            var declaration = local.DeclaringSyntaxReferences.FirstOrDefault()?.GetSyntax(cancellationToken)
                as VariableDeclaratorSyntax;
            if (declaration?.Initializer?.Value is { } initializer)
            {
                return ExtractStringTemplate(initializer, semanticModel, cancellationToken, preserveInterpolationText);
            }
        }
        return null;
    }

    private static string NormalizeRequestRoute(string template)
    {
        template = template.Trim();
        if (Uri.TryCreate(template, UriKind.Absolute, out var uri))
        {
            return uri.PathAndQuery;
        }
        if (template.StartsWith('{'))
        {
            var end = template.IndexOf('}');
            if (end >= 0 && end + 1 < template.Length && template[end + 1] == '/')
            {
                template = template[(end + 1)..];
            }
        }
        return template;
    }

    private static bool RouteMatches(string requestTemplate, string endpointTemplate)
    {
        var requestPath = requestTemplate.Split('?', 2)[0].TrimEnd('/');
        var endpointPath = endpointTemplate.Split('?', 2)[0].TrimEnd('/');
        var requestSegments = requestPath.Split('/', StringSplitOptions.RemoveEmptyEntries);
        var endpointSegments = endpointPath.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (requestSegments.Length != endpointSegments.Length)
        {
            return false;
        }
        return requestSegments.Zip(endpointSegments).All(pair =>
            IsRouteParameter(pair.Second)
            || string.Equals(pair.First, pair.Second, StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsRouteParameter(string segment) => segment.StartsWith('{') && segment.EndsWith('}');

    private static string CombineRoute(
        string? controllerTemplate,
        string? actionTemplate,
        string controllerTypeName,
        string actionName)
    {
        var controller = controllerTypeName.EndsWith("Controller", StringComparison.Ordinal)
            ? controllerTypeName[..^"Controller".Length]
            : controllerTypeName;
        controllerTemplate = controllerTemplate?
            .Replace("[controller]", controller, StringComparison.OrdinalIgnoreCase)
            .Replace("[action]", actionName, StringComparison.OrdinalIgnoreCase);
        actionTemplate = actionTemplate?
            .Replace("[controller]", controller, StringComparison.OrdinalIgnoreCase)
            .Replace("[action]", actionName, StringComparison.OrdinalIgnoreCase);
        if (actionTemplate?.StartsWith('/') == true)
        {
            return NormalizeRoute(actionTemplate);
        }
        return NormalizeRoute(string.Join('/', new[] { controllerTemplate, actionTemplate }
            .Where(value => !string.IsNullOrWhiteSpace(value))));
    }

    private static string NormalizeRoute(string route) => "/" + route.Trim().Trim('/');

    private static string? GetAttributeTemplate(IEnumerable<AttributeData> attributes, string attributeName) =>
        attributes.FirstOrDefault(attribute => attribute.AttributeClass?.Name == attributeName) is { } attribute
            ? GetConstructorString(attribute)
            : null;

    private static string? GetConstructorString(AttributeData attribute) =>
        attribute.ConstructorArguments.FirstOrDefault() is { Value: string value } ? value : null;

    private static bool HasAttribute(IEnumerable<AttributeData> attributes, string attributeName) =>
        attributes.Any(attribute => attribute.AttributeClass?.Name == attributeName);

    private static string? GetHttpVerb(string? attributeName) => attributeName switch
    {
        "HttpGetAttribute" => "GET",
        "HttpPostAttribute" => "POST",
        "HttpPutAttribute" => "PUT",
        "HttpPatchAttribute" => "PATCH",
        "HttpDeleteAttribute" => "DELETE",
        "HttpHeadAttribute" => "HEAD",
        "HttpOptionsAttribute" => "OPTIONS",
        _ => null
    };

    private static string? GetTestFramework(string? attributeType) => attributeType switch
    {
        "Xunit.FactAttribute" or "Xunit.TheoryAttribute" => "xunit",
        "NUnit.Framework.TestAttribute"
            or "NUnit.Framework.TestCaseAttribute"
            or "NUnit.Framework.TestCaseSourceAttribute" => "nunit",
        "Microsoft.VisualStudio.TestTools.UnitTesting.TestMethodAttribute"
            or "Microsoft.VisualStudio.TestTools.UnitTesting.DataTestMethodAttribute" => "mstest",
        _ => null
    };

    private static bool IsController(INamedTypeSymbol type)
    {
        for (var current = type; current is not null; current = current.BaseType)
        {
            if (current.ToDisplayString() == "Microsoft.AspNetCore.Mvc.ControllerBase")
            {
                return true;
            }
        }
        return false;
    }

    private static bool IsDapperOperation(IMethodSymbol method)
    {
        var original = method.ReducedFrom ?? method;
        return original.ContainingNamespace.ToDisplayString() == "Dapper"
            && (original.Name.StartsWith("Query", StringComparison.Ordinal)
                || original.Name.StartsWith("Execute", StringComparison.Ordinal));
    }

    private static IReadOnlyList<string> ExtractDatabaseObjects(string sql) => DatabaseObjectRegex()
        .Matches(sql)
        .Select(match => match.Groups[1].Value.Replace("\"", string.Empty).ToLowerInvariant())
        .Distinct(StringComparer.Ordinal)
        .OrderBy(value => value, StringComparer.Ordinal)
        .ToArray();

    private static string ClassifySql(string sql)
    {
        var normalized = sql.TrimStart();
        if (normalized.StartsWith("SELECT", StringComparison.OrdinalIgnoreCase)
            || normalized.StartsWith("WITH", StringComparison.OrdinalIgnoreCase))
        {
            return "reads";
        }
        if (normalized.StartsWith("INSERT", StringComparison.OrdinalIgnoreCase))
        {
            return "inserts";
        }
        if (normalized.StartsWith("UPDATE", StringComparison.OrdinalIgnoreCase))
        {
            return "writes";
        }
        if (normalized.StartsWith("DELETE", StringComparison.OrdinalIgnoreCase))
        {
            return "deletes";
        }
        return "executes";
    }

    private static INamedTypeSymbol? UnwrapContractType(ITypeSymbol type)
    {
        var current = type as INamedTypeSymbol;
        while (current is { TypeArguments.Length: > 0 }
            && current.Name is "Task" or "ValueTask" or "ActionResult")
        {
            current = current.TypeArguments[0] as INamedTypeSymbol;
        }
        return current;
    }

    private static DiscoveredCodeLocation CreateLocation(DiscoveredFile file, SyntaxNode node)
    {
        var span = node.GetLocation().GetLineSpan();
        return new DiscoveredCodeLocation(
            file.RootPath,
            file.RelativePath,
            span.StartLinePosition.Line + 1,
            span.StartLinePosition.Character + 1,
            span.EndLinePosition.Line + 1,
            span.EndLinePosition.Character + 1,
            file.IsGenerated);
    }

    private static string CreateSyntheticKey(string prefix, string value) => $"{prefix}:{Hash(value)}";

    private static string Hash(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    private static string CreateRelationIdentity(DiscoveredCodeRelation relation) => string.Join('|',
        relation.SourceEntityKey,
        relation.TargetSymbolKey,
        relation.Domain,
        relation.Kind,
        relation.Evidence.SourceRootPath,
        relation.Evidence.SourceRelativePath,
        relation.Evidence.StartLine,
        relation.Evidence.StartColumn);

    private static string NormalizePath(string path) => Path.GetFullPath(path)
        .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

    [GeneratedRegex(
        """\b(?:FROM|JOIN|UPDATE|INTO|DELETE\s+FROM|TRUNCATE\s+TABLE)\s+((?:"?[A-Za-z_][A-Za-z0-9_]*"?\.)?"?[A-Za-z_][A-Za-z0-9_]*"?)""",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex DatabaseObjectRegex();

    private sealed record HttpEndpointFact(
        string EntityKey,
        string Verb,
        string RouteTemplate,
        DiscoveredCodeLocation Evidence);

    private sealed record HttpRequestFact(
        string EntityKey,
        string Verb,
        string RouteTemplate,
        DiscoveredCodeLocation Evidence);
}
