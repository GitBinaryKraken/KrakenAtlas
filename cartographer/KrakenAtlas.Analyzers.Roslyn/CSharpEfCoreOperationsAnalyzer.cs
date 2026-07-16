using KrakenAtlas.Core;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Operations;

namespace KrakenAtlas.Analyzers.Roslyn;

internal static partial class CSharpFrameworkAnalyzer
{
    private static void CollectEfDataOperation(
        string workspaceKey,
        DiscoveredProject project,
        DiscoveredFile sourceFile,
        SemanticModel semanticModel,
        InvocationExpressionSyntax invocationSyntax,
        IInvocationOperation invocation,
        IReadOnlyDictionary<string, EfEntityMapping> mappings,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyDictionary<string, string> projectKeysByAssembly,
        Action<DiscoveredCodeRelation> addRelation,
        CancellationToken cancellationToken)
    {
        var effect = ClassifyEfDataOperation(invocation);
        if (effect is null
            || FindEfOperationMapping(
                workspaceKey,
                project.StableKey,
                invocation,
                mappings,
                symbols,
                projectKeysByAssembly) is not { TableKey: not null } mapping)
        {
            return;
        }

        var sourceKey = CSharpDeclarationAnalyzer.ResolveSourceKey(
            workspaceKey,
            project.StableKey,
            semanticModel.GetEnclosingSymbol(invocationSyntax.SpanStart, cancellationToken),
            symbols);
        var evidence = CreateLocation(sourceFile, invocationSyntax);
        var operationKey = CreateSyntheticKey(
            "database_operation",
            $"{workspaceKey}|{sourceKey}|ef_core|{effect}|{mapping.QualifiedTableName}|"
                + $"{sourceFile.RelativePath}|{invocationSyntax.SpanStart}");
        symbols[operationKey] = new DiscoveredCodeSymbol(
            operationKey,
            project.StableKey,
            "database_operation",
            effect,
            $"EF Core {effect} {mapping.QualifiedTableName}",
            $"{effect} EF Core | {invocation.TargetMethod.Name}",
            "not_applicable",
            sourceKey,
            [evidence],
            "csharp");
        addRelation(new DiscoveredCodeRelation(
            sourceKey, operationKey, "executes_ef", "static", evidence, "database", "ef_core"));
        addRelation(new DiscoveredCodeRelation(
            operationKey, mapping.TableKey!, effect, null, evidence, "database", "ef_core"));
        addRelation(new DiscoveredCodeRelation(
            operationKey,
            mapping.EntityKey,
            effect == "reads" ? "materializes" : "persists",
            null,
            evidence,
            "database",
            "ef_core"));
    }

    private static void CollectEfMigrationOperation(
        string workspaceKey,
        DiscoveredProject project,
        DiscoveredFile sourceFile,
        SemanticModel semanticModel,
        InvocationExpressionSyntax invocationSyntax,
        IInvocationOperation invocation,
        IReadOnlyDictionary<string, EfMigrationFact> migrations,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        Action<DiscoveredCodeRelation> addRelation,
        CancellationToken cancellationToken)
    {
        var original = invocation.TargetMethod.ReducedFrom ?? invocation.TargetMethod;
        if (!original.ContainingNamespace.ToDisplayString().StartsWith(
                "Microsoft.EntityFrameworkCore.Migrations", StringComparison.Ordinal))
        {
            return;
        }
        var enclosingType = semanticModel.GetEnclosingSymbol(
            invocationSyntax.SpanStart, cancellationToken)?.ContainingType;
        var migration = enclosingType is null
            ? null
            : migrations.Values.FirstOrDefault(candidate =>
                SymbolEqualityComparer.Default.Equals(candidate.MigrationType, enclosingType));
        if (migration is null)
        {
            return;
        }

        var evidence = CreateLocation(sourceFile, invocationSyntax);
        if (original.Name == "Sql")
        {
            CollectEfMigrationSql(
                workspaceKey, project, invocation, migration, evidence, symbols, addRelation);
            return;
        }

        var relationKind = original.Name switch
        {
            "CreateTable" => "creates",
            "DropTable" => "drops",
            "RenameTable" => "renames",
            "AddColumn" => "adds_column",
            "AlterColumn" => "alters_column",
            "DropColumn" => "drops_column",
            "CreateIndex" => "creates_index",
            "DropIndex" => "drops_index",
            "AddForeignKey" => "adds_foreign_key",
            "DropForeignKey" => "drops_foreign_key",
            _ => null
        };
        if (relationKind is null)
        {
            return;
        }

        var tableName = GetConstantStringArgument(invocation, "table")
            ?? GetConstantStringArgument(invocation, "name");
        if (string.IsNullOrWhiteSpace(tableName))
        {
            return;
        }
        var schema = GetConstantStringArgument(invocation, "schema");
        var qualifiedTableName = string.IsNullOrWhiteSpace(schema) ? tableName : $"{schema}.{tableName}";
        var tableKey = GetOrCreateRelationalTable(
            workspaceKey,
            project.StableKey,
            qualifiedTableName,
            evidence,
            "EF Core migration table",
            symbols);
        var operationKey = CreateMigrationOperation(
            workspaceKey,
            project.StableKey,
            original.Name,
            qualifiedTableName,
            migration,
            evidence,
            symbols);
        addRelation(new DiscoveredCodeRelation(
            migration.EntityKey,
            operationKey,
            "contains_operation",
            "source_order",
            evidence,
            "database",
            "ef_migration"));
        addRelation(new DiscoveredCodeRelation(
            operationKey, tableKey, relationKind, null, evidence, "database", "ef_migration"));
        addRelation(new DiscoveredCodeRelation(
            migration.EntityKey, tableKey, "migrates", null, evidence, "database", relationKind));

        if (original.Name is "AddColumn" or "AlterColumn" or "DropColumn"
            && GetConstantStringArgument(invocation, "name") is { } columnName)
        {
            var columnKey = CreateRelationalColumnKey(workspaceKey, qualifiedTableName, columnName);
            if (!symbols.ContainsKey(columnKey))
            {
                symbols[columnKey] = new DiscoveredCodeSymbol(
                    columnKey,
                    project.StableKey,
                    "database_column",
                    columnName,
                    $"{qualifiedTableName}.{columnName}",
                    $"EF Core migration column | {original.Name}",
                    "not_applicable",
                    tableKey,
                    [evidence],
                    "sql");
            }
            addRelation(new DiscoveredCodeRelation(
                operationKey, columnKey, relationKind, null, evidence, "database", "ef_migration"));
            addRelation(new DiscoveredCodeRelation(
                tableKey, columnKey, "has_column", null, evidence, "database", "migration"));
        }
    }

