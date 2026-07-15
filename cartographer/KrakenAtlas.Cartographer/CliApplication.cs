using System.Text.Json;
using KrakenAtlas.Protocol;

namespace KrakenAtlas.Cartographer;

internal static class CliApplication
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    public static async Task<int> RunAsync(
        IReadOnlyList<string> arguments,
        TextWriter output,
        TextWriter error,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var options = Parse(arguments);
            var session = new CartographerSession();
            await session.InitializeAsync(
                new InitializeParams("cli", "1.0", options.WorkspaceRoots, options.AtlasPath),
                cancellationToken);

            object? result = options.Command switch
            {
                "build" => await session.BuildAtlasAsync(cancellationToken),
                "summary" => await session.GetAtlasSummaryAsync(cancellationToken),
                "orientation" => await session.GetWorkspaceOrientationAsync(cancellationToken),
                "entity" => await session.GetEntityAsync(
                    new GetEntityParams(options.StableKey, options.Id),
                    cancellationToken),
                "symbols" => await session.SearchSymbolsAsync(
                    new SearchSymbolsParams(options.Query!, options.Limit),
                    cancellationToken),
                "search" => await session.SearchEntitiesAsync(
                    new SearchEntitiesParams(options.Query!, options.Kinds, options.Limit),
                    cancellationToken),
                "usages" => await session.FindUsagesAsync(
                    new FindUsagesParams(options.StableKey, options.Id, options.Kinds, options.Limit),
                    cancellationToken),
                "relations" => await session.GetRelationsAsync(
                    new GetRelationsParams(
                        options.StableKey,
                        options.Id,
                        options.Direction,
                        options.Domains,
                        options.Kinds,
                        options.Limit),
                    cancellationToken),
                "route" => await session.TraceRouteAsync(
                    new TraceRouteParams(
                        options.SourceStableKey,
                        options.SourceId,
                        options.TargetStableKey,
                        options.TargetId,
                        options.ViaStableKeys,
                        options.Domains,
                        options.Kinds,
                        options.MaxDepth,
                        options.MaxVisited),
                    cancellationToken),
                "surface" => await session.GetChangeSurfaceAsync(
                    new GetChangeSurfaceParams(
                        options.StableKey,
                        options.Id,
                        options.Domains,
                        options.Kinds,
                        options.MaxDepth,
                        options.MaxEntities),
                    cancellationToken),
                _ => throw new InvalidOperationException($"Unknown command: {options.Command}")
            };

            await output.WriteLineAsync(JsonSerializer.Serialize(result, JsonOptions));
            return result is null ? 2 : 0;
        }
        catch (Exception exception)
        {
            await error.WriteLineAsync(exception.Message);
            await error.WriteLineAsync(Usage);
            return 1;
        }
    }

    private static CliOptions Parse(IReadOnlyList<string> arguments)
    {
        if (arguments.Count == 0 || arguments[0] is not (
            "build" or "summary" or "orientation" or "entity" or "symbols" or "search"
            or "usages" or "relations" or "route" or "surface"))
        {
            throw new ArgumentException(
                "A build, summary, orientation, entity, symbols, search, usages, relations, route, or surface command is required.");
        }

        var roots = new List<string>();
        string? atlasPath = null;
        string? stableKey = null;
        long? id = null;
        string? query = null;
        int? limit = null;
        var kinds = new List<string>();
        var domains = new List<string>();
        string? direction = null;
        string? sourceStableKey = null;
        long? sourceId = null;
        string? targetStableKey = null;
        long? targetId = null;
        var viaStableKeys = new List<string>();
        int? maxDepth = null;
        int? maxVisited = null;
        int? maxEntities = null;
        for (var index = 1; index < arguments.Count; index++)
        {
            var option = arguments[index];
            if (index + 1 >= arguments.Count)
            {
                throw new ArgumentException($"Missing value for {option}.");
            }
            var value = arguments[++index];
            switch (option)
            {
                case "--workspace":
                    roots.Add(value);
                    break;
                case "--atlas":
                    atlasPath = value;
                    break;
                case "--stable-key":
                    stableKey = value;
                    break;
                case "--id" when long.TryParse(value, out var parsedId):
                    id = parsedId;
                    break;
                case "--query":
                    query = value;
                    break;
                case "--limit" when int.TryParse(value, out var parsedLimit):
                    limit = parsedLimit;
                    break;
                case "--kind":
                    kinds.Add(value);
                    break;
                case "--domain":
                    domains.Add(value);
                    break;
                case "--direction":
                    direction = value;
                    break;
                case "--source-key":
                    sourceStableKey = value;
                    break;
                case "--source-id" when long.TryParse(value, out var parsedSourceId):
                    sourceId = parsedSourceId;
                    break;
                case "--target-key":
                    targetStableKey = value;
                    break;
                case "--target-id" when long.TryParse(value, out var parsedTargetId):
                    targetId = parsedTargetId;
                    break;
                case "--via-key":
                    viaStableKeys.Add(value);
                    break;
                case "--max-depth" when int.TryParse(value, out var parsedMaxDepth):
                    maxDepth = parsedMaxDepth;
                    break;
                case "--max-visited" when int.TryParse(value, out var parsedMaxVisited):
                    maxVisited = parsedMaxVisited;
                    break;
                case "--max-entities" when int.TryParse(value, out var parsedMaxEntities):
                    maxEntities = parsedMaxEntities;
                    break;
                default:
                    throw new ArgumentException($"Unknown option or invalid value: {option} {value}");
            }
        }

        if (string.IsNullOrWhiteSpace(atlasPath))
        {
            throw new ArgumentException("--atlas is required.");
        }
        if (roots.Count == 0)
        {
            throw new ArgumentException("At least one --workspace is required.");
        }
        if (arguments[0] == "entity" && string.IsNullOrWhiteSpace(stableKey) && id is null)
        {
            throw new ArgumentException("entity requires --stable-key or --id.");
        }

        if (arguments[0] is "symbols" or "search" && string.IsNullOrWhiteSpace(query))
        {
            throw new ArgumentException($"{arguments[0]} requires --query.");
        }

        if (arguments[0] == "usages" && string.IsNullOrWhiteSpace(stableKey) && id is null)
        {
            throw new ArgumentException("usages requires --stable-key or --id.");
        }

        if (arguments[0] == "relations" && string.IsNullOrWhiteSpace(stableKey) && id is null)
        {
            throw new ArgumentException("relations requires --stable-key or --id.");
        }
        if (arguments[0] == "surface" && string.IsNullOrWhiteSpace(stableKey) && id is null)
        {
            throw new ArgumentException("surface requires --stable-key or --id.");
        }
        if (arguments[0] == "route"
            && (string.IsNullOrWhiteSpace(sourceStableKey) && sourceId is null
                || string.IsNullOrWhiteSpace(targetStableKey) && targetId is null))
        {
            throw new ArgumentException(
                "route requires --source-key or --source-id and --target-key or --target-id.");
        }

        return new CliOptions(
            arguments[0], roots, Path.GetFullPath(atlasPath), stableKey, id, query, limit,
            kinds, domains, direction, sourceStableKey, sourceId, targetStableKey, targetId,
            viaStableKeys, maxDepth, maxVisited, maxEntities);
    }

    private const string Usage =
        "Usage: KrakenAtlas.Cartographer <build|summary|orientation|entity|symbols|search|usages|relations|route|surface> "
        + "--workspace <path> [--workspace <path>] --atlas <path> "
        + "[--stable-key <key> | --id <number>] [--query <text>] "
        + "[--direction <incoming|outgoing|both>] [--domain <domain>] [--kind <relation-kind>] "
        + "[--source-key <key> | --source-id <number>] [--target-key <key> | --target-id <number>] "
        + "[--via-key <stable-key>] "
        + "[--max-depth <number>] [--max-visited <10-20000>] [--max-entities <10-1000>] [--limit <number>]";

    private sealed record CliOptions(
        string Command,
        IReadOnlyList<string> WorkspaceRoots,
        string AtlasPath,
        string? StableKey,
        long? Id,
        string? Query,
        int? Limit,
        IReadOnlyList<string> Kinds,
        IReadOnlyList<string> Domains,
        string? Direction,
        string? SourceStableKey,
        long? SourceId,
        string? TargetStableKey,
        long? TargetId,
        IReadOnlyList<string> ViaStableKeys,
        int? MaxDepth,
        int? MaxVisited,
        int? MaxEntities);
}
