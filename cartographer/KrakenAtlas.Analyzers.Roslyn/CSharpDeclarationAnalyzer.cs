using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using KrakenAtlas.Core;
using Microsoft.Build.Locator;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.MSBuild;
using Microsoft.CodeAnalysis.Operations;

namespace KrakenAtlas.Analyzers.Roslyn;

public sealed class CSharpDeclarationAnalyzer
{
    public const string AnalyzerName = AtlasAnalyzerVersions.RoslynName;
    public const string AnalyzerVersion = AtlasAnalyzerVersions.RoslynVersion;
    public const string Capability = "csharp.routes";

    private static readonly object RegistrationLock = new();
    private static readonly StringComparer PathComparer = OperatingSystem.IsWindows()
        ? StringComparer.OrdinalIgnoreCase
        : StringComparer.Ordinal;

    private static readonly SymbolDisplayFormat QualifiedNameFormat = new(
        globalNamespaceStyle: SymbolDisplayGlobalNamespaceStyle.Omitted,
        typeQualificationStyle: SymbolDisplayTypeQualificationStyle.NameAndContainingTypesAndNamespaces,
        genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters,
        memberOptions: SymbolDisplayMemberOptions.IncludeContainingType
            | SymbolDisplayMemberOptions.IncludeParameters
            | SymbolDisplayMemberOptions.IncludeExplicitInterface,
        parameterOptions: SymbolDisplayParameterOptions.IncludeType
            | SymbolDisplayParameterOptions.IncludeParamsRefOut,
        miscellaneousOptions: SymbolDisplayMiscellaneousOptions.UseSpecialTypes
            | SymbolDisplayMiscellaneousOptions.EscapeKeywordIdentifiers
            | SymbolDisplayMiscellaneousOptions.IncludeNullableReferenceTypeModifier);

    private static readonly SymbolDisplayFormat SignatureFormat = new(
        globalNamespaceStyle: SymbolDisplayGlobalNamespaceStyle.Omitted,
        typeQualificationStyle: SymbolDisplayTypeQualificationStyle.NameAndContainingTypesAndNamespaces,
        genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters
            | SymbolDisplayGenericsOptions.IncludeVariance,
        memberOptions: SymbolDisplayMemberOptions.IncludeType
            | SymbolDisplayMemberOptions.IncludeParameters
            | SymbolDisplayMemberOptions.IncludeExplicitInterface,
        parameterOptions: SymbolDisplayParameterOptions.IncludeType
            | SymbolDisplayParameterOptions.IncludeName
            | SymbolDisplayParameterOptions.IncludeDefaultValue
            | SymbolDisplayParameterOptions.IncludeParamsRefOut,
        propertyStyle: SymbolDisplayPropertyStyle.ShowReadWriteDescriptor,
        kindOptions: SymbolDisplayKindOptions.IncludeTypeKeyword,
        miscellaneousOptions: SymbolDisplayMiscellaneousOptions.UseSpecialTypes
            | SymbolDisplayMiscellaneousOptions.EscapeKeywordIdentifiers
            | SymbolDisplayMiscellaneousOptions.IncludeNullableReferenceTypeModifier);

    public async Task<CSharpSemanticSnapshot> AnalyzeAsync(
        WorkspaceSnapshot snapshot,
        CancellationToken cancellationToken = default)
        => await AnalyzeAsync(snapshot, null, [], [], cancellationToken);

    public async Task<CSharpSemanticSnapshot> AnalyzeAsync(
        WorkspaceSnapshot snapshot,
        IReadOnlySet<string>? projectKeys,
        IReadOnlyList<DiscoveredCodeSymbol> knownSymbols,
        IReadOnlyList<AnalyzedProjectAssembly> knownProjectAssemblies,
        CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var diagnostics = new List<string>();
        var symbols = knownSymbols.ToDictionary(symbol => symbol.StableKey, StringComparer.Ordinal);
        var symbolHandles = new Dictionary<string, ISymbol>(StringComparer.Ordinal);
        var projectAnalyses = new List<RoslynProjectAnalysis>();
        var projectKeysByAssembly = knownProjectAssemblies
            .GroupBy(project => project.AssemblyName, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First().ProjectKey, StringComparer.OrdinalIgnoreCase);
        var csharpProjects = snapshot.Projects
            .Where(project => project.Language == "csharp"
                && project.RelativePath.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase)
                && (projectKeys is null || projectKeys.Contains(project.StableKey)))
            .ToArray();

