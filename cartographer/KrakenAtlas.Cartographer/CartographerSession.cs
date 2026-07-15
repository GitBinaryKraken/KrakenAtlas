using KrakenAtlas.Core;
using KrakenAtlas.Protocol;
using KrakenAtlas.Storage.Sqlite;
using KrakenAtlas.Workspace;

namespace KrakenAtlas.Cartographer;

internal sealed class CartographerSession
{
    private readonly WorkspaceDiscovery discovery = new();
    private AtlasRepository? repository;
    private IReadOnlyList<string> workspaceRoots = [];
    private string? workspaceKey;

    public bool IsInitialized => repository is not null;

    public async Task InitializeAsync(InitializeParams parameters, CancellationToken cancellationToken)
    {
        if (parameters.ProtocolVersion != "1.0")
        {
            throw new InvalidOperationException(
                $"Protocol version {parameters.ProtocolVersion} is not supported. Expected 1.0.");
        }
        if (string.IsNullOrWhiteSpace(parameters.AtlasPath))
        {
            throw new ArgumentException("Initialization requires an Atlas path.", nameof(parameters));
        }

        workspaceRoots = WorkspaceIdentity.NormalizeRoots(parameters.WorkspaceRoots);
        workspaceKey = workspaceRoots.Count == 0 ? null : WorkspaceIdentity.CreateStableKey(workspaceRoots);
        repository = new AtlasRepository(Path.GetFullPath(parameters.AtlasPath));
        await repository.InitializeAsync(cancellationToken);
    }

    public async Task<FoundationStatus> GetFoundationStatusAsync(CancellationToken cancellationToken)
    {
        var summary = await GetAtlasSummaryAsync(cancellationToken);
        return FoundationStatus.Create(summary);
    }

    public async Task<BuildAtlasResult> BuildAtlasAsync(CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        if (workspaceRoots.Count == 0)
        {
            throw new InvalidOperationException("Atlas build requires at least one workspace root.");
        }

        var snapshot = await discovery.DiscoverAsync(workspaceRoots, cancellationToken);
        workspaceKey = snapshot.StableKey;
        return await activeRepository.BuildAsync(snapshot, cancellationToken);
    }

    public Task<AtlasSummary> GetAtlasSummaryAsync(CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        return workspaceKey is null
            ? Task.FromResult(AtlasSummary.NotCreated())
            : activeRepository.GetSummaryAsync(workspaceKey, cancellationToken);
    }

    public Task<EntityDetail?> GetEntityAsync(
        GetEntityParams parameters,
        CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        if (workspaceKey is null)
        {
            return Task.FromResult<EntityDetail?>(null);
        }
        return activeRepository.GetEntityAsync(
            workspaceKey,
            parameters.StableKey,
            parameters.Id,
            cancellationToken);
    }

    private AtlasRepository RequireRepository() => repository
        ?? throw new InvalidOperationException("Cartographer has not been initialized.");
}
