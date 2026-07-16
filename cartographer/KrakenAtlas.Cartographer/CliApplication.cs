using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text;
using KrakenAtlas.Core;
using KrakenAtlas.Protocol;

namespace KrakenAtlas.Cartographer;

internal static class CliApplication
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
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
                "assessments" => await session.GetAssessmentsAsync(
                    new GetAssessmentsParams(
                        options.StableKey,
                        options.Id,
                        options.IncludeProposed,
                        options.IncludeStale,
                        options.IncludeHistory,
                        options.Limit),
                    cancellationToken),
                "prepare" => await session.PrepareChangeAsync(
                    new PrepareChangeParams(
                        options.Task!,
                        options.StableKey,
                        options.Id,
                        options.TokenBudget,
                        options.MaxDepth,
                        options.IncludeProposed),
                    cancellationToken),
                "decorate-nodes" => await DecorateNodesAsync(session, options, cancellationToken),
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
            or "usages" or "relations" or "route" or "surface" or "assessments"
            or "prepare" or "decorate-nodes"))
        {
            throw new ArgumentException(
                "A build, summary, orientation, entity, symbols, search, usages, relations, route, surface, assessments, prepare, or decorate-nodes command is required.");
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
        string? task = null;
        int? tokenBudget = null;
        string? inputPath = null;
        var dryRun = false;
        var includeProposed = false;
        var includeStale = false;
        var includeHistory = false;
        for (var index = 1; index < arguments.Count; index++)
        {
            var option = arguments[index];
            switch (option)
            {
                case "--dry-run":
                    dryRun = true;
                    continue;
                case "--include-proposed":
                    includeProposed = true;
                    continue;
                case "--include-stale":
                    includeStale = true;
                    continue;
                case "--include-history":
                    includeHistory = true;
                    continue;
            }
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
                case "--task":
                    task = value;
                    break;
                case "--token-budget" when int.TryParse(value, out var parsedTokenBudget):
                    tokenBudget = parsedTokenBudget;
                    break;
                case "--input":
                    inputPath = value;
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
        if (arguments[0] == "assessments" && string.IsNullOrWhiteSpace(stableKey) && id is null)
        {
            throw new ArgumentException("assessments requires --stable-key or --id.");
        }
        if (arguments[0] == "prepare"
            && (string.IsNullOrWhiteSpace(stableKey) && id is null || string.IsNullOrWhiteSpace(task)))
        {
            throw new ArgumentException("prepare requires --task and --stable-key or --id.");
        }
        if (arguments[0] == "decorate-nodes" && string.IsNullOrWhiteSpace(inputPath))
        {
            throw new ArgumentException("decorate-nodes requires --input <file|->.");
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
            viaStableKeys, maxDepth, maxVisited, maxEntities, task, tokenBudget, inputPath,
            dryRun, includeProposed, includeStale, includeHistory);
    }

    private static async Task<DecorateNodesResult> DecorateNodesAsync(
        CartographerSession session,
        CliOptions options,
        CancellationToken cancellationToken)
    {
        var json = options.InputPath == "-"
            ? await Console.In.ReadToEndAsync(cancellationToken)
            : await File.ReadAllTextAsync(Path.GetFullPath(options.InputPath!), cancellationToken);
        if (Encoding.UTF8.GetByteCount(json) > 1_048_576)
        {
            throw new InvalidDataException("Decoration payload exceeds the 1 MiB limit.");
        }
        var batch = JsonSerializer.Deserialize<NodeDecorationBatch>(json, JsonOptions)
            ?? throw new InvalidDataException("Decoration input is not a valid JSON object.");
        return await session.DecorateNodesAsync(batch, options.DryRun, cancellationToken);
    }

    private const string Usage =
        "Usage: KrakenAtlas.Cartographer <build|summary|orientation|entity|symbols|search|usages|relations|route|surface|assessments|prepare|decorate-nodes> "
        + "--workspace <path> [--workspace <path>] --atlas <path> "
        + "[--stable-key <key> | --id <number>] [--query <text>] "
        + "[--direction <incoming|outgoing|both>] [--domain <domain>] [--kind <relation-kind>] "
        + "[--source-key <key> | --source-id <number>] [--target-key <key> | --target-id <number>] "
        + "[--via-key <stable-key>] "
        + "[--max-depth <number>] [--max-visited <10-20000>] [--max-entities <10-1000>] [--limit <number>] "
        + "[--task <text>] [--token-budget <800-32000>] [--input <file|->] [--dry-run] "
        + "[--include-proposed] [--include-stale] [--include-history]";

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
        int? MaxEntities,
        string? Task,
        int? TokenBudget,
        string? InputPath,
        bool DryRun,
        bool IncludeProposed,
        bool IncludeStale,
        bool IncludeHistory);
}
