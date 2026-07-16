using System.IO.Compression;
using System.Text.Json;
using KrakenAtlas.Core;
using Microsoft.Data.Sqlite;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    private static readonly JsonSerializerOptions CacheJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public async Task<AtlasIndexState?> GetIndexStateAsync(
        string workspaceKey,
        string analyzer,
        string analyzerVersion,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await AtlasDatabase.OpenAsync(databasePath, cancellationToken);
        await using var workspaceCommand = connection.CreateCommand();
        workspaceCommand.CommandText =
            """
            SELECT w.id, w.current_generation_id, g.source_fingerprint,
                   COALESCE((
                       SELECT run.status
                       FROM analyzer_runs run
                       WHERE run.workspace_id = w.id
                         AND run.generation_id = w.current_generation_id
                         AND run.analyzer = $analyzer
                       ORDER BY run.id DESC
                       LIMIT 1), 'missing')
            FROM workspaces w
            JOIN atlas_generations g ON g.id = w.current_generation_id
            WHERE w.stable_key = $workspaceKey;
            """;
        workspaceCommand.Parameters.AddWithValue("$workspaceKey", workspaceKey);
        workspaceCommand.Parameters.AddWithValue("$analyzer", analyzer);
        await using var workspaceReader = await workspaceCommand.ExecuteReaderAsync(cancellationToken);
        if (!await workspaceReader.ReadAsync(cancellationToken))
        {
            return null;
        }

        var workspaceId = workspaceReader.GetInt64(0);
        var generation = workspaceReader.GetInt64(1);
        var sourceFingerprint = workspaceReader.GetString(2);
        var semanticStatus = workspaceReader.GetString(3);
        await workspaceReader.CloseAsync();

        var counts = await ReadCountsAsync(connection, workspaceId, generation, cancellationToken);
        var files = await ReadIndexedFilesAsync(connection, workspaceId, generation, cancellationToken);
        var semanticProjects = await ReadSemanticProjectCacheAsync(
            connection,
            workspaceId,
            analyzer,
            analyzerVersion,
            cancellationToken);
        return new AtlasIndexState(
            generation, sourceFingerprint, semanticStatus, counts, files, semanticProjects);
    }

    private static async Task<long?> ReadCurrentGenerationForWriteAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        CancellationToken cancellationToken)
    {
        await using var command = CreateCommand(connection, transaction,
            "SELECT current_generation_id FROM workspaces WHERE id = $workspaceId;");
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        var value = await command.ExecuteScalarAsync(cancellationToken);
        return value is null or DBNull ? null : Convert.ToInt64(value);
    }

    private static async Task PromoteCachedSemanticFactsAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        long previousGeneration,
        long generation,
        IReadOnlyList<string> sourceKeys,
        CancellationToken cancellationToken)
    {
        var keysJson = JsonSerializer.Serialize(sourceKeys);
        await using (var entities = CreateCommand(connection, transaction,
            """
            UPDATE entities
            SET generation_id = $generation
            WHERE workspace_id = $workspaceId
              AND generation_id = $previousGeneration
              AND stable_key IN (SELECT value FROM json_each($keysJson));
            """))
        {
            AddPromotionParameters(entities);
            await entities.ExecuteNonQueryAsync(cancellationToken);
        }
        await using (var locations = CreateCommand(connection, transaction,
            """
            UPDATE entity_locations
            SET generation_id = $generation
            WHERE generation_id = $previousGeneration
              AND entity_id IN (
                  SELECT id FROM entities
                  WHERE workspace_id = $workspaceId
                    AND generation_id = $generation
                    AND stable_key IN (SELECT value FROM json_each($keysJson)));
            """))
        {
            AddPromotionParameters(locations);
            await locations.ExecuteNonQueryAsync(cancellationToken);
        }
        await using (var relations = CreateCommand(connection, transaction,
            """
            UPDATE relations
            SET generation_id = $generation
            WHERE workspace_id = $workspaceId
              AND generation_id = $previousGeneration
              AND relation_kind <> 'matches_endpoint'
              AND source_entity_id IN (
                  SELECT id FROM entities
                  WHERE workspace_id = $workspaceId
                    AND generation_id = $generation
                    AND stable_key IN (SELECT value FROM json_each($keysJson)));
            """))
        {
            AddPromotionParameters(relations);
            await relations.ExecuteNonQueryAsync(cancellationToken);
        }
        await using (var evidence = CreateCommand(connection, transaction,
            """
            UPDATE relation_evidence
            SET generation_id = $generation
            WHERE generation_id = $previousGeneration
              AND relation_id IN (
                  SELECT id FROM relations
                  WHERE workspace_id = $workspaceId AND generation_id = $generation);
            """))
        {
            evidence.Parameters.AddWithValue("$workspaceId", workspaceId);
            evidence.Parameters.AddWithValue("$previousGeneration", previousGeneration);
            evidence.Parameters.AddWithValue("$generation", generation);
            await evidence.ExecuteNonQueryAsync(cancellationToken);
        }

        void AddPromotionParameters(SqliteCommand command)
        {
            command.Parameters.AddWithValue("$workspaceId", workspaceId);
            command.Parameters.AddWithValue("$previousGeneration", previousGeneration);
            command.Parameters.AddWithValue("$generation", generation);
            command.Parameters.AddWithValue("$keysJson", keysJson);
        }
    }

    private static async Task ReadCurrentEntityIdsAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        long generation,
        IDictionary<string, long> entityIds,
        CancellationToken cancellationToken)
    {
        await using var command = CreateCommand(connection, transaction,
            "SELECT stable_key, id FROM entities WHERE workspace_id = $workspaceId AND generation_id = $generation;");
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            entityIds[reader.GetString(0)] = reader.GetInt64(1);
        }
    }

    private static async Task<IReadOnlyList<IndexedFileState>> ReadIndexedFilesAsync(
        SqliteConnection connection,
        long workspaceId,
        long generation,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT f.stable_key, p.stable_key, f.relative_path, f.content_hash
            FROM files f
            LEFT JOIN projects p ON p.id = f.project_id
            WHERE f.workspace_id = $workspaceId AND f.generation_id = $generation
            ORDER BY f.stable_key;
            """;
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        var files = new List<IndexedFileState>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            files.Add(new IndexedFileState(
                reader.GetString(0),
                reader.IsDBNull(1) ? null : reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3)));
        }
        return files;
    }

    private static async Task<IReadOnlyList<SemanticProjectCacheEntry>> ReadSemanticProjectCacheAsync(
        SqliteConnection connection,
        long workspaceId,
        string analyzer,
        string analyzerVersion,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT project_stable_key, input_fingerprint, assembly_name, payload
            FROM semantic_project_cache
            WHERE workspace_id = $workspaceId
              AND analyzer = $analyzer
              AND analyzer_version = $analyzerVersion
            ORDER BY project_stable_key;
            """;
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$analyzer", analyzer);
        command.Parameters.AddWithValue("$analyzerVersion", analyzerVersion);
        var entries = new List<SemanticProjectCacheEntry>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var payload = DeserializeCachePayload((byte[])reader[3]);
            entries.Add(new SemanticProjectCacheEntry(
                reader.GetString(0),
                reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetString(2),
                payload.Symbols,
                payload.Relations));
        }
        return entries;
    }

    private static async Task ReplaceSemanticProjectCacheAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        string analyzer,
        string analyzerVersion,
        IReadOnlyList<SemanticProjectCacheEntry> entries,
        CancellationToken cancellationToken)
    {
        await using (var delete = CreateCommand(connection, transaction,
            "DELETE FROM semantic_project_cache WHERE workspace_id = $workspaceId AND analyzer = $analyzer;"))
        {
            delete.Parameters.AddWithValue("$workspaceId", workspaceId);
            delete.Parameters.AddWithValue("$analyzer", analyzer);
            await delete.ExecuteNonQueryAsync(cancellationToken);
        }

        foreach (var entry in entries)
        {
            await using var insert = CreateCommand(connection, transaction,
                """
                INSERT INTO semantic_project_cache(
                    workspace_id, project_stable_key, analyzer, analyzer_version,
                    input_fingerprint, assembly_name, payload, updated_utc)
                VALUES (
                    $workspaceId, $projectKey, $analyzer, $analyzerVersion,
                    $inputFingerprint, $assemblyName, $payload, $updatedUtc);
                """);
            insert.Parameters.AddWithValue("$workspaceId", workspaceId);
            insert.Parameters.AddWithValue("$projectKey", entry.ProjectKey);
            insert.Parameters.AddWithValue("$analyzer", analyzer);
            insert.Parameters.AddWithValue("$analyzerVersion", analyzerVersion);
            insert.Parameters.AddWithValue("$inputFingerprint", entry.InputFingerprint);
            insert.Parameters.AddWithValue("$assemblyName", DbValue(entry.AssemblyName));
            insert.Parameters.AddWithValue("$payload", SerializeCachePayload(entry));
            insert.Parameters.AddWithValue("$updatedUtc", DateTimeOffset.UtcNow.ToString("O"));
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private static byte[] SerializeCachePayload(SemanticProjectCacheEntry entry)
    {
        var json = JsonSerializer.SerializeToUtf8Bytes(
            new SemanticProjectCachePayload(entry.Symbols, entry.Relations),
            CacheJsonOptions);
        using var output = new MemoryStream();
        using (var compressor = new BrotliStream(output, CompressionLevel.Fastest, leaveOpen: true))
        {
            compressor.Write(json);
        }
        return output.ToArray();
    }

    private static SemanticProjectCachePayload DeserializeCachePayload(byte[] payload)
    {
        using var input = new MemoryStream(payload);
        using var decompressor = new BrotliStream(input, CompressionMode.Decompress);
        return JsonSerializer.Deserialize<SemanticProjectCachePayload>(decompressor, CacheJsonOptions)
            ?? throw new InvalidDataException("Semantic project cache payload was empty.");
    }

    private sealed record SemanticProjectCachePayload(
        IReadOnlyList<DiscoveredCodeSymbol> Symbols,
        IReadOnlyList<DiscoveredCodeRelation> Relations);
}
