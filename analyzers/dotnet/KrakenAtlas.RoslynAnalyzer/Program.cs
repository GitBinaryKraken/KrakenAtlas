using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Build.Locator;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.MSBuild;

var options = AnalyzerOptions.Parse(args);
if (options is null)
{
    Console.Error.WriteLine("Usage: KrakenAtlas.RoslynAnalyzer <workspace-or-project-path> [--output <folder>]");
    return 2;
}

var analyzer = new CSharpWorkspaceAnalyzer(options.InputPath);
var result = await analyzer.AnalyzeAsync();

if (!string.IsNullOrWhiteSpace(options.OutputFolder))
{
    Directory.CreateDirectory(options.OutputFolder);
    await Jsonl.WriteAsync(Path.Combine(options.OutputFolder, "symbols.jsonl"), result.Symbols);
    await Jsonl.WriteAsync(Path.Combine(options.OutputFolder, "references.jsonl"), result.References);
    await Jsonl.WriteAsync(Path.Combine(options.OutputFolder, "relationships.jsonl"), result.Relationships);
}
else
{
    foreach (var record in result.AllRecords())
    {
        Console.WriteLine(JsonSerializer.Serialize(record, Jsonl.Options));
    }
}

return 0;

internal sealed record AnalyzerOptions(string InputPath, string? OutputFolder)
{
    public static AnalyzerOptions? Parse(string[] args)
    {
        if (args.Length == 0)
        {
            return null;
        }

        var inputPath = Path.GetFullPath(args[0]);
        string? outputFolder = null;

        for (var i = 1; i < args.Length; i++)
        {
            if (args[i] == "--output" && i + 1 < args.Length)
            {
                outputFolder = Path.GetFullPath(args[++i]);
            }
        }

        return new AnalyzerOptions(inputPath, outputFolder);
    }
}

internal sealed class CSharpWorkspaceAnalyzer
{
    private static readonly HashSet<string> IgnoredDirectories = new(StringComparer.OrdinalIgnoreCase)
    {
        ".git",
        ".vs",
        ".vscode",
        "bin",
        "obj",
        "node_modules",
        ".kraken-atlas"
    };

    private readonly string _inputPath;
    private readonly string _workspaceRoot;

    public CSharpWorkspaceAnalyzer(string inputPath)
    {
        _inputPath = inputPath;
        _workspaceRoot = ResolveWorkspaceRoot(inputPath);
    }

    public async Task<AnalysisResult> AnalyzeAsync()
    {
        var result = new AnalysisResult();
        var documents = await LoadDocumentsAsync();

        var declaredTypes = CollectDeclaredTypes(documents);
        var dbSetProperties = CollectDbSetProperties(documents, declaredTypes);

        foreach (var document in documents)
        {
            AnalyzeDocument(document, declaredTypes, dbSetProperties, document.SemanticModel, result);
        }

        result.Deduplicate();
        return result;
    }

    private async Task<List<CSharpDocument>> LoadDocumentsAsync()
    {
        var workspaceInputs = DiscoverWorkspaceInputs(_inputPath).ToList();
        if (workspaceInputs.Count > 0)
        {
            var workspaceDocuments = await LoadMsBuildDocumentsAsync(workspaceInputs);
            if (workspaceDocuments.Count > 0)
            {
                return workspaceDocuments;
            }
        }

        return await LoadLooseDocumentsAsync();
    }

    private async Task<List<CSharpDocument>> LoadMsBuildDocumentsAsync(IReadOnlyList<string> workspaceInputs)
    {
        if (!MSBuildLocator.IsRegistered)
        {
            MSBuildLocator.RegisterDefaults();
        }

        var documents = new Dictionary<string, CSharpDocument>(StringComparer.OrdinalIgnoreCase);
        foreach (var workspaceInput in workspaceInputs)
        {
            using var workspace = MSBuildWorkspace.Create();
            workspace.WorkspaceFailed += (_, eventArgs) =>
                Console.Error.WriteLine($"Roslyn workspace warning: {eventArgs.Diagnostic.Message}");

            Solution solution;
            var extension = Path.GetExtension(workspaceInput);
            if (extension.Equals(".sln", StringComparison.OrdinalIgnoreCase)
                || extension.Equals(".slnx", StringComparison.OrdinalIgnoreCase))
            {
                solution = await workspace.OpenSolutionAsync(workspaceInput);
            }
            else
            {
                var project = await workspace.OpenProjectAsync(workspaceInput);
                solution = project.Solution;
            }

            foreach (var project in solution.Projects.Where(project => project.Language == LanguageNames.CSharp))
            {
                var compilation = await project.GetCompilationAsync();
                if (compilation is null)
                {
                    continue;
                }

                foreach (var sourceDocument in project.Documents)
                {
                    if (sourceDocument.FilePath is null
                        || !sourceDocument.FilePath.EndsWith(".cs", StringComparison.OrdinalIgnoreCase)
                        || IsIgnoredPath(sourceDocument.FilePath))
                    {
                        continue;
                    }

                    var tree = await sourceDocument.GetSyntaxTreeAsync();
                    var root = await sourceDocument.GetSyntaxRootAsync();
                    if (tree is null || root is null)
                    {
                        continue;
                    }

                    documents.TryAdd(
                        Path.GetFullPath(sourceDocument.FilePath),
                        new CSharpDocument(
                            sourceDocument.FilePath,
                            ToWorkspacePath(sourceDocument.FilePath),
                            tree,
                            root,
                            compilation.GetSemanticModel(tree)));
                }
            }
        }

        return documents.Values.OrderBy(document => document.RelativePath, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private async Task<List<CSharpDocument>> LoadLooseDocumentsAsync()
    {
        var documents = new List<CSharpDocument>();
        foreach (var filePath in DiscoverCSharpFiles(_inputPath))
        {
            var text = await File.ReadAllTextAsync(filePath);
            var tree = CSharpSyntaxTree.ParseText(text, path: filePath);
            var root = await tree.GetRootAsync();
            documents.Add(new CSharpDocument(filePath, ToWorkspacePath(filePath), tree, root, null!));
        }

        var compilation = CreateCompilation(documents);
        return documents
            .Select(document => document with { SemanticModel = compilation.GetSemanticModel(document.Tree) })
            .ToList();
    }

    private void AnalyzeDocument(
        CSharpDocument document,
        Dictionary<string, TypeDeclarationSyntax> declaredTypes,
        Dictionary<string, DbSetProperty> dbSetProperties,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        foreach (var type in document.Root.DescendantNodes().OfType<BaseTypeDeclarationSyntax>())
        {
            AddTypeSymbol(document, type, semanticModel, result);

            if (type is TypeDeclarationSyntax typeDeclaration)
            {
                AddInheritanceRelationships(document, typeDeclaration, declaredTypes, semanticModel, result);
                AddConstructorInjectionRelationships(document, typeDeclaration, declaredTypes, semanticModel, result);
                AddControllerRouteSymbols(document, typeDeclaration, semanticModel, result);
                AddAuthorizationRelationships(document, typeDeclaration, semanticModel, result);
                AddRazorPageHandlerSymbols(document, typeDeclaration, semanticModel, result);
            }
        }

        foreach (var member in document.Root.DescendantNodes().OfType<BaseMethodDeclarationSyntax>())
        {
            AddMethodLikeSymbol(document, member, semanticModel, result);
            AddReturnTypeRelationship(document, member, declaredTypes, semanticModel, result);
        }

        foreach (var property in document.Root.DescendantNodes().OfType<PropertyDeclarationSyntax>())
        {
            AddPropertySymbol(document, property, result);
            AddDbSetPropertyRelationship(document, property, dbSetProperties, result);
        }

        foreach (var invocation in document.Root.DescendantNodes().OfType<InvocationExpressionSyntax>())
        {
            AddDependencyRegistration(document, invocation, declaredTypes, semanticModel, result);
            AddHostedServiceRegistration(document, invocation, declaredTypes, semanticModel, result);
            AddMinimalApiRoute(document, invocation, result);
            AddMinimalApiAuthorization(document, invocation, result);
            AddMiddlewareUsage(document, invocation, semanticModel, result);
            AddCallRelationship(document, invocation, semanticModel, result);
            AddConfigurationUsage(document, invocation, declaredTypes, semanticModel, result);
        }

        foreach (var elementAccess in document.Root.DescendantNodes().OfType<ElementAccessExpressionSyntax>())
        {
            AddConfigurationIndexerUsage(document, elementAccess, semanticModel, result);
        }

        foreach (var memberAccess in document.Root.DescendantNodes().OfType<MemberAccessExpressionSyntax>())
        {
            AddDbSetUsageRelationship(document, memberAccess, dbSetProperties, semanticModel, result);
        }

        foreach (var assignment in document.Root.DescendantNodes().OfType<AssignmentExpressionSyntax>())
        {
            AddPropertyCopyRelationship(document, assignment, semanticModel, result);
        }
    }

    private void AddTypeSymbol(CSharpDocument document, BaseTypeDeclarationSyntax type, SemanticModel semanticModel, AnalysisResult result)
    {
        var name = type.Identifier.ValueText;
        var declaredSymbol = semanticModel.GetDeclaredSymbol(type);
        var fullyQualifiedName = declaredSymbol is null ? GetFullyQualifiedName(type) : GetSymbolDisplayName(declaredSymbol);
        var kind = type switch
        {
            ClassDeclarationSyntax => "class",
            InterfaceDeclarationSyntax => "interface",
            RecordDeclarationSyntax => "record",
            EnumDeclarationSyntax => "enum",
            StructDeclarationSyntax => "struct",
            _ => "unknown"
        };

        result.Symbols.Add(new SymbolRecord(
            "symbol",
            SymbolId(fullyQualifiedName),
            name,
            fullyQualifiedName,
            kind,
            "csharp",
            document.RelativePath,
            Range.FromNode(document.Tree, type),
            GetModifiers(type.Modifiers),
            null,
            GetTypePatterns(type),
            1.0));
    }

    private void AddMethodLikeSymbol(CSharpDocument document, BaseMethodDeclarationSyntax member, SemanticModel semanticModel, AnalysisResult result)
    {
        var containingType = member.FirstAncestorOrSelf<BaseTypeDeclarationSyntax>();
        if (containingType is null)
        {
            return;
        }

        var name = member switch
        {
            MethodDeclarationSyntax method => method.Identifier.ValueText,
            ConstructorDeclarationSyntax constructor => constructor.Identifier.ValueText,
            _ => member.Kind().ToString()
        };

        var kind = member is ConstructorDeclarationSyntax ? "constructor" : "method";
        var declaredSymbol = semanticModel.GetDeclaredSymbol(member);
        var fullyQualifiedName = declaredSymbol is null
            ? $"{GetFullyQualifiedName(containingType)}.{name}"
            : GetSymbolDisplayName(declaredSymbol);

        result.Symbols.Add(new SymbolRecord(
            "symbol",
            SymbolId(fullyQualifiedName),
            name,
            fullyQualifiedName,
            kind,
            "csharp",
            document.RelativePath,
            Range.FromNode(document.Tree, member),
            GetModifiers(member.Modifiers),
            null,
            Array.Empty<string>(),
            1.0));
    }

    private void AddPropertySymbol(CSharpDocument document, PropertyDeclarationSyntax property, AnalysisResult result)
    {
        var containingType = property.FirstAncestorOrSelf<BaseTypeDeclarationSyntax>();
        if (containingType is null)
        {
            return;
        }

        var fullyQualifiedName = $"{GetFullyQualifiedName(containingType)}.{property.Identifier.ValueText}";
        result.Symbols.Add(new SymbolRecord(
            "symbol",
            SymbolId(fullyQualifiedName),
            property.Identifier.ValueText,
            fullyQualifiedName,
            "property",
            "csharp",
            document.RelativePath,
            Range.FromNode(document.Tree, property),
            GetModifiers(property.Modifiers),
            null,
            Array.Empty<string>(),
            1.0));
    }

    private void AddDbSetPropertyRelationship(
        CSharpDocument document,
        PropertyDeclarationSyntax property,
        Dictionary<string, DbSetProperty> dbSetProperties,
        AnalysisResult result)
    {
        if (!dbSetProperties.TryGetValue(property.Identifier.ValueText, out var dbSet))
        {
            return;
        }

        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId("dbset_for", dbSet.PropertyName, dbSet.EntityName),
            SymbolId(dbSet.PropertyName),
            SymbolId(dbSet.EntityName),
            "DBSET_FOR",
            document.RelativePath,
            Range.FromNode(document.Tree, property),
            property.Type.ToString(),
            0.9));
    }

