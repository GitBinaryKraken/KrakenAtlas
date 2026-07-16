using KrakenAtlas.Core;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Operations;

namespace KrakenAtlas.Analyzers.Roslyn;

internal static partial class CSharpFrameworkAnalyzer
{
    private static async Task CollectEfCoreAsync(
        string workspaceKey,
        IReadOnlyList<RoslynProjectAnalysis> projectAnalyses,
        IReadOnlyDictionary<string, DiscoveredFile> filesByPath,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyDictionary<string, ISymbol> symbolHandles,
        IReadOnlyDictionary<string, string> projectKeysByAssembly,
        Action<DiscoveredCodeRelation> addRelation,
        CancellationToken cancellationToken)
    {
        var mappings = DiscoverEfMappings(
            workspaceKey, symbols, symbolHandles, projectKeysByAssembly, addRelation);
        var migrations = DiscoverEfMigrations(
            workspaceKey, symbols, symbolHandles, addRelation);

        foreach (var analysis in projectAnalyses)
        {
            foreach (var syntaxTree in analysis.Compilation.SyntaxTrees)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (!TryGetAnalyzedFile(analysis, syntaxTree, filesByPath, out _))
                {
                    continue;
                }
                var root = await syntaxTree.GetRootAsync(cancellationToken);
                var semanticModel = analysis.Compilation.GetSemanticModel(syntaxTree);
                foreach (var invocationSyntax in root.DescendantNodes().OfType<InvocationExpressionSyntax>())
                {
                    if (semanticModel.GetOperation(invocationSyntax, cancellationToken) is IInvocationOperation invocation)
                    {
                        ApplyEfFluentConfiguration(
                            workspaceKey,
                            analysis.Project.StableKey,
                            semanticModel,
                            invocationSyntax,
                            invocation,
                            mappings,
                            symbols,
                            projectKeysByAssembly,
                            cancellationToken);
                    }
                }
            }
        }

        EmitEfMappings(workspaceKey, mappings.Values, symbols, addRelation);

