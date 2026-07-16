using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using KrakenAtlas.Workspace;

namespace KrakenAtlas.Cartographer;

internal sealed class AgentConnectionReceiptStore
{
    public const string DirectoryName = "agent-connections";
    public const string PendingSetupFileName = "agent-setup.pending.json";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true
    };

    private readonly string atlasPath;
    private readonly string receiptDirectory;
    private readonly IReadOnlyList<string> workspaceRoots;
    private readonly string workspaceKey;
    private AgentConnectionReceipt? current;

    public AgentConnectionReceiptStore(string atlasPath, IReadOnlyList<string> workspaceRoots)
    {
        this.atlasPath = Path.GetFullPath(atlasPath);
        this.workspaceRoots = WorkspaceIdentity.NormalizeRoots(workspaceRoots);
        workspaceKey = WorkspaceIdentity.CreateStableKey(this.workspaceRoots);
        receiptDirectory = Path.Combine(
            Path.GetDirectoryName(this.atlasPath)
                ?? throw new InvalidOperationException("Atlas path must have a parent directory."),
            DirectoryName);
    }

    public void Begin(string clientName, string? clientVersion, string serverVersion, string protocolVersion)
    {
        clientName = NormalizeClientValue(clientName, "unknown-mcp-client");
        clientVersion = string.IsNullOrWhiteSpace(clientVersion)
            ? null
            : NormalizeClientValue(clientVersion, null);
        current = new AgentConnectionReceipt(
            "1.0",
            clientName,
            clientVersion,
            serverVersion,
            protocolVersion,
            workspaceKey,
            workspaceRoots,
            atlasPath,
            null,
            null,
            null,
            DateTimeOffset.UtcNow);
    }

    public Task RecordInitializedAsync(CancellationToken cancellationToken) =>
        UpdateAsync(receipt => receipt with
        {
            InitializedUtc = receipt.InitializedUtc ?? DateTimeOffset.UtcNow,
            LastSeenUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

    public Task RecordToolsListedAsync(CancellationToken cancellationToken) =>
        UpdateAsync(receipt => receipt with
        {
            ToolsListedUtc = receipt.ToolsListedUtc ?? DateTimeOffset.UtcNow,
            LastSeenUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

    public async Task RecordHealthCalledAsync(CancellationToken cancellationToken)
    {
        await UpdateAsync(receipt => receipt with
        {
            HealthCalledUtc = DateTimeOffset.UtcNow,
            LastSeenUtc = DateTimeOffset.UtcNow
        }, cancellationToken);
        var pendingSetup = Path.Combine(
            Path.GetDirectoryName(atlasPath)
                ?? throw new InvalidOperationException("Atlas path must have a parent directory."),
            PendingSetupFileName);
        if (File.Exists(pendingSetup) && PendingSetupMatchesCurrentServer(pendingSetup))
        {
            File.Delete(pendingSetup);
        }
    }

    private bool PendingSetupMatchesCurrentServer(string pendingSetup)
    {
        if (current is null)
        {
            return false;
        }
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(pendingSetup));
            var root = document.RootElement;
            return root.ValueKind == JsonValueKind.Object
                && root.TryGetProperty("schemaVersion", out var schemaVersion)
                && schemaVersion.GetString() == "1.0"
                && root.TryGetProperty("extensionVersion", out var extensionVersion)
                && extensionVersion.GetString() == current.ServerVersion;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private async Task UpdateAsync(
        Func<AgentConnectionReceipt, AgentConnectionReceipt> update,
        CancellationToken cancellationToken)
    {
        if (current is null)
        {
            return;
        }

        current = update(current);
        Directory.CreateDirectory(receiptDirectory);
        var target = Path.Combine(receiptDirectory, $"{CreateClientKey(current.ClientName)}.json");
        var temporary = $"{target}.{Environment.ProcessId}.{Guid.NewGuid():N}.tmp";
        try
        {
            await File.WriteAllTextAsync(
                temporary,
                JsonSerializer.Serialize(current, JsonOptions) + Environment.NewLine,
                new UTF8Encoding(false),
                cancellationToken);
            File.Move(temporary, target, true);
        }
        finally
        {
            if (File.Exists(temporary))
            {
                File.Delete(temporary);
            }
        }
    }

    private static string CreateClientKey(string clientName)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(clientName.ToLowerInvariant()));
        return Convert.ToHexString(hash)[..16].ToLowerInvariant();
    }

    private static string NormalizeClientValue(string value, string? fallback)
    {
        value = value.Trim();
        if (value.Length == 0)
        {
            return fallback ?? string.Empty;
        }
        return value.Length <= 200 ? value : value[..200];
    }
}

internal sealed record AgentConnectionReceipt(
    string SchemaVersion,
    string ClientName,
    string? ClientVersion,
    string ServerVersion,
    string ProtocolVersion,
    string WorkspaceKey,
    IReadOnlyList<string> WorkspaceRoots,
    string AtlasPath,
    DateTimeOffset? InitializedUtc,
    DateTimeOffset? ToolsListedUtc,
    DateTimeOffset? HealthCalledUtc,
    DateTimeOffset LastSeenUtc);