    private void AddInheritanceRelationships(
        CSharpDocument document,
        TypeDeclarationSyntax type,
        Dictionary<string, TypeDeclarationSyntax> declaredTypes,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        if (type.BaseList is null)
        {
            return;
        }

        var fromName = GetFullyQualifiedName(type);
        foreach (var baseType in type.BaseList.Types)
        {
            var targetName = baseType.Type.ToString();
            var targetSymbol = semanticModel.GetTypeInfo(baseType.Type).Type;
            var relationshipType = targetName.StartsWith("I", StringComparison.Ordinal) ? "IMPLEMENTS" : "INHERITS";
            if (targetSymbol?.TypeKind == TypeKind.Interface)
            {
                relationshipType = "IMPLEMENTS";
            }

            var toName = targetSymbol is null
                ? ResolveLikelyTypeName(type, targetName, declaredTypes)
                : GetSymbolDisplayName(targetSymbol);

            result.Relationships.Add(new RelationshipRecord(
                "relationship",
                RelationshipId(relationshipType.ToLowerInvariant(), fromName, toName),
                SymbolId(fromName),
                SymbolId(toName),
                relationshipType,
                document.RelativePath,
                Range.FromNode(document.Tree, baseType),
                baseType.ToString(),
                0.9));

            AddValidatorTargetRelationship(document, type, baseType.Type, declaredTypes, semanticModel, result);
            AddRequestHandlerRelationship(document, type, baseType.Type, declaredTypes, semanticModel, result);
        }
    }

    private void AddConstructorInjectionRelationships(
        CSharpDocument document,
        TypeDeclarationSyntax type,
        Dictionary<string, TypeDeclarationSyntax> declaredTypes,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        var fromName = GetFullyQualifiedName(type);
        var parameters = type.Members
            .OfType<ConstructorDeclarationSyntax>()
            .SelectMany(constructor => constructor.ParameterList.Parameters);
        if (type.ParameterList is not null)
        {
            parameters = parameters.Concat(type.ParameterList.Parameters);
        }

        foreach (var parameter in parameters)
        {
            if (parameter.Type is null)
            {
                continue;
            }

            var dependencyName = parameter.Type.ToString();
            AddOptionsUsageRelationship(document, type, parameter, declaredTypes, semanticModel, result);

            if (!LooksLikeDependency(dependencyName))
            {
                continue;
            }

            var dependencySymbol = semanticModel.GetTypeInfo(parameter.Type).Type;
            var toName = dependencySymbol is null
                ? ResolveLikelyTypeName(type, dependencyName, declaredTypes)
                : GetSymbolDisplayName(dependencySymbol);
            result.References.Add(new ReferenceRecord(
                "reference",
                $"reference:csharp:{document.RelativePath}:{Range.FromNode(document.Tree, parameter).StartLine}:{dependencyName}",
                dependencyName,
                SymbolId(toName),
                document.RelativePath,
                Range.FromNode(document.Tree, parameter),
                "constructor-parameter",
                parameter.ToString(),
                0.95));

            result.Relationships.Add(new RelationshipRecord(
                "relationship",
                RelationshipId("injects", fromName, toName),
                SymbolId(fromName),
                SymbolId(toName),
                "INJECTS",
                document.RelativePath,
                Range.FromNode(document.Tree, parameter),
                parameter.ToString(),
                0.95));

            AddValidatorUsageRelationship(document, type, parameter, declaredTypes, semanticModel, result);
        }
    }

    private void AddDependencyRegistration(
        CSharpDocument document,
        InvocationExpressionSyntax invocation,
        Dictionary<string, TypeDeclarationSyntax> declaredTypes,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess)
        {
            return;
        }

        var methodName = memberAccess.Name switch
        {
            GenericNameSyntax genericName => genericName.Identifier.ValueText,
            IdentifierNameSyntax identifierName => identifierName.Identifier.ValueText,
            _ => null
        };

        if (methodName is not ("AddScoped" or "AddTransient" or "AddSingleton"))
        {
            return;
        }