        if (csharpProjects.Length == 0)
        {
            return Complete(symbols, [], diagnostics, 0, 0, stopwatch, projectKeysByAssembly);
        }

        EnsureMSBuildRegistered();
        using var workspace = MSBuildWorkspace.Create();
        workspace.SkipUnrecognizedProjects = true;
        workspace.RegisterWorkspaceFailedHandler(eventArgs =>
            AddDiagnostic(diagnostics, $"workspace {eventArgs.Diagnostic.Kind}: {eventArgs.Diagnostic.Message}"));

        var filesByPath = snapshot.Files
            .Where(file => file.Language == "csharp")
            .GroupBy(file => NormalizePath(Path.Combine(file.RootPath, file.RelativePath)), PathComparer)
            .ToDictionary(group => group.Key, group => group.First(), PathComparer);
        var analyzedProjects = 0;

        foreach (var discoveredProject in csharpProjects)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var projectPath = NormalizePath(Path.Combine(discoveredProject.RootPath, discoveredProject.RelativePath));
            try
            {
                var roslynProject = workspace.CurrentSolution.Projects.FirstOrDefault(project =>
                    project.FilePath is not null && PathComparer.Equals(NormalizePath(project.FilePath), projectPath));
                roslynProject ??= await workspace.OpenProjectAsync(projectPath, cancellationToken: cancellationToken);

                var compilation = await roslynProject.GetCompilationAsync(cancellationToken);
                if (compilation is null)
                {
                    AddDiagnostic(diagnostics, $"{discoveredProject.Name}: compilation was unavailable");
                    continue;
                }

                analyzedProjects++;
                projectAnalyses.Add(new RoslynProjectAnalysis(discoveredProject, compilation));
                if (!string.IsNullOrWhiteSpace(compilation.AssemblyName))
                {
                    projectKeysByAssembly[compilation.AssemblyName] = discoveredProject.StableKey;
                }
                foreach (var diagnostic in compilation.GetDiagnostics(cancellationToken)
                    .Where(diagnostic => diagnostic.Severity == DiagnosticSeverity.Error))
                {
                    AddDiagnostic(diagnostics, $"{discoveredProject.Name}: {FormatDiagnostic(diagnostic, snapshot.Roots)}");
                }

                await CollectProjectSymbolsAsync(
                    snapshot.StableKey,
                    discoveredProject,
                    compilation,
                    filesByPath,
                    symbols,
                    symbolHandles,
                    cancellationToken);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception exception)
            {
                AddDiagnostic(diagnostics, $"{discoveredProject.Name}: {exception.GetType().Name}: {exception.Message}");
            }
        }

        var relations = (await CollectRelationsAsync(
            snapshot.StableKey,
            projectAnalyses,
            filesByPath,
            symbols,
            symbolHandles,
            projectKeysByAssembly,
            cancellationToken)).ToList();
        await CSharpFrameworkAnalyzer.CollectAsync(
            snapshot.StableKey,
            projectAnalyses,
            filesByPath,
            symbols,
            symbolHandles,
            projectKeysByAssembly,
            relations,
            cancellationToken);
        return Complete(
            symbols,
            relations,
            diagnostics,
            analyzedProjects,
            csharpProjects.Length,
            stopwatch,
            projectKeysByAssembly);
    }

    public static IReadOnlyList<DiscoveredCodeRelation> RebuildGlobalRelations(
        IReadOnlyList<DiscoveredCodeSymbol> symbols,
        IEnumerable<DiscoveredCodeRelation> relations)
    {
        var symbolsByKey = symbols.ToDictionary(symbol => symbol.StableKey, StringComparer.Ordinal);
        var merged = relations
            .Where(relation => relation.Kind != "matches_endpoint"
                && (symbolsByKey.ContainsKey(relation.SourceEntityKey)
                    || relation.SourceEntityKey.StartsWith("project:", StringComparison.Ordinal)))
            .Distinct()
            .ToList();
        CSharpFrameworkAnalyzer.ConnectHttpRoutes(symbolsByKey, merged);
        return merged
            .OrderBy(relation => relation.SourceEntityKey, StringComparer.Ordinal)
            .ThenBy(relation => relation.TargetSymbolKey, StringComparer.Ordinal)
            .ThenBy(relation => relation.Domain, StringComparer.Ordinal)
            .ThenBy(relation => relation.Kind, StringComparer.Ordinal)
            .ThenBy(relation => relation.Evidence.SourceRelativePath, StringComparer.Ordinal)
            .ThenBy(relation => relation.Evidence.StartLine)
            .ThenBy(relation => relation.Evidence.StartColumn)
            .ToArray();
    }

    private static async Task CollectProjectSymbolsAsync(
        string workspaceKey,
        DiscoveredProject project,
        Compilation compilation,
        IReadOnlyDictionary<string, DiscoveredFile> filesByPath,
        IDictionary<string, DiscoveredCodeSymbol> symbols,
        IDictionary<string, ISymbol> symbolHandles,
        CancellationToken cancellationToken)
    {
        foreach (var syntaxTree in compilation.SyntaxTrees)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (string.IsNullOrWhiteSpace(syntaxTree.FilePath)
                || !filesByPath.TryGetValue(NormalizePath(syntaxTree.FilePath), out var sourceFile)
                || sourceFile.ProjectKey != project.StableKey)
            {
                continue;
            }

            var root = await syntaxTree.GetRootAsync(cancellationToken);
            var semanticModel = compilation.GetSemanticModel(syntaxTree);
            foreach (var node in root.DescendantNodesAndSelf())
            {
                var declared = GetDeclaredSymbol(semanticModel, node, cancellationToken);
                if (declared is null || declared.IsImplicitlyDeclared)
                {
                    continue;
                }

                var symbol = Canonicalize(declared);
                var stableKey = CreateStableKey(workspaceKey, project.StableKey, symbol);
                if (symbols.ContainsKey(stableKey))
                {
                    continue;
                }

                var locations = GetLocations(symbol, filesByPath);
                if (locations.Count == 0)
                {
                    continue;
                }

                var containingSymbol = symbol.ContainingSymbol;
                var containingKey = containingSymbol is null
                    || containingSymbol is IAssemblySymbol
                    || containingSymbol is IModuleSymbol
                    || containingSymbol is INamespaceSymbol { IsGlobalNamespace: true }
                        ? null
                        : CreateStableKey(workspaceKey, project.StableKey, Canonicalize(containingSymbol));
                symbols[stableKey] = new DiscoveredCodeSymbol(
                    stableKey,
                    project.StableKey,
                    GetEntityKind(symbol),
                    GetName(symbol),
                    symbol.ToDisplayString(QualifiedNameFormat),
                    FormatSignature(symbol),
                    GetVisibility(symbol.DeclaredAccessibility),
                    containingKey,
                    locations);
                symbolHandles[stableKey] = symbol;
            }
        }

        var knownKeys = symbols.Keys.ToHashSet(StringComparer.Ordinal);
        foreach (var entry in symbols.Where(entry => entry.Value.ProjectKey == project.StableKey).ToArray())
        {
            if (entry.Value.ContainingSymbolKey is not null && !knownKeys.Contains(entry.Value.ContainingSymbolKey))
            {
                symbols[entry.Key] = entry.Value with { ContainingSymbolKey = null };
            }
        }
    }

    private static async Task<IReadOnlyList<DiscoveredCodeRelation>> CollectRelationsAsync(
        string workspaceKey,
        IReadOnlyList<RoslynProjectAnalysis> projectAnalyses,
        IReadOnlyDictionary<string, DiscoveredFile> filesByPath,
        IReadOnlyDictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyDictionary<string, ISymbol> symbolHandles,
        IReadOnlyDictionary<string, string> projectKeysByAssembly,
        CancellationToken cancellationToken)
    {
        var relations = new List<DiscoveredCodeRelation>();
        var relationKeys = new HashSet<string>(StringComparer.Ordinal);

        foreach (var entry in symbolHandles)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!symbols.TryGetValue(entry.Key, out var source))
            {
                continue;
            }
            var evidence = source.Locations.First();
            if (entry.Value is INamedTypeSymbol type)
            {
                if (type.BaseType is { SpecialType: not SpecialType.System_Object } baseType)
                {
                    AddRelation(entry.Key, baseType, "inherits", null, evidence);
                }
                foreach (var interfaceType in type.Interfaces)
                {
                    AddRelation(entry.Key, interfaceType, "implements", null, evidence);
                }
                foreach (var interfaceType in type.AllInterfaces)
                {
                    foreach (var interfaceMember in interfaceType.GetMembers())
                    {
                        var implementation = type.FindImplementationForInterfaceMember(interfaceMember);
                        var implementationKey = implementation is null
                            ? null
                            : ResolveKnownKey(workspaceKey, source.ProjectKey, implementation, symbols, projectKeysByAssembly);
                        if (implementationKey is not null
                            && symbols.TryGetValue(implementationKey, out var implementationSymbol))
                        {
                            AddRelation(
                                implementationKey,
                                interfaceMember,
                                "implements_member",
                                null,
                                implementationSymbol.Locations.First());
                        }
                    }
                }
            }

            ISymbol? overridden = entry.Value switch
            {
                IMethodSymbol method => method.OverriddenMethod,
                IPropertySymbol property => property.OverriddenProperty,
                IEventSymbol eventSymbol => eventSymbol.OverriddenEvent,
                _ => null
            };
            if (overridden is not null)
            {
                AddRelation(entry.Key, overridden, "overrides", null, evidence);
            }
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
                foreach (var node in root.DescendantNodesAndSelf())
                {
                    if (node is InvocationExpressionSyntax invocation
                        && semanticModel.GetOperation(invocation, cancellationToken) is IInvocationOperation invocationOperation)
                    {
                        AddSyntaxRelation(
                            semanticModel,
                            analysis.Project,
                            sourceFile,
                            invocationOperation.Syntax,
                            invocationOperation.TargetMethod,
                            "calls",
                            GetDispatchKind(invocationOperation.TargetMethod));
                    }

                    if (node is ObjectCreationExpressionSyntax or ImplicitObjectCreationExpressionSyntax
                        && semanticModel.GetOperation(node, cancellationToken) is IObjectCreationOperation creationOperation
                        && creationOperation.Constructor is not null)
                    {
                        AddSyntaxRelation(
                            semanticModel,
                            analysis.Project,
                            sourceFile,
                            creationOperation.Syntax,
                            creationOperation.Constructor,
                            "constructs",
                            "direct");
                    }

                    if (node is ExpressionSyntax
                        && semanticModel.GetOperation(node, cancellationToken) is { } operation)
                    {
                        switch (operation)
                        {
                            case IFieldReferenceOperation fieldReference:
                                AddSyntaxRelation(
                                    semanticModel,
                                    analysis.Project,
                                    sourceFile,
                                    fieldReference.Syntax,
                                    fieldReference.Field,
                                    GetAccessKind(fieldReference),
                                    null);
                                break;
                            case IPropertyReferenceOperation propertyReference:
                                AddSyntaxRelation(
                                    semanticModel,
                                    analysis.Project,
                                    sourceFile,
                                    propertyReference.Syntax,
                                    propertyReference.Property,
                                    GetAccessKind(propertyReference),
                                    null);
                                break;
                            case IEventReferenceOperation eventReference:
                                AddSyntaxRelation(
                                    semanticModel,
                                    analysis.Project,
                                    sourceFile,
                                    eventReference.Syntax,
                                    eventReference.Event,
                                    GetAccessKind(eventReference),
                                    null);
                                break;
                        }
                    }

                    if (node is TypeSyntax typeSyntax)
                    {
                        var boundSymbol = semanticModel.GetSymbolInfo(typeSyntax, cancellationToken).Symbol;
                        var type = boundSymbol switch
                        {
                            IAliasSymbol alias => alias.Target as ITypeSymbol,
                            ITypeSymbol boundType => boundType,
                            _ => null
                        };
                        if (type is not null)
                        {
                            foreach (var namedType in EnumerateNamedTypes(type))
                            {
                                AddSyntaxRelation(
                                    semanticModel,
                                    analysis.Project,
                                    sourceFile,
                                    typeSyntax,
                                    namedType,
                                    "uses_type",
                                    null);
                            }
                        }
                    }
                }
            }
        }

        return relations
            .OrderBy(relation => relation.SourceEntityKey, StringComparer.Ordinal)
            .ThenBy(relation => relation.TargetSymbolKey, StringComparer.Ordinal)
            .ThenBy(relation => relation.Kind, StringComparer.Ordinal)
            .ThenBy(relation => relation.Evidence.SourceRelativePath, StringComparer.Ordinal)
            .ThenBy(relation => relation.Evidence.StartLine)
            .ThenBy(relation => relation.Evidence.StartColumn)
            .ToArray();

        void AddSyntaxRelation(
            SemanticModel semanticModel,
            DiscoveredProject sourceProject,
            DiscoveredFile sourceFile,
            SyntaxNode evidenceNode,
            ISymbol target,
            string kind,
            string? dispatchKind)
        {
            var sourceKey = ResolveSourceKey(
                workspaceKey,
                sourceProject.StableKey,
                semanticModel.GetEnclosingSymbol(evidenceNode.SpanStart, cancellationToken),
                symbols);
            var evidence = CreateLocation(sourceFile, evidenceNode.GetLocation());
            AddRelation(sourceKey, target, kind, dispatchKind, evidence);
        }

        void AddRelation(
            string sourceKey,
            ISymbol target,
            string kind,
            string? dispatchKind,
            DiscoveredCodeLocation evidence)
        {
            var sourceProjectKey = symbols.TryGetValue(sourceKey, out var sourceSymbol)
                ? sourceSymbol.ProjectKey
                : projectAnalyses.FirstOrDefault(project => project.Project.StableKey == sourceKey)?.Project.StableKey;
            if (sourceProjectKey is null)
            {
                return;
            }
            var targetKey = ResolveKnownKey(
                workspaceKey,
                sourceProjectKey,
                target,
                symbols,
                projectKeysByAssembly);
            if (targetKey is null)
            {
                return;
            }

            var relationKey = string.Join('|',
                sourceKey,
                targetKey,
                kind,
                evidence.SourceRootPath,
                evidence.SourceRelativePath,
                evidence.StartLine,
                evidence.StartColumn);
            if (relationKeys.Add(relationKey))
            {
                relations.Add(new DiscoveredCodeRelation(
                    sourceKey,
                    targetKey,
                    kind,
                    dispatchKind,
                    evidence));
            }
        }
    }

    internal static string ResolveSourceKey(
        string workspaceKey,
        string projectKey,
        ISymbol? symbol,
        IReadOnlyDictionary<string, DiscoveredCodeSymbol> symbols)
    {
        while (symbol is not null)
        {
            if (symbol is IMethodSymbol { AssociatedSymbol: not null } accessor)
            {
                symbol = accessor.AssociatedSymbol;
            }
            var candidate = CreateStableKey(workspaceKey, projectKey, Canonicalize(symbol));
            if (symbols.ContainsKey(candidate))
            {
                return candidate;
            }
            symbol = symbol.ContainingSymbol;
        }
        return projectKey;
    }

    internal static string? ResolveKnownKey(
        string workspaceKey,
        string sourceProjectKey,
        ISymbol symbol,
        IReadOnlyDictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyDictionary<string, string> projectKeysByAssembly)
    {
        symbol = Canonicalize(symbol);
        var assemblyName = symbol.ContainingAssembly?.Name;
        if (assemblyName is not null
            && projectKeysByAssembly.TryGetValue(assemblyName, out var targetProjectKey))
        {
            var targetCandidate = CreateStableKey(workspaceKey, targetProjectKey, symbol);
            if (symbols.ContainsKey(targetCandidate))
            {
                return targetCandidate;
            }
        }

        var localCandidate = CreateStableKey(workspaceKey, sourceProjectKey, symbol);
        if (symbols.ContainsKey(localCandidate))
        {
            return localCandidate;
        }
        return null;
    }

    private static IEnumerable<INamedTypeSymbol> EnumerateNamedTypes(ITypeSymbol type)
    {
        switch (type)
        {
            case IArrayTypeSymbol array:
                foreach (var nested in EnumerateNamedTypes(array.ElementType))
                {
                    yield return nested;
                }
                yield break;
            case IPointerTypeSymbol pointer:
                foreach (var nested in EnumerateNamedTypes(pointer.PointedAtType))
                {
                    yield return nested;
                }
                yield break;
            case INamedTypeSymbol named:
                yield return named.OriginalDefinition;
                foreach (var argument in named.TypeArguments)
                {
                    foreach (var nested in EnumerateNamedTypes(argument))
                    {
                        yield return nested;
                    }
                }
                yield break;
        }
    }

    private static string GetAccessKind(IOperation operation)
    {
        for (var parent = operation.Parent; parent is not null; parent = parent.Parent)
        {
            if (parent is ICompoundAssignmentOperation compound && IsSameOperation(compound.Target, operation)
                || parent is IIncrementOrDecrementOperation increment && IsSameOperation(increment.Target, operation))
            {
                return "reads_writes";
            }
            if (parent is ISimpleAssignmentOperation assignment && IsSameOperation(assignment.Target, operation))
            {
                return "writes";
            }
            if (parent is IArgumentOperation argument && IsSameOperation(argument.Value, operation))
            {
                return argument.Parameter?.RefKind switch
                {
                    RefKind.Out => "writes",
                    RefKind.Ref => "reads_writes",
                    _ => "reads"
                };
            }
            if (parent.Syntax != operation.Syntax && parent.Syntax is StatementSyntax)
            {
                break;
            }
        }
        return "reads";
    }

    private static bool IsSameOperation(IOperation candidate, IOperation operation) =>
        ReferenceEquals(candidate, operation) || candidate.Syntax.Span.Equals(operation.Syntax.Span);

    private static string GetDispatchKind(IMethodSymbol method) => method.ReducedFrom is not null || method.IsExtensionMethod
        ? "extension"
        : method.IsStatic
            ? "static"
            : method.ContainingType.TypeKind == TypeKind.Interface
                ? "interface"
                : method.IsVirtual || method.IsAbstract || method.IsOverride
                    ? "virtual"
                    : "direct";

    private static ISymbol? GetDeclaredSymbol(
        SemanticModel semanticModel,
        SyntaxNode node,
        CancellationToken cancellationToken) => node switch
    {
        BaseNamespaceDeclarationSyntax => semanticModel.GetDeclaredSymbol(node, cancellationToken),
        BaseTypeDeclarationSyntax => semanticModel.GetDeclaredSymbol(node, cancellationToken),
        DelegateDeclarationSyntax => semanticModel.GetDeclaredSymbol(node, cancellationToken),
        BaseMethodDeclarationSyntax => semanticModel.GetDeclaredSymbol(node, cancellationToken),
        PropertyDeclarationSyntax => semanticModel.GetDeclaredSymbol(node, cancellationToken),
        IndexerDeclarationSyntax => semanticModel.GetDeclaredSymbol(node, cancellationToken),
        EventDeclarationSyntax => semanticModel.GetDeclaredSymbol(node, cancellationToken),
        EnumMemberDeclarationSyntax => semanticModel.GetDeclaredSymbol(node, cancellationToken),
        VariableDeclaratorSyntax variable when variable.Parent?.Parent is BaseFieldDeclarationSyntax =>
            semanticModel.GetDeclaredSymbol(node, cancellationToken),
        _ => null
    };

    internal static ISymbol Canonicalize(ISymbol symbol) => symbol switch
    {
        IMethodSymbol method => (method.ReducedFrom ?? method).OriginalDefinition.PartialDefinitionPart
            ?? (method.ReducedFrom ?? method).OriginalDefinition,
        INamedTypeSymbol type => type.OriginalDefinition,
        IPropertySymbol property => property.OriginalDefinition,
        IEventSymbol eventSymbol => eventSymbol.OriginalDefinition,
        IFieldSymbol field => field.OriginalDefinition,
        _ => symbol
    };

    private static IReadOnlyList<DiscoveredCodeLocation> GetLocations(
        ISymbol symbol,
        IReadOnlyDictionary<string, DiscoveredFile> filesByPath) => symbol.Locations
        .Where(location => location.IsInSource && location.SourceTree?.FilePath is not null)
        .Select(location =>
        {
            var fullPath = NormalizePath(location.SourceTree!.FilePath);
            return filesByPath.TryGetValue(fullPath, out var file)
                ? CreateLocation(file, location)
                : null;
        })
        .Where(location => location is not null)
        .Cast<DiscoveredCodeLocation>()
        .Distinct()
        .OrderBy(location => location.SourceRelativePath, StringComparer.Ordinal)
        .ThenBy(location => location.StartLine)
        .ThenBy(location => location.StartColumn)
        .ToArray();

    private static DiscoveredCodeLocation CreateLocation(DiscoveredFile file, Location location)
    {
        var span = location.GetLineSpan();
        return new DiscoveredCodeLocation(
            file.RootPath,
            file.RelativePath,
            span.StartLinePosition.Line + 1,
            span.StartLinePosition.Character + 1,
            span.EndLinePosition.Line + 1,
            span.EndLinePosition.Character + 1,
            file.IsGenerated);
    }

    internal static string CreateStableKey(string workspaceKey, string projectKey, ISymbol symbol)
    {
        var value = $"{workspaceKey}\n{projectKey}\n{GetSymbolIdentity(symbol)}";
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
        return $"csharp_symbol:{hash}";
    }

    private static string GetSymbolIdentity(ISymbol symbol) => symbol.GetDocumentationCommentId()
        ?? $"{symbol.Kind}|{symbol.MetadataName}|{symbol.ToDisplayString(QualifiedNameFormat)}";

    private static string GetEntityKind(ISymbol symbol) => symbol switch
    {
        INamespaceSymbol => "namespace",
        INamedTypeSymbol { IsRecord: true, TypeKind: TypeKind.Struct } => "record_struct",
        INamedTypeSymbol { IsRecord: true } => "record",
        INamedTypeSymbol { TypeKind: TypeKind.Class } => "class",
        INamedTypeSymbol { TypeKind: TypeKind.Struct } => "struct",
        INamedTypeSymbol { TypeKind: TypeKind.Interface } => "interface",
        INamedTypeSymbol { TypeKind: TypeKind.Enum } => "enum",
        INamedTypeSymbol { TypeKind: TypeKind.Delegate } => "delegate",
        IMethodSymbol { MethodKind: MethodKind.Constructor or MethodKind.StaticConstructor } => "constructor",
        IMethodSymbol { MethodKind: MethodKind.Destructor } => "destructor",
        IMethodSymbol { MethodKind: MethodKind.UserDefinedOperator } => "operator",
        IMethodSymbol { MethodKind: MethodKind.Conversion } => "conversion_operator",
        IMethodSymbol => "method",
        IPropertySymbol { IsIndexer: true } => "indexer",
        IPropertySymbol => "property",
        IFieldSymbol { ContainingType.TypeKind: TypeKind.Enum } => "enum_member",
        IFieldSymbol { IsConst: true } => "constant",
        IFieldSymbol => "field",
        IEventSymbol => "event",
        _ => "symbol"
    };

    private static string GetName(ISymbol symbol) => symbol is IMethodSymbol
    {
        MethodKind: MethodKind.Constructor or MethodKind.StaticConstructor
    }
        ? symbol.ContainingType.Name
        : symbol.Name;

    private static string FormatSignature(ISymbol symbol)
    {
        var modifiers = new List<string>();
        var visibility = GetVisibility(symbol.DeclaredAccessibility);
        if (visibility != "not_applicable")
        {
            modifiers.Add(visibility.Replace('_', ' '));
        }
        if (symbol.IsStatic)
        {
            modifiers.Add("static");
        }
        else
        {
            if (symbol.IsAbstract)
            {
                modifiers.Add("abstract");
            }
            if (symbol.IsVirtual)
            {
                modifiers.Add("virtual");
            }
            if (symbol.IsOverride)
            {
                modifiers.Add("override");
            }
            if (symbol.IsSealed)
            {
                modifiers.Add("sealed");
            }
        }
        if (symbol is IMethodSymbol { IsAsync: true })
        {
            modifiers.Add("async");
        }

        modifiers.Add(symbol.ToDisplayString(SignatureFormat));
        return string.Join(' ', modifiers);
    }

    private static string GetVisibility(Accessibility accessibility) => accessibility switch
    {
        Accessibility.Public => "public",
        Accessibility.Private => "private",
        Accessibility.Internal => "internal",
        Accessibility.Protected => "protected",
        Accessibility.ProtectedOrInternal => "protected_internal",
        Accessibility.ProtectedAndInternal => "private_protected",
        _ => "not_applicable"
    };

    private static CSharpSemanticSnapshot Complete(
        IReadOnlyDictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyList<DiscoveredCodeRelation> relations,
        IReadOnlyList<string> diagnostics,
        int analyzedProjects,
        int projectCount,
        Stopwatch stopwatch,
        IReadOnlyDictionary<string, string> projectKeysByAssembly)
    {
        stopwatch.Stop();
        var status = projectCount > 0 && analyzedProjects == 0
            ? "failed"
            : diagnostics.Count > 0
                ? "partial"
                : "succeeded";
        return new CSharpSemanticSnapshot(
            symbols.Values.OrderBy(symbol => symbol.StableKey, StringComparer.Ordinal).ToArray(),
            relations,
            new AnalyzerExecution(
                AnalyzerName,
                AnalyzerVersion,
                Capability,
                status,
                stopwatch.ElapsedMilliseconds,
                diagnostics.Count == 0 ? null : string.Join(" | ", diagnostics)),
            projectKeysByAssembly
                .OrderBy(entry => entry.Key, StringComparer.OrdinalIgnoreCase)
                .Select(entry => new AnalyzedProjectAssembly(entry.Value, entry.Key))
                .ToArray());
    }

    private static void AddDiagnostic(ICollection<string> diagnostics, string diagnostic)
    {
        const int maximumDiagnostics = 20;
        const int maximumLength = 500;
        if (diagnostics.Count >= maximumDiagnostics)
        {
            return;
        }
        diagnostics.Add(diagnostic.Length <= maximumLength ? diagnostic : diagnostic[..maximumLength]);
    }

    private static string FormatDiagnostic(Diagnostic diagnostic, IReadOnlyList<string> roots)
    {
        var location = diagnostic.Location;
        if (!location.IsInSource || string.IsNullOrWhiteSpace(location.SourceTree?.FilePath))
        {
            return $"{diagnostic.Id}: {diagnostic.GetMessage()}";
        }

        var fullPath = NormalizePath(location.SourceTree.FilePath);
        var root = roots.FirstOrDefault(candidate => IsWithin(fullPath, candidate));
        var path = root is null ? Path.GetFileName(fullPath) : Path.GetRelativePath(root, fullPath);
        var line = location.GetLineSpan().StartLinePosition.Line + 1;
        return $"{path}:{line} {diagnostic.Id}: {diagnostic.GetMessage()}";
    }

    private static bool IsWithin(string path, string root)
    {
        var relative = Path.GetRelativePath(root, path);
        return relative != ".."
            && !relative.StartsWith($"..{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
            && !Path.IsPathRooted(relative);
    }

    private static string NormalizePath(string path) => Path.GetFullPath(path)
        .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

    private static void EnsureMSBuildRegistered()
    {
        lock (RegistrationLock)
        {
            if (!MSBuildLocator.IsRegistered)
            {
                MSBuildLocator.RegisterDefaults();
            }
        }
    }

}

internal sealed record RoslynProjectAnalysis(DiscoveredProject Project, Compilation Compilation);
