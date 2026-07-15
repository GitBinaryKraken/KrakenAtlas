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
                "entity" => await session.GetEntityAsync(
                    new GetEntityParams(options.StableKey, options.Id),
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
        if (arguments.Count == 0 || arguments[0] is not ("build" or "summary" or "entity"))
        {
            throw new ArgumentException("A build, summary, or entity command is required.");
        }

        var roots = new List<string>();
        string? atlasPath = null;
        string? stableKey = null;
        long? id = null;
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

        return new CliOptions(arguments[0], roots, Path.GetFullPath(atlasPath), stableKey, id);
    }

    private const string Usage =
        "Usage: KrakenAtlas.Cartographer <build|summary|entity> "
        + "--workspace <path> [--workspace <path>] --atlas <path> "
        + "[--stable-key <key> | --id <number>]";

    private sealed record CliOptions(
        string Command,
        IReadOnlyList<string> WorkspaceRoots,
        string AtlasPath,
        string? StableKey,
        long? Id);
}
