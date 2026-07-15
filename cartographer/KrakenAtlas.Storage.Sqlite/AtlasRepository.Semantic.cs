using KrakenAtlas.Core;
using Microsoft.Data.Sqlite;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    private static async Task PersistCSharpSymbolsAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        long generation,
        CSharpSemanticSnapshot semanticSnapshot,
        IReadOnlyDictionary<string, long> projectIds,
        IReadOnlyDictionary<string, long> fileIds,
        IDictionary<string, long> entityIds,
        IReadOnlyDictionary<string, DiscoveredFile> filesByPath,
        CancellationToken cancellationToken)
    {
        foreach (var symbol in semanticSnapshot.Symbols)
        {
            if (!projectIds.ContainsKey(symbol.ProjectKey)
                || !entityIds.TryGetValue(symbol.ProjectKey, out var projectEntityId))
            {
                continue;
            }

            entityIds[symbol.StableKey] = await UpsertEntityAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                symbol.StableKey,
                symbol.Kind,
                symbol.Name,
                symbol.QualifiedName,
                "csharp",
                projectEntityId,
                symbol.Signature,
                cancellationToken,
                symbol.Visibility);
        }

        foreach (var symbol in semanticSnapshot.Symbols)
        {
            if (!entityIds.TryGetValue(symbol.StableKey, out var symbolEntityId)
                || !entityIds.TryGetValue(symbol.ProjectKey, out var projectEntityId))
            {
                continue;
            }

            var containingEntityId = symbol.ContainingSymbolKey is not null
                && entityIds.TryGetValue(symbol.ContainingSymbolKey, out var semanticContainerId)
                    ? semanticContainerId
                    : projectEntityId;
            symbolEntityId = await UpsertEntityAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                symbol.StableKey,
                symbol.Kind,
                symbol.Name,
                symbol.QualifiedName,
                "csharp",
                containingEntityId,
                symbol.Signature,
                cancellationToken,
                symbol.Visibility);
            entityIds[symbol.StableKey] = symbolEntityId;

            foreach (var location in symbol.Locations)
            {
                if (!filesByPath.TryGetValue(FullPath(location.SourceRootPath, location.SourceRelativePath), out var file))
                {
                    continue;
                }

                await UpsertLocationSpanAsync(
                    connection,
                    transaction,
                    generation,
                    symbolEntityId,
                    fileIds[file.StableKey],
                    "definition",
                    location.StartLine,
                    location.StartColumn,
                    location.EndLine,
                    location.EndColumn,
                    cancellationToken);
            }

            var evidence = symbol.Locations.FirstOrDefault();
            if (evidence is null
                || !filesByPath.TryGetValue(FullPath(evidence.SourceRootPath, evidence.SourceRelativePath), out var evidenceFile))
            {
                continue;
            }

            await UpsertRelationWithEvidenceAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                containingEntityId,
                symbolEntityId,
                "contains",
                fileIds[evidenceFile.StableKey],
                evidence.StartLine,
                cancellationToken,
                provenance: "compiler",
                analyzer: semanticSnapshot.AnalyzerRun.Analyzer,
                startColumn: evidence.StartColumn,
                endLine: evidence.EndLine,
                endColumn: evidence.EndColumn);
        }

        foreach (var relation in semanticSnapshot.Relations)
        {
            if (!entityIds.TryGetValue(relation.SourceEntityKey, out var sourceEntityId)
                || !entityIds.TryGetValue(relation.TargetSymbolKey, out var targetEntityId)
                || !filesByPath.TryGetValue(
                    FullPath(relation.Evidence.SourceRootPath, relation.Evidence.SourceRelativePath),
                    out var evidenceFile)
                || !fileIds.TryGetValue(evidenceFile.StableKey, out var evidenceFileId))
            {
                continue;
            }

            await UpsertRelationWithEvidenceAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                sourceEntityId,
                targetEntityId,
                relation.Kind,
                evidenceFileId,
                relation.Evidence.StartLine,
                cancellationToken,
                provenance: "compiler",
                analyzer: semanticSnapshot.AnalyzerRun.Analyzer,
                startColumn: relation.Evidence.StartColumn,
                endLine: relation.Evidence.EndLine,
                endColumn: relation.Evidence.EndColumn,
                dispatchKind: relation.DispatchKind);
        }
    }

    private static async Task InsertSemanticAnalyzerRunAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        long generation,
        AnalyzerExecution analyzerRun,
        CancellationToken cancellationToken)
    {
        await using var command = CreateCommand(connection, transaction,
            """
            INSERT INTO analyzer_runs(
                workspace_id, generation_id, analyzer, analyzer_version,
                capability, status, duration_ms, diagnostic)
            VALUES (
                $workspaceId, $generation, $analyzer, $version,
                $capability, $status, $durationMs, $diagnostic);
            """);
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$analyzer", analyzerRun.Analyzer);
        command.Parameters.AddWithValue("$version", analyzerRun.AnalyzerVersion);
        command.Parameters.AddWithValue("$capability", analyzerRun.Capability);
        command.Parameters.AddWithValue("$status", analyzerRun.Status);
        command.Parameters.AddWithValue("$durationMs", analyzerRun.DurationMs);
        command.Parameters.AddWithValue("$diagnostic", DbValue(analyzerRun.Diagnostic));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
