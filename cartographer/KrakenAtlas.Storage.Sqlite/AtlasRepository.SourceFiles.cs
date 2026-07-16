using KrakenAtlas.Core;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    public async Task<AtlasSourceFile?> GetSourceFileAsync(
        string workspaceKey,
        string fileStableKey,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await AtlasDatabase.OpenAsync(databasePath, cancellationToken);
        var generation = await ReadCurrentGenerationAsync(connection, workspaceKey, cancellationToken);
        if (generation is null)
        {
            return null;
        }

        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT f.stable_key, f.root_path, f.relative_path, f.language, f.content_hash, f.size_bytes
            FROM files f
            JOIN workspaces w ON w.id = f.workspace_id
            WHERE w.stable_key = $workspaceKey
              AND f.stable_key = $fileStableKey
              AND f.generation_id = $generation
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$workspaceKey", workspaceKey);
        command.Parameters.AddWithValue("$fileStableKey", fileStableKey);
        command.Parameters.AddWithValue("$generation", generation.Value);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken)
            ? new AtlasSourceFile(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetInt64(5))
            : null;
    }
}