        if (memberAccess.Name is not GenericNameSyntax generic || generic.TypeArgumentList.Arguments.Count == 0)
        {
            return;
        }

        var fromType = generic.TypeArgumentList.Arguments[0];
        var factoryImplementation = generic.TypeArgumentList.Arguments.Count == 1
            ? invocation.DescendantNodes().OfType<ObjectCreationExpressionSyntax>().LastOrDefault()?.Type
            : null;
        var toType = generic.TypeArgumentList.Arguments.Count > 1
            ? generic.TypeArgumentList.Arguments[1]
            : factoryImplementation ?? fromType;
        var fromName = fromType.ToString();
        var toName = toType.ToString();
        var fromSymbol = semanticModel.GetTypeInfo(fromType).Type;
        var toSymbol = semanticModel.GetTypeInfo(toType).Type;
        var resolvedFromName = fromSymbol is null ? ResolveLikelyTypeName(invocation, fromName, declaredTypes) : GetSymbolDisplayName(fromSymbol);
        var resolvedToName = toSymbol is null ? ResolveLikelyTypeName(invocation, toName, declaredTypes) : GetSymbolDisplayName(toSymbol);

        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId("registers", resolvedToName, resolvedFromName),
            SymbolId(resolvedToName),
            SymbolId(resolvedFromName),
            "REGISTERS",
            document.RelativePath,
            Range.FromNode(document.Tree, invocation),
            invocation.ToString(),
            0.9));
    }

    private void AddHostedServiceRegistration(
        CSharpDocument document,
        InvocationExpressionSyntax invocation,
        Dictionary<string, TypeDeclarationSyntax> declaredTypes,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess
            || memberAccess.Name is not GenericNameSyntax generic
            || generic.Identifier.ValueText != "AddHostedService"
            || generic.TypeArgumentList.Arguments.Count == 0)
        {
            return;
        }

        var hostedServiceType = generic.TypeArgumentList.Arguments[0];
        var hostedServiceSymbol = semanticModel.GetTypeInfo(hostedServiceType).Type;
        var hostedServiceName = hostedServiceSymbol is null
            ? ResolveLikelyTypeName(invocation, hostedServiceType.ToString(), declaredTypes)
            : GetSymbolDisplayName(hostedServiceSymbol);

        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId("runs_hosted_service", document.RelativePath, hostedServiceName),
            $"file:{document.RelativePath}",
            SymbolId(hostedServiceName),
            "RUNS_HOSTED_SERVICE",
            document.RelativePath,
            Range.FromNode(document.Tree, invocation),
            invocation.ToString(),
            0.9));
    }

    private void AddControllerRouteSymbols(
        CSharpDocument document,
        TypeDeclarationSyntax type,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        if (!type.Identifier.ValueText.EndsWith("Controller", StringComparison.Ordinal))
        {
            return;
        }

        var controllerName = GetFullyQualifiedName(type);
        foreach (var method in type.Members.OfType<MethodDeclarationSyntax>())
        {
            var routeAttribute = method.AttributeLists.SelectMany(list => list.Attributes)
                .FirstOrDefault(IsRouteAttribute);

            if (routeAttribute is null)
            {
                continue;
            }

            var routeText = GetRouteText(routeAttribute) ?? method.Identifier.ValueText;
            var routeId = $"route:csharp:{document.RelativePath}:{method.Identifier.ValueText}";
            var methodSymbol = semanticModel.GetDeclaredSymbol(method);
            var methodName = methodSymbol is null
                ? $"{controllerName}.{method.Identifier.ValueText}"
                : GetSymbolDisplayName(methodSymbol);

            result.Symbols.Add(new SymbolRecord(
                "symbol",
                routeId,
                method.Identifier.ValueText,
                methodName,
                "route",
                "csharp",
                document.RelativePath,
                Range.FromNode(document.Tree, method),
                GetModifiers(method.Modifiers),
                routeText,
                new[] { "aspnet-controller-route" },
                0.9));

            result.Relationships.Add(new RelationshipRecord(
                "relationship",
                RelationshipId("maps_route", methodName, routeId),
                SymbolId(methodName),
                routeId,
                "MAPS_ROUTE",
                document.RelativePath,
                Range.FromNode(document.Tree, routeAttribute),
                routeAttribute.ToString(),
                0.9));
        }
    }

    private void AddMinimalApiRoute(CSharpDocument document, InvocationExpressionSyntax invocation, AnalysisResult result)
    {
        if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess)
        {
            return;
        }

        var methodName = memberAccess.Name.Identifier.ValueText;
        if (!methodName.StartsWith("Map", StringComparison.Ordinal) || methodName is "MapControllers" or "MapRazorPages")
        {
            return;
        }

        var firstArgument = invocation.ArgumentList.Arguments.FirstOrDefault()?.Expression;
        if (firstArgument is not LiteralExpressionSyntax literal || literal.Token.ValueText.Length == 0)
        {
            return;
        }

        var route = literal.Token.ValueText;
        var routeId = $"route:csharp:{document.RelativePath}:{Range.FromNode(document.Tree, invocation).StartLine}:{route}";

        result.Symbols.Add(new SymbolRecord(
            "symbol",
            routeId,
            route,
            route,
            "endpoint",
            "csharp",
            document.RelativePath,
            Range.FromNode(document.Tree, invocation),
            Array.Empty<string>(),
            methodName,
            new[] { "minimal-api-route" },
            0.85));

        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId("maps_route", document.RelativePath, routeId),
            $"file:{document.RelativePath}",
            routeId,
            "MAPS_ROUTE",
            document.RelativePath,
            Range.FromNode(document.Tree, invocation),
            invocation.ToString(),
            0.85));
    }

    private void AddMinimalApiAuthorization(CSharpDocument document, InvocationExpressionSyntax invocation, AnalysisResult result)
    {
        if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess)
        {
            return;
        }

        var methodName = memberAccess.Name.Identifier.ValueText;
        if (methodName != "RequireAuthorization")
        {
            return;
        }

        if (memberAccess.Expression is not InvocationExpressionSyntax routeInvocation
            || routeInvocation.Expression is not MemberAccessExpressionSyntax routeMemberAccess)
        {
            return;
        }

        var routeMethodName = routeMemberAccess.Name.Identifier.ValueText;
        if (!routeMethodName.StartsWith("Map", StringComparison.Ordinal) || routeMethodName is "MapControllers" or "MapRazorPages")
        {
            return;
        }

        var firstArgument = routeInvocation.ArgumentList.Arguments.FirstOrDefault()?.Expression;
        if (firstArgument is not LiteralExpressionSyntax literal || literal.Token.ValueText.Length == 0)
        {
            return;
        }

        var route = literal.Token.ValueText;
        var routeId = $"route:csharp:{document.RelativePath}:{Range.FromNode(document.Tree, routeInvocation).StartLine}:{route}";
        var requirement = GetAuthorizationRequirement(invocation.ArgumentList.Arguments.Select(argument => argument.Expression)) ?? "authenticated";

        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId("requires_auth", routeId, requirement),
            routeId,
            $"auth:csharp:{requirement}",
            "REQUIRES_AUTH",
            document.RelativePath,
            Range.FromNode(document.Tree, invocation),
            invocation.ToString(),
            0.85));
    }

    private void AddMiddlewareUsage(
        CSharpDocument document,
        InvocationExpressionSyntax invocation,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess)
        {
            return;
        }

        var methodName = memberAccess.Name switch
        {
            GenericNameSyntax genericName => genericName.Identifier.ValueText,
            IdentifierNameSyntax identifierName => identifierName.Identifier.ValueText,
            _ => null
        };

        if (methodName is null || !methodName.StartsWith("Use", StringComparison.Ordinal))
        {
            return;
        }

        if (!IsAspNetMiddlewarePipelineInvocation(memberAccess, invocation, semanticModel))
        {
            return;
        }

        string targetId;
        if (memberAccess.Name is GenericNameSyntax generic && generic.TypeArgumentList.Arguments.Count > 0)
        {
            var middlewareType = generic.TypeArgumentList.Arguments[0];
            var middlewareSymbol = semanticModel.GetTypeInfo(middlewareType).Type;
            var middlewareName = middlewareSymbol is null ? middlewareType.ToString() : GetSymbolDisplayName(middlewareSymbol);
            targetId = SymbolId(middlewareName);
        }
        else
        {
            targetId = $"middleware:csharp:{methodName}";
        }

        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId("uses_middleware", document.RelativePath, targetId),
            $"file:{document.RelativePath}",
            targetId,
            "USES_MIDDLEWARE",
            document.RelativePath,
            Range.FromNode(document.Tree, invocation),
            invocation.ToString(),
            0.85));
    }

    private static bool IsAspNetMiddlewarePipelineInvocation(
        MemberAccessExpressionSyntax memberAccess,
        InvocationExpressionSyntax invocation,
        SemanticModel semanticModel)
    {
        var receiverType = semanticModel.GetTypeInfo(memberAccess.Expression).Type;
        if (IsAspNetMiddlewarePipelineType(receiverType))
        {
            return true;
        }

        if (semanticModel.GetSymbolInfo(invocation).Symbol is IMethodSymbol methodSymbol)
        {
            var extensionReceiver = methodSymbol.ReducedFrom?.Parameters.FirstOrDefault()?.Type
                ?? (methodSymbol.Parameters.Length > 0 ? methodSymbol.Parameters[0].Type : null);
            if (IsAspNetMiddlewarePipelineType(extensionReceiver))
            {
                return true;
            }
        }

        var receiverName = memberAccess.Expression.ToString();
        return receiverName.Equals("app", StringComparison.OrdinalIgnoreCase)
            || receiverName.EndsWith("ApplicationBuilder", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsAspNetMiddlewarePipelineType(ITypeSymbol? type)
    {
        if (type is null)
        {
            return false;
        }

        var name = type.ToDisplayString(SymbolDisplayFormat.FullyQualifiedFormat);
        return name.Contains("Microsoft.AspNetCore.Builder.IApplicationBuilder", StringComparison.Ordinal)
            || name.Contains("Microsoft.AspNetCore.Builder.WebApplication", StringComparison.Ordinal);
    }

    private void AddRazorPageHandlerSymbols(
        CSharpDocument document,
        TypeDeclarationSyntax type,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        var pageName = GetRazorPageName(document.RelativePath);
        if (pageName is null || !type.Identifier.ValueText.EndsWith("Model", StringComparison.Ordinal))
        {
            return;
        }

        foreach (var method in type.Members.OfType<MethodDeclarationSyntax>())
        {
            var handlerName = GetRazorPageHandlerName(method.Identifier.ValueText);
            if (handlerName is null)
            {
                continue;
            }

            var routeId = $"route:razor-page-handler:{pageName}.{handlerName}";
            var methodSymbol = semanticModel.GetDeclaredSymbol(method);
            var methodName = methodSymbol is null
                ? $"{GetFullyQualifiedName(type)}.{method.Identifier.ValueText}"
                : GetSymbolDisplayName(methodSymbol);

            result.Symbols.Add(new SymbolRecord(
                "symbol",
                routeId,
                handlerName,
                methodName,
                "page-handler",
                "csharp",
                document.RelativePath,
                Range.FromNode(document.Tree, method),
                GetModifiers(method.Modifiers),
                handlerName,
                new[] { "razor-page-handler" },
                0.9));

            result.Relationships.Add(new RelationshipRecord(
                "relationship",
                RelationshipId("maps_route", methodName, routeId),
                SymbolId(methodName),
                routeId,
                "MAPS_ROUTE",
                document.RelativePath,
                Range.FromNode(document.Tree, method),
                method.Identifier.ValueText,
                0.9));
        }
    }

    private void AddAuthorizationRelationships(
        CSharpDocument document,
        TypeDeclarationSyntax type,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        var controllerAuth = type.AttributeLists.SelectMany(list => list.Attributes)
            .Where(IsAuthorizeAttribute)
            .ToArray();

        foreach (var method in type.Members.OfType<MethodDeclarationSyntax>())
        {
            var methodSymbol = semanticModel.GetDeclaredSymbol(method);
            if (methodSymbol is null)
            {
                continue;
            }

            var authAttributes = method.AttributeLists.SelectMany(list => list.Attributes)
                .Where(IsAuthorizeAttribute)
                .Concat(controllerAuth)
                .ToArray();

            foreach (var attribute in authAttributes)
            {
                var requirement = GetAuthorizationRequirement(attribute) ?? "authenticated";
                var methodName = GetSymbolDisplayName(methodSymbol);
                result.Relationships.Add(new RelationshipRecord(
                    "relationship",
                    RelationshipId("requires_auth", methodName, requirement),
                    SymbolId(methodName),
                    $"auth:csharp:{requirement}",
                    "REQUIRES_AUTH",
                    document.RelativePath,
                    Range.FromNode(document.Tree, attribute),
                    attribute.ToString(),
                    0.9));
            }
        }
    }

    private void AddCallRelationship(
        CSharpDocument document,
        InvocationExpressionSyntax invocation,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        if (IsInfrastructureInvocation(invocation))
        {
            return;
        }

        var containingMethod = invocation.FirstAncestorOrSelf<BaseMethodDeclarationSyntax>();
        var callerSymbol = containingMethod is null ? null : semanticModel.GetDeclaredSymbol(containingMethod);
        var calleeSymbol = semanticModel.GetSymbolInfo(invocation).Symbol as IMethodSymbol;

        if (callerSymbol is null || calleeSymbol is null || calleeSymbol.MethodKind == MethodKind.Constructor)
        {
            return;
        }

        var callerName = GetSymbolDisplayName(callerSymbol);
        var calleeName = GetSymbolDisplayName(calleeSymbol);
        if (!ShouldEmitCall(callerName, calleeName))
        {
            return;
        }

        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId("calls", callerName, calleeName),
            SymbolId(callerName),
            SymbolId(calleeName),
            "CALLS",
            document.RelativePath,
            Range.FromNode(document.Tree, invocation),
            invocation.ToString(),
            0.95));

        result.References.Add(new ReferenceRecord(
            "reference",
            $"reference:csharp:{document.RelativePath}:{Range.FromNode(document.Tree, invocation).StartLine}:{calleeName}",
            calleeSymbol.Name,
            SymbolId(calleeName),
            document.RelativePath,
            Range.FromNode(document.Tree, invocation),
            "call",
            invocation.ToString(),
            0.98));

        if (IsRepositoryType(calleeSymbol.ContainingType))
        {
            result.Relationships.Add(new RelationshipRecord(
                "relationship",
                RelationshipId("calls_repository", callerName, calleeName),
                SymbolId(callerName),
                SymbolId(calleeName),
                "CALLS_REPOSITORY",
                document.RelativePath,
                Range.FromNode(document.Tree, invocation),
                invocation.ToString(),
                0.9));
        }

        if (IsValidatorType(calleeSymbol.ContainingType))
        {
            result.Relationships.Add(new RelationshipRecord(
                "relationship",
                RelationshipId("uses_validator", callerName, GetSymbolDisplayName(calleeSymbol.ContainingType)),
                SymbolId(callerName),
                SymbolId(GetSymbolDisplayName(calleeSymbol.ContainingType)),
                "USES_VALIDATOR",
                document.RelativePath,
                Range.FromNode(document.Tree, invocation),
                invocation.ToString(),
                0.9));
        }
    }

    private void AddPropertyCopyRelationship(
        CSharpDocument document,
        AssignmentExpressionSyntax assignment,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        if (!assignment.IsKind(SyntaxKind.SimpleAssignmentExpression))
        {
            return;
        }

        var targetSymbol = semanticModel.GetSymbolInfo(assignment.Left).Symbol as IPropertySymbol;
        var sourceSymbol = semanticModel.GetSymbolInfo(assignment.Right).Symbol as IPropertySymbol;
        if (targetSymbol is null || sourceSymbol is null || SymbolEqualityComparer.Default.Equals(targetSymbol, sourceSymbol))
        {
            return;
        }

        var containingMethod = assignment.FirstAncestorOrSelf<BaseMethodDeclarationSyntax>();
        var mapperSymbol = containingMethod is null ? null : semanticModel.GetDeclaredSymbol(containingMethod);
        var sourceName = GetSymbolDisplayName(sourceSymbol);
        var targetName = GetSymbolDisplayName(targetSymbol);
        var mapperName = mapperSymbol is null ? document.RelativePath : GetSymbolDisplayName(mapperSymbol);

        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId("maps_property", sourceName, targetName),
            SymbolId(sourceName),
            SymbolId(targetName),
            "MAPS_PROPERTY",
            document.RelativePath,
            Range.FromNode(document.Tree, assignment),
            assignment.ToString(),
            0.82));

        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId("maps_property_in", mapperName, targetName),
            SymbolId(mapperName),
            SymbolId(targetName),
            "MAPS_PROPERTY",
            document.RelativePath,
            Range.FromNode(document.Tree, assignment),
            assignment.ToString(),
            0.72));
    }

    private void AddValidatorTargetRelationship(
        CSharpDocument document,
        TypeDeclarationSyntax validatorType,
        TypeSyntax baseType,
        Dictionary<string, TypeDeclarationSyntax> declaredTypes,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        var validatedType = GetValidatedType(baseType, semanticModel);
        if (validatedType is null)
        {
            return;
        }

        var validatorName = GetFullyQualifiedName(validatorType);
        var requestName = ResolveLikelyTypeName(baseType, validatedType, declaredTypes);
        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId("validates", validatorName, requestName),
            SymbolId(validatorName),
            SymbolId(requestName),
            "VALIDATES",
            document.RelativePath,
            Range.FromNode(document.Tree, baseType),
            baseType.ToString(),
            0.9));
    }

    private void AddRequestHandlerRelationship(
        CSharpDocument document,
        TypeDeclarationSyntax handlerType,
        TypeSyntax baseType,
        Dictionary<string, TypeDeclarationSyntax> declaredTypes,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        var handledRequestType = GetHandledRequestType(baseType, semanticModel);
        if (handledRequestType is null)
        {
            return;
        }

        var handlerName = GetFullyQualifiedName(handlerType);
        var requestName = ResolveLikelyTypeName(baseType, handledRequestType, declaredTypes);
        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId("handles_request", handlerName, requestName),
            SymbolId(handlerName),
            SymbolId(requestName),
            "HANDLES_REQUEST",
            document.RelativePath,
            Range.FromNode(document.Tree, baseType),
            baseType.ToString(),
            0.9));
    }

    private void AddValidatorUsageRelationship(
        CSharpDocument document,
        TypeDeclarationSyntax type,
        ParameterSyntax parameter,
        Dictionary<string, TypeDeclarationSyntax> declaredTypes,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        if (parameter.Type is null || GetValidatedType(parameter.Type, semanticModel) is null)
        {
            return;
        }

        var consumerName = GetFullyQualifiedName(type);
        var validatorSymbol = semanticModel.GetTypeInfo(parameter.Type).Type;
        var validatorName = validatorSymbol is null
            ? ResolveLikelyTypeName(parameter, parameter.Type.ToString(), declaredTypes)
            : GetSymbolDisplayName(validatorSymbol);

        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId("uses_validator", consumerName, validatorName),
            SymbolId(consumerName),
            SymbolId(validatorName),
            "USES_VALIDATOR",
            document.RelativePath,
            Range.FromNode(document.Tree, parameter),
            parameter.ToString(),
            0.9));
    }

    private void AddReturnTypeRelationship(
        CSharpDocument document,
        BaseMethodDeclarationSyntax member,
        Dictionary<string, TypeDeclarationSyntax> declaredTypes,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        if (member is not MethodDeclarationSyntax method)
        {
            return;
        }

        var methodSymbol = semanticModel.GetDeclaredSymbol(method);
        var returnSymbol = semanticModel.GetTypeInfo(method.ReturnType).Type;
        if (methodSymbol is null)
        {
            return;
        }

        var returnName = returnSymbol is null
            ? ResolveLikelyTypeName(method, method.ReturnType.ToString(), declaredTypes)
            : GetSymbolDisplayName(returnSymbol);

        if (IsPrimitiveOrFrameworkType(returnName))
        {
            return;
        }

        var methodName = GetSymbolDisplayName(methodSymbol);
        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId("returns_type", methodName, returnName),
            SymbolId(methodName),
            SymbolId(returnName),
            "RETURNS_TYPE",
            document.RelativePath,
            Range.FromNode(document.Tree, method.ReturnType),
            method.ReturnType.ToString(),
            0.9));
    }

    private void AddDbSetUsageRelationship(
        CSharpDocument document,
        MemberAccessExpressionSyntax memberAccess,
        Dictionary<string, DbSetProperty> dbSetProperties,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        if (!dbSetProperties.TryGetValue(memberAccess.Name.Identifier.ValueText, out var dbSet))
        {
            return;
        }

        var containingMethod = memberAccess.FirstAncestorOrSelf<BaseMethodDeclarationSyntax>();
        if (containingMethod is null)
        {
            return;
        }

        var methodSymbol = semanticModel.GetDeclaredSymbol(containingMethod);
        var methodName = methodSymbol is null
            ? GetFallbackMethodName(containingMethod)
            : GetSymbolDisplayName(methodSymbol);

        if (string.IsNullOrWhiteSpace(methodName))
        {
            return;
        }

        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId("uses_dbset", methodName, dbSet.PropertyName),
            SymbolId(methodName),
            SymbolId(dbSet.PropertyName),
            "USES_DBSET",
            document.RelativePath,
            Range.FromNode(document.Tree, memberAccess),
            memberAccess.ToString(),
            0.85));

        var dataAccessType = GetDbSetDataAccessType(memberAccess);
        if (dataAccessType is null)
        {
            return;
        }

        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId(dataAccessType.ToLowerInvariant(), methodName, dbSet.PropertyName),
            SymbolId(methodName),
            SymbolId(dbSet.PropertyName),
            dataAccessType,
            document.RelativePath,
            Range.FromNode(document.Tree, memberAccess),
            memberAccess.Parent?.ToString() ?? memberAccess.ToString(),
            0.85));
    }

    private void AddOptionsUsageRelationship(
        CSharpDocument document,
        TypeDeclarationSyntax type,
        ParameterSyntax parameter,
        Dictionary<string, TypeDeclarationSyntax> declaredTypes,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        if (parameter.Type is null)
        {
            return;
        }

        var optionType = GetOptionsType(parameter.Type, semanticModel);
        if (optionType is null)
        {
            return;
        }

        var optionName = ResolveLikelyTypeName(parameter, optionType, declaredTypes);
        var fromName = GetFullyQualifiedName(type);
        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId("uses_options", fromName, optionName),
            SymbolId(fromName),
            SymbolId(optionName),
            "USES_OPTIONS",
            document.RelativePath,
            Range.FromNode(document.Tree, parameter),
            parameter.ToString(),
            0.9));
    }

    private void AddConfigurationUsage(
        CSharpDocument document,
        InvocationExpressionSyntax invocation,
        Dictionary<string, TypeDeclarationSyntax> declaredTypes,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess)
        {
            return;
        }

        var methodName = memberAccess.Name.Identifier.ValueText;
        if (methodName is not ("GetSection" or "Bind" or "Configure"))
        {
            return;
        }

        var literal = invocation.DescendantNodes()
            .Concat(new[] { invocation })
            .OfType<LiteralExpressionSyntax>()
            .FirstOrDefault();

        if (literal is null || literal.Token.ValueText.Length == 0)
        {
            return;
        }

        AddConfigRelationship(document, invocation, literal.Token.ValueText, result);
        AddOptionsBindingRelationship(document, invocation, memberAccess, literal.Token.ValueText, declaredTypes, semanticModel, result);
    }

    private void AddOptionsBindingRelationship(
        CSharpDocument document,
        InvocationExpressionSyntax invocation,
        MemberAccessExpressionSyntax memberAccess,
        string configKey,
        Dictionary<string, TypeDeclarationSyntax> declaredTypes,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        if (memberAccess.Name is not GenericNameSyntax genericName || genericName.TypeArgumentList.Arguments.Count == 0)
        {
            return;
        }

        var methodName = genericName.Identifier.ValueText;
        if (methodName is not ("Configure" or "Bind"))
        {
            return;
        }

        var optionType = genericName.TypeArgumentList.Arguments[0];
        var optionSymbol = semanticModel.GetTypeInfo(optionType).Type;
        var optionName = optionSymbol is null
            ? ResolveLikelyTypeName(invocation, optionType.ToString(), declaredTypes)
            : GetSymbolDisplayName(optionSymbol);

        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId("binds_options", document.RelativePath, optionName),
            $"config:csharp:{configKey}",
            SymbolId(optionName),
            "BINDS_OPTIONS",
            document.RelativePath,
            Range.FromNode(document.Tree, invocation),
            invocation.ToString(),
            0.9));
    }

    private void AddConfigurationIndexerUsage(
        CSharpDocument document,
        ElementAccessExpressionSyntax elementAccess,
        SemanticModel semanticModel,
        AnalysisResult result)
    {
        var expressionType = semanticModel.GetTypeInfo(elementAccess.Expression).Type?.Name;
        if (expressionType is not ("IConfiguration" or "ConfigurationManager"))
        {
            return;
        }

        var literal = elementAccess.ArgumentList.Arguments
            .Select(argument => argument.Expression)
            .OfType<LiteralExpressionSyntax>()
            .FirstOrDefault();

        if (literal is null || literal.Token.ValueText.Length == 0)
        {
            return;
        }

        AddConfigRelationship(document, elementAccess, literal.Token.ValueText, result);
    }

    private void AddConfigRelationship(CSharpDocument document, SyntaxNode node, string configKey, AnalysisResult result)
    {
        var sourceId = $"file:{document.RelativePath}";
        var targetId = $"config:csharp:{configKey}";
        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId("uses_config", document.RelativePath, configKey),
            sourceId,
            targetId,
            "USES_CONFIG",
            document.RelativePath,
            Range.FromNode(document.Tree, node),
            node.ToString(),
            0.8));

        result.Relationships.Add(new RelationshipRecord(
            "relationship",
            RelationshipId("uses_config_key", document.RelativePath, configKey),
            sourceId,
            targetId,
            "USES_CONFIG_KEY",
            document.RelativePath,
            Range.FromNode(document.Tree, node),
            node.ToString(),
            0.85));
    }

    private static bool IsRouteAttribute(AttributeSyntax attribute)
    {
        var name = attribute.Name.ToString();
        return name is "Route" or "HttpGet" or "HttpPost" or "HttpPut" or "HttpDelete" or "HttpPatch"
            || name.EndsWith("Attribute", StringComparison.Ordinal) && IsRouteAttributeName(name[..^"Attribute".Length]);
    }

    private static bool IsRouteAttributeName(string name)
    {
        return name is "Route" or "HttpGet" or "HttpPost" or "HttpPut" or "HttpDelete" or "HttpPatch";
    }

    private static bool IsAuthorizeAttribute(AttributeSyntax attribute)
    {
        var name = attribute.Name.ToString();
        return name is "Authorize" or "AuthorizeAttribute"
            || name.EndsWith(".Authorize", StringComparison.Ordinal)
            || name.EndsWith(".AuthorizeAttribute", StringComparison.Ordinal);
    }

    private static string? GetAuthorizationRequirement(AttributeSyntax attribute)
    {
        if (attribute.ArgumentList is null)
        {
            return null;
        }

        foreach (var argument in attribute.ArgumentList.Arguments)
        {
            if (argument.Expression is LiteralExpressionSyntax literal && literal.Token.ValueText.Length > 0)
            {
                var prefix = argument.NameEquals?.Name.Identifier.ValueText is "Roles" ? "roles" : "policy";
                return $"{prefix}:{literal.Token.ValueText}";
            }
        }

        return null;
    }

    private static string? GetAuthorizationRequirement(IEnumerable<ExpressionSyntax> expressions)
    {
        foreach (var expression in expressions)
        {
            if (expression is LiteralExpressionSyntax literal && literal.Token.ValueText.Length > 0)
            {
                return $"policy:{literal.Token.ValueText}";
            }
        }

        return null;
    }

    private static string? GetRouteText(AttributeSyntax attribute)
    {
        var firstArgument = attribute.ArgumentList?.Arguments.FirstOrDefault()?.Expression;
        return firstArgument is LiteralExpressionSyntax literal ? literal.Token.ValueText : attribute.Name.ToString();
    }

    private static string? GetRazorPageName(string relativePath)
    {
        var normalized = relativePath.Replace('\\', '/');
        const string pagesPrefix = "Pages/";
        const string suffix = ".cshtml.cs";
        if (!normalized.StartsWith(pagesPrefix, StringComparison.OrdinalIgnoreCase)
            || !normalized.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return normalized[pagesPrefix.Length..^suffix.Length].Replace('/', '.');
    }

    private static string? GetRazorPageHandlerName(string methodName)
    {
        var cleanName = methodName.EndsWith("Async", StringComparison.Ordinal)
            ? methodName[..^"Async".Length]
            : methodName;

        foreach (var verb in new[] { "OnGet", "OnPost", "OnPut", "OnDelete", "OnPatch" })
        {
            if (cleanName.Equals(verb, StringComparison.Ordinal))
            {
                return "Default";
            }

            if (cleanName.StartsWith(verb, StringComparison.Ordinal) && cleanName.Length > verb.Length)
            {
                return cleanName[verb.Length..];
            }
        }

        return null;
    }

    private static string? GetDbSetEntityType(TypeSyntax type)
    {
        if (type is GenericNameSyntax genericName
            && genericName.Identifier.ValueText == "DbSet"
            && genericName.TypeArgumentList.Arguments.Count == 1)
        {
            return genericName.TypeArgumentList.Arguments[0].ToString();
        }

        if (type is QualifiedNameSyntax qualifiedName
            && qualifiedName.Right is GenericNameSyntax qualifiedGeneric
            && qualifiedGeneric.Identifier.ValueText == "DbSet"
            && qualifiedGeneric.TypeArgumentList.Arguments.Count == 1)
        {
            return qualifiedGeneric.TypeArgumentList.Arguments[0].ToString();
        }

        return null;
    }

    private static string? GetOptionsType(TypeSyntax type, SemanticModel semanticModel)
    {
        if (type is GenericNameSyntax genericName
            && IsOptionsWrapper(genericName.Identifier.ValueText)
            && genericName.TypeArgumentList.Arguments.Count == 1)
        {
            return genericName.TypeArgumentList.Arguments[0].ToString();
        }

        if (type is QualifiedNameSyntax qualifiedName
            && qualifiedName.Right is GenericNameSyntax qualifiedGeneric
            && IsOptionsWrapper(qualifiedGeneric.Identifier.ValueText)
            && qualifiedGeneric.TypeArgumentList.Arguments.Count == 1)
        {
            return qualifiedGeneric.TypeArgumentList.Arguments[0].ToString();
        }

        var typeSymbol = semanticModel.GetTypeInfo(type).Type as INamedTypeSymbol;
        if (typeSymbol is not null
            && IsOptionsWrapper(typeSymbol.Name)
            && typeSymbol.TypeArguments.Length == 1)
        {
            return GetSymbolDisplayName(typeSymbol.TypeArguments[0]);
        }

        return null;
    }

    private static bool IsOptionsWrapper(string name)
    {
        return name is "IOptions" or "IOptionsSnapshot" or "IOptionsMonitor" or "OptionsWrapper";
    }

    private static string? GetValidatedType(TypeSyntax type, SemanticModel semanticModel)
    {
        if (type is GenericNameSyntax genericName
            && IsValidatorWrapper(genericName.Identifier.ValueText)
            && genericName.TypeArgumentList.Arguments.Count == 1)
        {
            return genericName.TypeArgumentList.Arguments[0].ToString();
        }

        if (type is QualifiedNameSyntax qualifiedName
            && qualifiedName.Right is GenericNameSyntax qualifiedGeneric
            && IsValidatorWrapper(qualifiedGeneric.Identifier.ValueText)
            && qualifiedGeneric.TypeArgumentList.Arguments.Count == 1)
        {
            return qualifiedGeneric.TypeArgumentList.Arguments[0].ToString();
        }

        var typeSymbol = semanticModel.GetTypeInfo(type).Type as INamedTypeSymbol;
        if (typeSymbol is not null
            && IsValidatorWrapper(typeSymbol.Name)
            && typeSymbol.TypeArguments.Length == 1)
        {
            return GetSymbolDisplayName(typeSymbol.TypeArguments[0]);
        }

        return null;
    }

    private static bool IsValidatorWrapper(string name)
    {
        return name is "IValidator" or "AbstractValidator" or "Validator";
    }

    private static bool IsValidatorType(INamedTypeSymbol? type)
    {
        if (type is null)
        {
            return false;
        }

        return type.Name.EndsWith("Validator", StringComparison.Ordinal)
            || type.AllInterfaces.Any(validatorInterface => IsValidatorWrapper(validatorInterface.Name));
    }

    private static string? GetHandledRequestType(TypeSyntax type, SemanticModel semanticModel)
    {
        if (type is GenericNameSyntax genericName
            && IsRequestHandlerWrapper(genericName.Identifier.ValueText)
            && genericName.TypeArgumentList.Arguments.Count >= 1)
        {
            return genericName.TypeArgumentList.Arguments[0].ToString();
        }

        if (type is QualifiedNameSyntax qualifiedName
            && qualifiedName.Right is GenericNameSyntax qualifiedGeneric
            && IsRequestHandlerWrapper(qualifiedGeneric.Identifier.ValueText)
            && qualifiedGeneric.TypeArgumentList.Arguments.Count >= 1)
        {
            return qualifiedGeneric.TypeArgumentList.Arguments[0].ToString();
        }

        var typeSymbol = semanticModel.GetTypeInfo(type).Type as INamedTypeSymbol;
        if (typeSymbol is not null
            && IsRequestHandlerWrapper(typeSymbol.Name)
            && typeSymbol.TypeArguments.Length >= 1)
        {
            return GetSymbolDisplayName(typeSymbol.TypeArguments[0]);
        }

        return null;
    }

    private static bool IsRequestHandlerWrapper(string name)
    {
        return name is "IRequestHandler" or "INotificationHandler" or "ICommandHandler" or "IQueryHandler";
    }

    private static string? GetDbSetDataAccessType(MemberAccessExpressionSyntax dbSetMemberAccess)
    {
        var invocationMemberAccess = dbSetMemberAccess.Parent as MemberAccessExpressionSyntax;
        var invocation = invocationMemberAccess?.Parent as InvocationExpressionSyntax;
        var methodName = invocationMemberAccess?.Name.Identifier.ValueText;
        if (invocation is null || string.IsNullOrWhiteSpace(methodName))
        {
            return null;
        }

        if (methodName is "Find" or "FindAsync" or "First" or "FirstOrDefault" or "FirstAsync" or "FirstOrDefaultAsync"
            or "Single" or "SingleOrDefault" or "SingleAsync" or "SingleOrDefaultAsync" or "ToList" or "ToListAsync"
            or "Where" or "Any" or "AnyAsync" or "Count" or "CountAsync")
        {
            return "QUERIES";
        }

        if (methodName is "Add" or "AddAsync" or "AddRange" or "AddRangeAsync" or "Update" or "UpdateRange"
            or "Remove" or "RemoveRange" or "Attach")
        {
            return "WRITES";
        }

        return null;
    }

    private static bool IsRepositoryType(INamedTypeSymbol? type)
    {
        if (type is null)
        {
            return false;
        }

        return type.Name.EndsWith("Repository", StringComparison.Ordinal)
            || type.AllInterfaces.Any(repositoryInterface => repositoryInterface.Name.EndsWith("Repository", StringComparison.Ordinal));
    }

    private static Dictionary<string, TypeDeclarationSyntax> CollectDeclaredTypes(IEnumerable<CSharpDocument> documents)
    {
        var types = new Dictionary<string, TypeDeclarationSyntax>(StringComparer.Ordinal);
        foreach (var type in documents.SelectMany(document => document.Root.DescendantNodes().OfType<TypeDeclarationSyntax>()))
        {
            types[type.Identifier.ValueText] = type;
            types[GetFullyQualifiedName(type)] = type;
        }

        return types;
    }

    private static Dictionary<string, DbSetProperty> CollectDbSetProperties(
        IEnumerable<CSharpDocument> documents,
        IReadOnlyDictionary<string, TypeDeclarationSyntax> declaredTypes)
    {
        var dbSets = new Dictionary<string, DbSetProperty>(StringComparer.Ordinal);
        foreach (var property in documents.SelectMany(document => document.Root.DescendantNodes().OfType<PropertyDeclarationSyntax>()))
        {
            var entityType = GetDbSetEntityType(property.Type);
            var containingType = property.FirstAncestorOrSelf<BaseTypeDeclarationSyntax>();
            if (entityType is null || containingType is null)
            {
                continue;
            }

            var propertyName = $"{GetFullyQualifiedName(containingType)}.{property.Identifier.ValueText}";
            var entityName = ResolveLikelyTypeName(property, entityType, declaredTypes);
            dbSets[property.Identifier.ValueText] = new DbSetProperty(property.Identifier.ValueText, propertyName, entityName);
        }

        return dbSets;
    }

    private static CSharpCompilation CreateCompilation(IEnumerable<CSharpDocument> documents)
    {
        var references = ((string?)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES"))
            ?.Split(Path.PathSeparator)
            .Where(path => path.EndsWith(".dll", StringComparison.OrdinalIgnoreCase))
            .Select(path => MetadataReference.CreateFromFile(path))
            .Cast<MetadataReference>()
            .ToList() ?? [];

        return CSharpCompilation.Create(
            "KrakenAtlasAnalysis",
            documents.Select(document => document.Tree),
            references,
            new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
    }

    private static IEnumerable<string> DiscoverCSharpFiles(string inputPath)
    {
        if (File.Exists(inputPath) && Path.GetExtension(inputPath).Equals(".cs", StringComparison.OrdinalIgnoreCase))
        {
            yield return inputPath;
            yield break;
        }

        var root = File.Exists(inputPath) ? Path.GetDirectoryName(inputPath)! : inputPath;
        foreach (var file in Directory.EnumerateFiles(root, "*.cs", SearchOption.AllDirectories))
        {
            if (IsIgnoredPath(file))
            {
                continue;
            }

            yield return file;
        }
    }

    private static IEnumerable<string> DiscoverWorkspaceInputs(string inputPath)
    {
        if (File.Exists(inputPath))
        {
            var extension = Path.GetExtension(inputPath);
            if (extension.Equals(".sln", StringComparison.OrdinalIgnoreCase)
                || extension.Equals(".slnx", StringComparison.OrdinalIgnoreCase)
                || extension.Equals(".csproj", StringComparison.OrdinalIgnoreCase))
            {
                yield return Path.GetFullPath(inputPath);
            }
            yield break;
        }

        if (!Directory.Exists(inputPath))
        {
            yield break;
        }

        var solutions = Directory
            .EnumerateFiles(inputPath, "*.*", SearchOption.AllDirectories)
            .Where(file => !IsIgnoredPath(file))
            .Where(file => Path.GetExtension(file) is ".sln" or ".slnx")
            .OrderBy(file => file.Count(character => character is '/' or '\\'))
            .ThenBy(file => file, StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (solutions.Count > 0)
        {
            foreach (var solution in solutions)
            {
                yield return solution;
            }
            yield break;
        }

        foreach (var project in Directory
                     .EnumerateFiles(inputPath, "*.csproj", SearchOption.AllDirectories)
                     .Where(file => !IsIgnoredPath(file))
                     .OrderBy(file => file, StringComparer.OrdinalIgnoreCase))
        {
            yield return project;
        }
    }

    private static bool IsIgnoredPath(string filePath)
    {
        var segments = Path.GetFullPath(filePath).Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return segments.Any(segment => IgnoredDirectories.Contains(segment));
    }

    private static string ResolveWorkspaceRoot(string inputPath)
    {
        if (Directory.Exists(inputPath))
        {
            return inputPath;
        }

        if (File.Exists(inputPath))
        {
            var extension = Path.GetExtension(inputPath);
            if (extension is ".sln" or ".csproj")
            {
                return Path.GetDirectoryName(inputPath)!;
            }

            return Path.GetDirectoryName(inputPath)!;
        }

        return Directory.GetCurrentDirectory();
    }

    private string ToWorkspacePath(string filePath)
    {
        return Path.GetRelativePath(_workspaceRoot, filePath).Replace('\\', '/');
    }

    private static string GetFullyQualifiedName(BaseTypeDeclarationSyntax type)
    {
        var namespaceName = type.FirstAncestorOrSelf<BaseNamespaceDeclarationSyntax>()?.Name.ToString();
        return string.IsNullOrWhiteSpace(namespaceName)
            ? type.Identifier.ValueText
            : $"{namespaceName}.{type.Identifier.ValueText}";
    }

    private static string ResolveLikelyTypeName(
        SyntaxNode context,
        string typeName,
        IReadOnlyDictionary<string, TypeDeclarationSyntax> declaredTypes)
    {
        var cleanTypeName = CleanTypeName(typeName);

        if (declaredTypes.TryGetValue(cleanTypeName, out var declaredType))
        {
            return GetFullyQualifiedName(declaredType);
        }

        if (cleanTypeName.Contains('.', StringComparison.Ordinal))
        {
            return cleanTypeName;
        }

        var namespaceName = context.FirstAncestorOrSelf<BaseNamespaceDeclarationSyntax>()?.Name.ToString();
        return string.IsNullOrWhiteSpace(namespaceName) ? cleanTypeName : $"{namespaceName}.{cleanTypeName}";
    }

    private static string CleanTypeName(string typeName)
    {
        return typeName.Replace("?", "", StringComparison.Ordinal).Trim();
    }

    private static string SymbolId(string fullyQualifiedName)
    {
        return $"symbol:csharp:{CleanTypeName(fullyQualifiedName)}";
    }

    private static string RelationshipId(string type, string from, string to)
    {
        return $"relationship:{type}:csharp:{CleanTypeName(from)}->{CleanTypeName(to)}";
    }

    private static string GetFallbackMethodName(BaseMethodDeclarationSyntax method)
    {
        var containingType = method.FirstAncestorOrSelf<BaseTypeDeclarationSyntax>();
        if (containingType is null)
        {
            return "";
        }

        var name = method switch
        {
            MethodDeclarationSyntax methodDeclaration => methodDeclaration.Identifier.ValueText,
            ConstructorDeclarationSyntax constructorDeclaration => constructorDeclaration.Identifier.ValueText,
            _ => method.Kind().ToString()
        };

        return $"{GetFullyQualifiedName(containingType)}.{name}";
    }

    private static string[] GetModifiers(SyntaxTokenList modifiers)
    {
        return modifiers.Select(modifier => modifier.ValueText).Where(text => !string.IsNullOrWhiteSpace(text)).ToArray();
    }

    private static string[] GetTypePatterns(BaseTypeDeclarationSyntax type)
    {
        var patterns = new List<string>();
        var name = type.Identifier.ValueText;

        if (name.EndsWith("Controller", StringComparison.Ordinal))
        {
            patterns.Add("aspnet-controller");
        }

        if (name.EndsWith("Service", StringComparison.Ordinal))
        {
            patterns.Add(type is InterfaceDeclarationSyntax ? "service-interface" : "service-class");
        }

        if (name.EndsWith("Options", StringComparison.Ordinal))
        {
            patterns.Add("options-class");
        }

        return patterns.ToArray();
    }

    private static bool LooksLikeDependency(string typeName)
    {
        var clean = CleanTypeName(typeName);
        return clean.StartsWith("I", StringComparison.Ordinal)
            || clean.EndsWith("Service", StringComparison.Ordinal)
            || clean.EndsWith("Repository", StringComparison.Ordinal)
            || clean.EndsWith("Options", StringComparison.Ordinal)
            || clean.EndsWith("DbContext", StringComparison.Ordinal);
    }

    private static string GetSymbolDisplayName(ISymbol symbol)
    {
        return symbol.ToDisplayString(SymbolDisplayFormat.CSharpErrorMessageFormat);
    }

    private static bool IsInfrastructureInvocation(InvocationExpressionSyntax invocation)
    {
        if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess)
        {
            return false;
        }

        var methodName = memberAccess.Name.Identifier.ValueText;
        return methodName.StartsWith("Add", StringComparison.Ordinal)
            || methodName.StartsWith("Map", StringComparison.Ordinal)
            || methodName is "Build" or "Run" or "UseRouting" or "UseAuthentication" or "UseAuthorization";
    }

    private static bool ShouldEmitCall(string callerName, string calleeName)
    {
        if (calleeName.StartsWith("System.", StringComparison.Ordinal)
            || calleeName.StartsWith("Microsoft.", StringComparison.Ordinal))
        {
            return false;
        }

        return callerName != calleeName;
    }

    private static bool IsPrimitiveOrFrameworkType(string typeName)
    {
        return typeName is "void" or "bool" or "byte" or "char" or "decimal" or "double" or "float" or "int" or "long" or "object" or "short" or "string"
            || typeName.StartsWith("System.", StringComparison.Ordinal)
            || typeName.StartsWith("Microsoft.", StringComparison.Ordinal);
    }
}

internal sealed record CSharpDocument(
    string FilePath,
    string RelativePath,
    SyntaxTree Tree,
    SyntaxNode Root,
    SemanticModel SemanticModel);

internal sealed record DbSetProperty(string ShortName, string PropertyName, string EntityName);

internal sealed class AnalysisResult
{
    public List<SymbolRecord> Symbols { get; } = [];
    public List<ReferenceRecord> References { get; } = [];
    public List<RelationshipRecord> Relationships { get; } = [];

    public IEnumerable<object> AllRecords()
    {
        foreach (var symbol in Symbols)
        {
            yield return symbol;
        }

        foreach (var reference in References)
        {
            yield return reference;
        }

        foreach (var relationship in Relationships)
        {
            yield return relationship;
        }
    }

    public void Deduplicate()
    {
        DeduplicateById(Symbols);
        DeduplicateById(References);
        DeduplicateById(Relationships);
    }

    private static void DeduplicateById<T>(List<T> records) where T : ICodeMapRecord
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        records.RemoveAll(record => !seen.Add(record.Id));
    }
}

internal interface ICodeMapRecord
{
    string Id { get; }
}

internal sealed record Range(
    [property: JsonPropertyName("startLine")] int StartLine,
    [property: JsonPropertyName("startColumn")] int StartColumn,
    [property: JsonPropertyName("endLine")] int EndLine,
    [property: JsonPropertyName("endColumn")] int EndColumn)
{
    public static Range FromNode(SyntaxTree tree, SyntaxNode node)
    {
        var span = tree.GetLineSpan(node.Span);
        return new Range(
            span.StartLinePosition.Line + 1,
            span.StartLinePosition.Character + 1,
            span.EndLinePosition.Line + 1,
            span.EndLinePosition.Character + 1);
    }
}

internal sealed record SymbolRecord(
    [property: JsonPropertyName("recordType")] string RecordType,
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("fullyQualifiedName")] string FullyQualifiedName,
    [property: JsonPropertyName("kind")] string Kind,
    [property: JsonPropertyName("language")] string Language,
    [property: JsonPropertyName("file")] string File,
    [property: JsonPropertyName("range")] Range Range,
    [property: JsonPropertyName("modifiers")] string[] Modifiers,
    [property: JsonPropertyName("summary")] string? Summary,
    [property: JsonPropertyName("patterns")] string[] Patterns,
    [property: JsonPropertyName("confidence")] double Confidence) : ICodeMapRecord;