    private static void CollectEfMigrationSql(
        string workspaceKey,
        DiscoveredProject project,
        IInvocationOperation invocation,
        EfMigrationFact migration,
        DiscoveredCodeLocation evidence,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        Action<DiscoveredCodeRelation> addRelation)
    {
        var sql = GetConstantStringArgument(invocation, "sql");
        if (string.IsNullOrWhiteSpace(sql))
        {
            return;
        }
        var operationKey = CreateSyntheticKey(
            "migration_operation",
            $"{workspaceKey}|{migration.EntityKey}|Sql|{Hash(sql)}|{evidence.SourceRelativePath}|"
                + $"{evidence.StartLine}|{evidence.StartColumn}");
        symbols[operationKey] = new DiscoveredCodeSymbol(
            operationKey,
            project.StableKey,
            "migration_operation",
            "Sql",
            $"{migration.MigrationType.ToDisplayString()}.Sql",
            "EF Core migration SQL",
            "not_applicable",
            migration.EntityKey,
            [evidence],
            "sql");
        addRelation(new DiscoveredCodeRelation(
            migration.EntityKey,
            operationKey,
            "contains_operation",
            "source_order",
            evidence,
            "database",
            "ef_migration"));
        foreach (var databaseObject in ExtractDatabaseObjects(sql))
        {
            var tableKey = GetOrCreateRelationalTable(
                workspaceKey,
                project.StableKey,
                databaseObject,
                evidence,
                "EF Core migration SQL table",
                symbols);
            addRelation(new DiscoveredCodeRelation(
                operationKey,
                tableKey,
                ClassifySql(sql),
                null,
                evidence,
                "database",
                "migration_sql"));
            addRelation(new DiscoveredCodeRelation(
                migration.EntityKey, tableKey, "migrates", null, evidence, "database", "migration_sql"));
        }
    }