        foreach (var analysis in projectAnalyses)
        {
            foreach (var syntaxTree in analysis.Compilation.SyntaxTrees)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (!TryGetAnalyzedFile(analysis, syntaxTree, filesByPath, out var sourceFile))
                {
                    continue;
                }
                var root = await syntaxTree.GetRootAsync(cancellationToken);
                var semanticModel = analysis.Compilation.GetSemanticModel(syntaxTree);
                foreach (var invocationSyntax in root.DescendantNodes().OfType<InvocationExpressionSyntax>())
                {
                    if (semanticModel.GetOperation(invocationSyntax, cancellationToken) is not IInvocationOperation invocation)
                    {
                        continue;
                    }
                    CollectEfDataOperation(
                        workspaceKey,
                        analysis.Project,
                        sourceFile,
                        semanticModel,
                        invocationSyntax,
                        invocation,
                        mappings,
                        symbols,
                        projectKeysByAssembly,
                        addRelation,
                        cancellationToken);
                    CollectEfMigrationOperation(
                        workspaceKey,
                        analysis.Project,
                        sourceFile,
                        semanticModel,
                        invocationSyntax,
                        invocation,
                        migrations,
                        symbols,
                        addRelation,
                        cancellationToken);
                }
            }
        }
    }

    private static Dictionary<string, EfEntityMapping> DiscoverEfMappings(
        string workspaceKey,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyDictionary<string, ISymbol> symbolHandles,
        IReadOnlyDictionary<string, string> projectKeysByAssembly,
        Action<DiscoveredCodeRelation> addRelation)
    {
        var mappings = new Dictionary<string, EfEntityMapping>(StringComparer.Ordinal);
        foreach (var entry in symbolHandles)
        {
            if (entry.Value is not INamedTypeSymbol contextType
                || !DerivesFrom(contextType, "Microsoft.EntityFrameworkCore.DbContext")
                || !symbols.TryGetValue(entry.Key, out var contextSymbol))
            {
                continue;
            }
            var contextEntityKey = CreateSyntheticKey("ef_db_context", $"{workspaceKey}|{entry.Key}");
            var contextEvidence = contextSymbol.Locations[0];
            var declaredSetCount = contextType.GetMembers().OfType<IPropertySymbol>().Count(property =>
                TryGetConstructedTypeArgument(
                    property.Type, "Microsoft.EntityFrameworkCore.DbSet", out _));
            symbols[contextEntityKey] = new DiscoveredCodeSymbol(
                contextEntityKey,
                contextSymbol.ProjectKey,
                "ef_db_context",
                contextType.Name,
                contextType.ToDisplayString(),
                $"EF Core DbContext | sets {declaredSetCount}",
                "not_applicable",
                entry.Key,
                [contextEvidence],
                "csharp");
            addRelation(new DiscoveredCodeRelation(
                contextEntityKey,
                entry.Key,
                "implemented_by",
                "direct",
                contextEvidence,
                "database",
                "ef_core"));
            foreach (var setProperty in contextType.GetMembers().OfType<IPropertySymbol>())
            {
                if (!TryGetConstructedTypeArgument(
                    setProperty.Type, "Microsoft.EntityFrameworkCore.DbSet", out var entityType))
                {
                    continue;
                }
                var entityKey = CSharpDeclarationAnalyzer.ResolveKnownKey(
                    workspaceKey,
                    contextSymbol.ProjectKey,
                    entityType,
                    symbols,
                    projectKeysByAssembly);
                if (entityKey is null
                    || !symbols.TryGetValue(entityKey, out var entitySymbol)
                    || mappings.ContainsKey(entityKey))
                {
                    continue;
                }
                var setPropertyKey = CSharpDeclarationAnalyzer.ResolveKnownKey(
                    workspaceKey,
                    contextSymbol.ProjectKey,
                    setProperty,
                    symbols,
                    projectKeysByAssembly);
                var (tableName, schema) = GetTableMapping(entityType, setProperty.Name);
                var mapping = new EfEntityMapping(
                    contextSymbol.ProjectKey,
                    entry.Key,
                    contextEntityKey,
                    contextType,
                    entityKey,
                    entityType,
                    setPropertyKey,
                    tableName,
                    schema,
                    entitySymbol.Locations[0]);
                DiscoverEfProperties(
                    workspaceKey, mapping, symbols, projectKeysByAssembly);
                DiscoverEfIndexes(mapping);
                mappings.Add(entityKey, mapping);
            }
        }
        return mappings;
    }

    private static Dictionary<string, EfMigrationFact> DiscoverEfMigrations(
        string workspaceKey,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyDictionary<string, ISymbol> symbolHandles,
        Action<DiscoveredCodeRelation> addRelation)
    {
        var migrations = new Dictionary<string, EfMigrationFact>(StringComparer.Ordinal);
        foreach (var entry in symbolHandles)
        {
            if (entry.Value is not INamedTypeSymbol migrationType
                || !DerivesFrom(migrationType, "Microsoft.EntityFrameworkCore.Migrations.Migration")
                || !symbols.TryGetValue(entry.Key, out var migrationClass))
            {
                continue;
            }
            var evidence = migrationClass.Locations[0];
            var migrationKey = CreateSyntheticKey("migration", $"{workspaceKey}|{entry.Key}");
            symbols[migrationKey] = new DiscoveredCodeSymbol(
                migrationKey,
                migrationClass.ProjectKey,
                "migration",
                migrationType.Name,
                migrationType.ToDisplayString(),
                "EF Core migration | static source model",
                "not_applicable",
                entry.Key,
                [evidence],
                "csharp");
            addRelation(new DiscoveredCodeRelation(
                migrationKey, entry.Key, "implemented_by", "direct", evidence, "database", "ef_core"));
            migrations.Add(entry.Key, new EfMigrationFact(migrationKey, migrationClass.ProjectKey, migrationType));
        }
        return migrations;
    }

    private static void DiscoverEfProperties(
        string workspaceKey,
        EfEntityMapping mapping,
        IReadOnlyDictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyDictionary<string, string> projectKeysByAssembly)
    {
        foreach (var property in mapping.EntityType.GetMembers().OfType<IPropertySymbol>())
        {
            if (property.IsStatic || !IsEfScalarType(property.Type))
            {
                continue;
            }
            var propertyKey = CSharpDeclarationAnalyzer.ResolveKnownKey(
                workspaceKey,
                mapping.ProjectKey,
                property,
                symbols,
                projectKeysByAssembly);
            if (propertyKey is null || !symbols.TryGetValue(propertyKey, out var propertySymbol))
            {
                continue;
            }
            var columnName = GetColumnName(property) ?? property.Name;
            var nullable = property.NullableAnnotation == NullableAnnotation.Annotated
                || IsNullableValueType(property.Type);
            var isKey = HasAttribute(property.GetAttributes(), "KeyAttribute")
                || string.Equals(property.Name, "Id", StringComparison.OrdinalIgnoreCase)
                || string.Equals(property.Name, $"{mapping.EntityType.Name}Id", StringComparison.OrdinalIgnoreCase);
            mapping.Properties[property.Name] = new EfPropertyMapping(
                propertyKey,
                property,
                columnName,
                nullable,
                isKey,
                propertySymbol.Locations[0]);
        }
    }

    private static void DiscoverEfIndexes(EfEntityMapping mapping)
    {
        foreach (var attribute in mapping.EntityType.GetAttributes().Where(attribute =>
            attribute.AttributeClass?.ToDisplayString() == "Microsoft.EntityFrameworkCore.IndexAttribute"))
        {
            var properties = attribute.ConstructorArguments
                .SelectMany(argument => argument.Kind == TypedConstantKind.Array ? argument.Values : [argument])
                .Where(argument => argument.Value is string)
                .Select(argument => (string)argument.Value!)
                .ToArray();
            if (properties.Length == 0)
            {
                continue;
            }
            var name = GetNamedAttributeString(attribute, "Name")
                ?? $"IX_{mapping.TableName}_{string.Join('_', properties)}";
            var unique = attribute.NamedArguments.FirstOrDefault(argument => argument.Key == "IsUnique")
                .Value.Value as bool? ?? false;
            mapping.AddOrUpdateIndex(name, properties, unique, mapping.Evidence);
        }
    }

    private static void ApplyEfFluentConfiguration(
        string workspaceKey,
        string projectKey,
        SemanticModel semanticModel,
        InvocationExpressionSyntax invocationSyntax,
        IInvocationOperation invocation,
        Dictionary<string, EfEntityMapping> mappings,
        IReadOnlyDictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyDictionary<string, string> projectKeysByAssembly,
        CancellationToken cancellationToken)
    {
        var original = invocation.TargetMethod.ReducedFrom ?? invocation.TargetMethod;
        if (!original.ContainingNamespace.ToDisplayString().StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal))
        {
            return;
        }
        if (original.Name == "HasDefaultSchema"
            && GetConstantStringArgument(invocation, "schema") is { } defaultSchema)
        {
            var context = semanticModel.GetEnclosingSymbol(invocationSyntax.SpanStart, cancellationToken)?.ContainingType;
            var contextKey = context is null
                ? null
                : CSharpDeclarationAnalyzer.ResolveKnownKey(
                    workspaceKey, projectKey, context, symbols, projectKeysByAssembly);
            foreach (var mapping in mappings.Values.Where(mapping => mapping.ContextTypeKey == contextKey))
            {
                mapping.Schema ??= defaultSchema;
            }
            return;
        }

        var entityType = FindEfEntityType(invocationSyntax, semanticModel, cancellationToken);
        var entityKey = entityType is null
            ? null
            : CSharpDeclarationAnalyzer.ResolveKnownKey(
                workspaceKey, projectKey, entityType, symbols, projectKeysByAssembly);
        if (entityKey is null || !mappings.TryGetValue(entityKey, out var entityMapping))
        {
            return;
        }

        switch (original.Name)
        {
            case "ToTable":
                entityMapping.TableName = GetConstantStringArgument(invocation, "name")
                    ?? GetConstantStringArgument(invocation, "table")
                    ?? entityMapping.TableName;
                entityMapping.Schema = GetConstantStringArgument(invocation, "schema")
                    ?? entityMapping.Schema;
                break;
            case "HasColumnName":
                if (FindNestedInvocation(invocationSyntax, semanticModel, "Property", cancellationToken) is { } propertyCall
                    && ExtractLambdaMemberNames(propertyCall).FirstOrDefault() is { } propertyName
                    && entityMapping.Properties.TryGetValue(propertyName, out var propertyMapping)
                    && GetConstantStringArgument(invocation, "name") is { } columnName)
                {
                    propertyMapping.ColumnName = columnName;
                }
                break;
            case "HasKey":
                foreach (var keyPropertyName in ExtractLambdaMemberNames(invocationSyntax))
                {
                    if (entityMapping.Properties.TryGetValue(keyPropertyName, out var keyPropertyMapping))
                    {
                        keyPropertyMapping.IsKey = true;
                    }
                }
                break;
            case "HasIndex":
                var indexProperties = ExtractLambdaMemberNames(invocationSyntax).ToArray();
                if (indexProperties.Length > 0)
                {
                    var indexName = $"IX_{entityMapping.TableName}_{string.Join('_', indexProperties)}";
                    entityMapping.AddOrUpdateIndex(
                        indexName, indexProperties, false, entityMapping.Evidence);
                }
                break;
            case "IsUnique":
                if (FindNestedInvocation(invocationSyntax, semanticModel, "HasIndex", cancellationToken) is { } indexCall)
                {
                    var uniqueProperties = ExtractLambdaMemberNames(indexCall).ToArray();
                    var indexName = $"IX_{entityMapping.TableName}_{string.Join('_', uniqueProperties)}";
                    entityMapping.AddOrUpdateIndex(
                        indexName, uniqueProperties, true, entityMapping.Evidence);
                }
                break;
        }
    }

    private static void EmitEfMappings(
        string workspaceKey,
        IEnumerable<EfEntityMapping> mappings,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        Action<DiscoveredCodeRelation> addRelation)
    {
        foreach (var mapping in mappings)
        {
            var tableQualifiedName = mapping.QualifiedTableName;
            var existingTable = symbols.Values.FirstOrDefault(entity =>
                entity.Kind == "database_object"
                && string.Equals(entity.QualifiedName, tableQualifiedName, StringComparison.OrdinalIgnoreCase));
            var tableKey = existingTable?.StableKey
                ?? CreateRelationalTableKey(workspaceKey, tableQualifiedName);
            mapping.TableKey = tableKey;
            var efSignature = $"EF Core table {tableQualifiedName} | entity {mapping.EntityType.ToDisplayString()}";
            symbols[tableKey] = existingTable is null
                ? new DiscoveredCodeSymbol(
                    tableKey,
                    mapping.ProjectKey,
                    "database_object",
                    mapping.TableName,
                    tableQualifiedName,
                    efSignature,
                    "not_applicable",
                    null,
                    [mapping.Evidence],
                    "sql")
                : existingTable with
                {
                    Signature = existingTable.Signature?.Contains("EF Core", StringComparison.Ordinal) == true
                        ? existingTable.Signature
                        : $"{existingTable.Signature} | {efSignature}",
                    Locations = existingTable.Locations.Contains(mapping.Evidence)
                        ? existingTable.Locations
                        : existingTable.Locations.Append(mapping.Evidence).ToArray()
                };
            addRelation(new DiscoveredCodeRelation(
                mapping.EntityKey, tableKey, "maps_to", null, mapping.Evidence, "database", "ef_core"));
            addRelation(new DiscoveredCodeRelation(
                mapping.ContextEntityKey, tableKey, "maps_set", null, mapping.Evidence, "database", "ef_core"));
            if (mapping.SetPropertyKey is not null)
            {
                addRelation(new DiscoveredCodeRelation(
                    mapping.SetPropertyKey,
                    mapping.EntityKey,
                    "exposes_entity",
                    null,
                    mapping.Evidence,
                    "database",
                    "DbSet"));
                addRelation(new DiscoveredCodeRelation(
                    mapping.SetPropertyKey, tableKey, "maps_to", null, mapping.Evidence, "database", "DbSet"));
            }

            foreach (var property in mapping.Properties.Values)
            {
                var columnKey = CreateRelationalColumnKey(workspaceKey, tableQualifiedName, property.ColumnName);
                property.ColumnKey = columnKey;
                symbols[columnKey] = new DiscoveredCodeSymbol(
                    columnKey,
                    mapping.ProjectKey,
                    "database_column",
                    property.ColumnName,
                    $"{tableQualifiedName}.{property.ColumnName}",
                    $"EF Core column | {property.Property.Type.ToDisplayString()} | "
                        + (property.Nullable ? "nullable" : "required"),
                    "not_applicable",
                    tableKey,
                    [property.Evidence],
                    "sql");
                addRelation(new DiscoveredCodeRelation(
                    tableKey, columnKey, "has_column", null, property.Evidence, "database", "ef_core"));
                addRelation(new DiscoveredCodeRelation(
                    property.PropertyKey, columnKey, "maps_to", null, property.Evidence, "database", "ef_core"));
            }

            EmitEfPrimaryKey(workspaceKey, mapping, symbols, addRelation);
            EmitEfIndexes(workspaceKey, mapping, symbols, addRelation);
        }
    }

    private static void EmitEfPrimaryKey(
        string workspaceKey,
        EfEntityMapping mapping,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        Action<DiscoveredCodeRelation> addRelation)
    {
        var keyProperties = mapping.Properties.Values.Where(property => property.IsKey).ToArray();
        if (keyProperties.Length == 0 || mapping.TableKey is null)
        {
            return;
        }
        var keyName = $"PK_{mapping.TableName}";
        var keyEntity = CreateSyntheticKey("primary_key", $"{workspaceKey}|{mapping.QualifiedTableName}|{keyName}");
        symbols[keyEntity] = new DiscoveredCodeSymbol(
            keyEntity,
            mapping.ProjectKey,
            "primary_key",
            keyName,
            $"{mapping.QualifiedTableName}.{keyName}",
            $"EF Core primary key | {string.Join(", ", keyProperties.Select(property => property.ColumnName))}",
            "not_applicable",
            mapping.TableKey,
            [keyProperties[0].Evidence],
            "sql");
        addRelation(new DiscoveredCodeRelation(
            mapping.TableKey, keyEntity, "has_primary_key", null, keyProperties[0].Evidence, "database", "ef_core"));
        foreach (var property in keyProperties.Where(property => property.ColumnKey is not null))
        {
            addRelation(new DiscoveredCodeRelation(
                keyEntity, property.ColumnKey!, "includes_column", null, property.Evidence, "database", "ef_core"));
            addRelation(new DiscoveredCodeRelation(
                property.PropertyKey, mapping.TableKey, "primary_key_of", null, property.Evidence, "database", "ef_core"));
        }
    }

    private static void EmitEfIndexes(
        string workspaceKey,
        EfEntityMapping mapping,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        Action<DiscoveredCodeRelation> addRelation)
    {
        if (mapping.TableKey is null)
        {
            return;
        }
        foreach (var index in mapping.Indexes.Values)
        {
            var mappedProperties = index.PropertyNames
                .Select(name => mapping.Properties.GetValueOrDefault(name))
                .Where(property => property?.ColumnKey is not null)
                .Cast<EfPropertyMapping>()
                .ToArray();
            if (mappedProperties.Length == 0)
            {
                continue;
            }
            var indexKey = CreateSyntheticKey(
                "database_index", $"{workspaceKey}|{mapping.QualifiedTableName}|{index.Name}");
            symbols[indexKey] = new DiscoveredCodeSymbol(
                indexKey,
                mapping.ProjectKey,
                "database_index",
                index.Name,
                $"{mapping.QualifiedTableName}.{index.Name}",
                $"EF Core {(index.Unique ? "unique " : string.Empty)}index | "
                    + string.Join(", ", mappedProperties.Select(property => property.ColumnName)),
                "not_applicable",
                mapping.TableKey,
                [index.Evidence],
                "sql");
            addRelation(new DiscoveredCodeRelation(
                mapping.TableKey, indexKey, "has_index", null, index.Evidence, "database", "ef_core"));
            foreach (var property in mappedProperties)
            {
                addRelation(new DiscoveredCodeRelation(
                    indexKey, property.ColumnKey!, "indexes", null, property.Evidence, "database",
                    index.Unique ? "unique" : "non_unique"));
            }
        }
    }

    private static bool TryGetAnalyzedFile(
        RoslynProjectAnalysis analysis,
        SyntaxTree syntaxTree,
        IReadOnlyDictionary<string, DiscoveredFile> filesByPath,
        out DiscoveredFile sourceFile)
    {
        if (!string.IsNullOrWhiteSpace(syntaxTree.FilePath)
            && filesByPath.TryGetValue(NormalizePath(syntaxTree.FilePath), out var file)
            && file.ProjectKey == analysis.Project.StableKey)
        {
            sourceFile = file;
            return true;
        }
        sourceFile = null!;
        return false;
    }

    private static INamedTypeSymbol? FindEfEntityType(
        InvocationExpressionSyntax invocationSyntax,
        SemanticModel semanticModel,
        CancellationToken cancellationToken)
    {
        foreach (var candidate in invocationSyntax.DescendantNodesAndSelf().OfType<InvocationExpressionSyntax>())
        {
            if (semanticModel.GetOperation(candidate, cancellationToken) is not IInvocationOperation operation)
            {
                continue;
            }
            if (operation.TargetMethod.Name == "Entity"
                && operation.TargetMethod.TypeArguments.FirstOrDefault() is INamedTypeSymbol entityType
                && (operation.TargetMethod.ReducedFrom ?? operation.TargetMethod)
                    .ContainingNamespace.ToDisplayString().StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal))
            {
                return entityType;
            }
            if (operation.Instance?.Type is INamedTypeSymbol builderType
                && builderType.ContainingNamespace.ToDisplayString().StartsWith(
                    "Microsoft.EntityFrameworkCore.Metadata.Builders", StringComparison.Ordinal)
                && builderType.Name.EndsWith("Builder", StringComparison.Ordinal)
                && builderType.TypeArguments.FirstOrDefault() is INamedTypeSymbol configuredType
                && configuredType.SpecialType == SpecialType.None)
            {
                return configuredType;
            }
        }
        return null;
    }

    private static InvocationExpressionSyntax? FindNestedInvocation(
        InvocationExpressionSyntax invocationSyntax,
        SemanticModel semanticModel,
        string methodName,
        CancellationToken cancellationToken) => invocationSyntax.DescendantNodesAndSelf()
            .OfType<InvocationExpressionSyntax>()
            .FirstOrDefault(candidate => semanticModel.GetOperation(candidate, cancellationToken) is IInvocationOperation operation
                && operation.TargetMethod.Name == methodName);

    private static IEnumerable<string> ExtractLambdaMemberNames(InvocationExpressionSyntax invocation)
    {
        foreach (var lambda in invocation.ArgumentList.Arguments
            .SelectMany(argument => argument.Expression.DescendantNodesAndSelf().OfType<LambdaExpressionSyntax>()))
        {
            foreach (var member in lambda.Body.DescendantNodesAndSelf().OfType<MemberAccessExpressionSyntax>())
            {
                yield return member.Name.Identifier.ValueText;
            }
        }
    }

    private static string? GetConstantStringArgument(IInvocationOperation invocation, string parameterName) =>
        invocation.Arguments.FirstOrDefault(argument => argument.Parameter?.Name == parameterName)
            ?.Value.ConstantValue is { HasValue: true, Value: string value } ? value : null;

    private static (string TableName, string? Schema) GetTableMapping(
        INamedTypeSymbol entityType,
        string fallbackTableName)
    {
        var attribute = entityType.GetAttributes().FirstOrDefault(candidate =>
            candidate.AttributeClass?.ToDisplayString() == "System.ComponentModel.DataAnnotations.Schema.TableAttribute");
        return attribute is null
            ? (fallbackTableName, null)
            : (GetConstructorString(attribute) ?? fallbackTableName, GetNamedAttributeString(attribute, "Schema"));
    }

    private static string? GetColumnName(IPropertySymbol property) => property.GetAttributes()
        .FirstOrDefault(attribute =>
            attribute.AttributeClass?.ToDisplayString() == "System.ComponentModel.DataAnnotations.Schema.ColumnAttribute")
        is { } columnAttribute ? GetConstructorString(columnAttribute) : null;

    private static bool DerivesFrom(INamedTypeSymbol type, string baseTypeName)
    {
        for (var current = type; current is not null; current = current.BaseType)
        {
            if (current.OriginalDefinition.ToDisplayString() == baseTypeName)
            {
                return true;
            }
        }
        return false;
    }

    private static bool TryGetConstructedTypeArgument(
        ITypeSymbol type,
        string genericDefinition,
        out INamedTypeSymbol argument)
    {
        if (type is INamedTypeSymbol named
            && $"{named.OriginalDefinition.ContainingNamespace.ToDisplayString()}.{named.OriginalDefinition.Name}"
                == genericDefinition
            && named.TypeArguments.FirstOrDefault() is INamedTypeSymbol typeArgument)
        {
            argument = typeArgument;
            return true;
        }
        argument = null!;
        return false;
    }

    private static bool IsEfScalarType(ITypeSymbol type)
    {
        if (type is IArrayTypeSymbol { ElementType.SpecialType: SpecialType.System_Byte })
        {
            return true;
        }
        if (type is INamedTypeSymbol named
            && named.OriginalDefinition.SpecialType == SpecialType.System_Nullable_T)
        {
            return IsEfScalarType(named.TypeArguments[0]);
        }
        return type.TypeKind == TypeKind.Enum
            || type.SpecialType is not (SpecialType.None or SpecialType.System_Object)
            || type.ToDisplayString() is "System.Guid" or "System.DateTime" or "System.DateTimeOffset"
                or "System.DateOnly" or "System.TimeOnly" or "System.TimeSpan";
    }

    private static bool IsNullableValueType(ITypeSymbol type) => type is INamedTypeSymbol named
        && named.OriginalDefinition.SpecialType == SpecialType.System_Nullable_T;

    private static string CreateRelationalTableKey(string workspaceKey, string qualifiedName) =>
        CreateSyntheticKey("database_object", $"{workspaceKey}|relational|{qualifiedName.ToLowerInvariant()}");

    private static string CreateRelationalColumnKey(
        string workspaceKey,
        string qualifiedTableName,
        string columnName) => CreateSyntheticKey(
            "database_column", $"{workspaceKey}|relational|{qualifiedTableName.ToLowerInvariant()}|{columnName.ToLowerInvariant()}");

    private sealed class EfEntityMapping(
        string projectKey,
        string contextTypeKey,
        string contextEntityKey,
        INamedTypeSymbol contextType,
        string entityKey,
        INamedTypeSymbol entityType,
        string? setPropertyKey,
        string tableName,
        string? schema,
        DiscoveredCodeLocation evidence)
    {
        public string ProjectKey { get; } = projectKey;
        public string ContextTypeKey { get; } = contextTypeKey;
        public string ContextEntityKey { get; } = contextEntityKey;
        public INamedTypeSymbol ContextType { get; } = contextType;
        public string EntityKey { get; } = entityKey;
        public INamedTypeSymbol EntityType { get; } = entityType;
        public string? SetPropertyKey { get; } = setPropertyKey;
        public string TableName { get; set; } = tableName;
        public string? Schema { get; set; } = schema;
        public DiscoveredCodeLocation Evidence { get; } = evidence;
        public Dictionary<string, EfPropertyMapping> Properties { get; } = new(StringComparer.Ordinal);
        public Dictionary<string, EfIndexMapping> Indexes { get; } = new(StringComparer.Ordinal);
        public string? TableKey { get; set; }
        public string QualifiedTableName => string.IsNullOrWhiteSpace(Schema) ? TableName : $"{Schema}.{TableName}";

        public void AddOrUpdateIndex(
            string name,
            IReadOnlyList<string> propertyNames,
            bool unique,
            DiscoveredCodeLocation indexEvidence)
        {
            Indexes[name] = new EfIndexMapping(name, propertyNames, unique, indexEvidence);
        }
    }

    private sealed class EfPropertyMapping(
        string propertyKey,
        IPropertySymbol property,
        string columnName,
        bool nullable,
        bool isKey,
        DiscoveredCodeLocation evidence)
    {
        public string PropertyKey { get; } = propertyKey;
        public IPropertySymbol Property { get; } = property;
        public string ColumnName { get; set; } = columnName;
        public bool Nullable { get; } = nullable;
        public bool IsKey { get; set; } = isKey;
        public DiscoveredCodeLocation Evidence { get; } = evidence;
        public string? ColumnKey { get; set; }
    }

    private sealed record EfIndexMapping(
        string Name,
        IReadOnlyList<string> PropertyNames,
        bool Unique,
        DiscoveredCodeLocation Evidence);

    private sealed record EfMigrationFact(
        string EntityKey,
        string ProjectKey,
        INamedTypeSymbol MigrationType);
}