internal sealed record ReferenceRecord(
    [property: JsonPropertyName("recordType")] string RecordType,
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("symbolName")] string SymbolName,
    [property: JsonPropertyName("resolvedSymbolId")] string? ResolvedSymbolId,
    [property: JsonPropertyName("file")] string File,
    [property: JsonPropertyName("range")] Range Range,
    [property: JsonPropertyName("context")] string Context,
    [property: JsonPropertyName("snippet")] string? Snippet,
    [property: JsonPropertyName("confidence")] double Confidence) : ICodeMapRecord;

internal sealed record RelationshipRecord(
    [property: JsonPropertyName("recordType")] string RecordType,
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("from")] string From,
    [property: JsonPropertyName("to")] string To,
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("file")] string? File,
    [property: JsonPropertyName("range")] Range? Range,
    [property: JsonPropertyName("evidence")] string? Evidence,
    [property: JsonPropertyName("confidence")] double Confidence) : ICodeMapRecord;

internal static class Jsonl
{
    public static JsonSerializerOptions Options { get; } = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false
    };

    public static async Task WriteAsync<T>(string path, IEnumerable<T> records)
    {
        await using var stream = File.Create(path);
        await using var writer = new StreamWriter(stream);
        foreach (var record in records)
        {
            await writer.WriteLineAsync(JsonSerializer.Serialize(record, Options));
        }
    }
}