    private static string? ClassifyEfDataOperation(IInvocationOperation invocation)
    {
        var original = invocation.TargetMethod.ReducedFrom ?? invocation.TargetMethod;
        var sourceType = invocation.Instance?.Type ?? invocation.Arguments.FirstOrDefault()?.Value.Type;
        var namespaceName = original.ContainingNamespace.ToDisplayString();
        if (!namespaceName.StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal)
            && !(namespaceName == "System.Linq" && IsQueryableType(sourceType)))
        {
            return null;
        }
        return original.Name switch
        {
            "Find" or "FindAsync" or "First" or "FirstAsync" or "FirstOrDefault"
                or "FirstOrDefaultAsync" or "Single" or "SingleAsync" or "SingleOrDefault"
                or "SingleOrDefaultAsync" or "Any" or "AnyAsync" or "Count" or "CountAsync"
                or "LongCount" or "LongCountAsync" or "ToList" or "ToListAsync" or "ToArray"
                or "ToArrayAsync" => "reads",
            "Add" or "AddAsync" or "AddRange" or "AddRangeAsync" => "inserts",
            "Update" or "UpdateRange" or "ExecuteUpdate" or "ExecuteUpdateAsync" => "writes",
            "Remove" or "RemoveRange" or "ExecuteDelete" or "ExecuteDeleteAsync" => "deletes",
            _ => null
        };
    }

    private static EfEntityMapping? FindEfOperationMapping(
        string workspaceKey,
        string projectKey,
        IInvocationOperation invocation,
        IReadOnlyDictionary<string, EfEntityMapping> mappings,
        IReadOnlyDictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyDictionary<string, string> projectKeysByAssembly)
    {
        var types = new List<ITypeSymbol?>
        {
            invocation.Instance?.Type,
            invocation.TargetMethod.ReturnType
        };
        types.AddRange(invocation.TargetMethod.TypeArguments);
        types.AddRange(invocation.Arguments.Select(argument => argument.Value.Type));
        foreach (var type in types.SelectMany(EnumerateTypeCandidates))
        {
            var entityKey = CSharpDeclarationAnalyzer.ResolveKnownKey(
                workspaceKey, projectKey, type, symbols, projectKeysByAssembly);
            if (entityKey is not null && mappings.TryGetValue(entityKey, out var mapping))
            {
                return mapping;
            }
        }
        return null;
    }

    private static IEnumerable<INamedTypeSymbol> EnumerateTypeCandidates(ITypeSymbol? type)
    {
        if (type is IArrayTypeSymbol array)
        {
            foreach (var candidate in EnumerateTypeCandidates(array.ElementType))
            {
                yield return candidate;
            }
            yield break;
        }
        if (type is not INamedTypeSymbol named)
        {
            yield break;
        }
        yield return named;
        foreach (var argument in named.TypeArguments)
        {
            foreach (var candidate in EnumerateTypeCandidates(argument))
            {
                yield return candidate;
            }
        }
    }

    private static bool IsQueryableType(ITypeSymbol? type) => type is INamedTypeSymbol named
        && (named.OriginalDefinition.ToDisplayString().StartsWith("System.Linq.IQueryable<", StringComparison.Ordinal)
            || named.AllInterfaces.Any(interfaceType =>
                interfaceType.OriginalDefinition.ToDisplayString().StartsWith(
                    "System.Linq.IQueryable<", StringComparison.Ordinal)));

    private static string CreateMigrationOperation(
        string workspaceKey,
        string projectKey,
        string operationName,
        string qualifiedTableName,
        EfMigrationFact migration,
        DiscoveredCodeLocation evidence,
        Dictionary<string, DiscoveredCodeSymbol> symbols)
    {
        var operationKey = CreateSyntheticKey(
            "migration_operation",
            $"{workspaceKey}|{migration.EntityKey}|{operationName}|{qualifiedTableName}|"
                + $"{evidence.SourceRelativePath}|{evidence.StartLine}|{evidence.StartColumn}");
        symbols[operationKey] = new DiscoveredCodeSymbol(
            operationKey,
            projectKey,
            "migration_operation",
            operationName,
            $"{migration.MigrationType.ToDisplayString()}.{operationName} {qualifiedTableName}",
            $"EF Core migration operation | {operationName}",
            "not_applicable",
            migration.EntityKey,
            [evidence],
            "sql");
        return operationKey;
    }

    private static string GetOrCreateRelationalTable(
        string workspaceKey,
        string projectKey,
        string qualifiedTableName,
        DiscoveredCodeLocation evidence,
        string signature,
        Dictionary<string, DiscoveredCodeSymbol> symbols)
    {
        var matchingTable = symbols.Values.FirstOrDefault(entity =>
            entity.Kind == "database_object"
            && string.Equals(entity.QualifiedName, qualifiedTableName, StringComparison.OrdinalIgnoreCase));
        var tableKey = matchingTable?.StableKey ?? CreateRelationalTableKey(workspaceKey, qualifiedTableName);
        if (!symbols.TryGetValue(tableKey, out var existing))
        {
            symbols[tableKey] = new DiscoveredCodeSymbol(
                tableKey,
                projectKey,
                "database_object",
                qualifiedTableName.Split('.').Last(),
                qualifiedTableName,
                signature,
                "not_applicable",
                null,
                [evidence],
                "sql");
        }
        else if (!existing.Locations.Contains(evidence))
        {
            symbols[tableKey] = existing with
            {
                Locations = existing.Locations.Append(evidence).ToArray()
            };
        }
        return tableKey;
    }
}
