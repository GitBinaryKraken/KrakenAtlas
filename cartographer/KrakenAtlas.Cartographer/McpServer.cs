using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using KrakenAtlas.Core;
using KrakenAtlas.Protocol;

namespace KrakenAtlas.Cartographer;

internal sealed class McpServer(
    CartographerSession session,
    Stream input,
    Stream output,
    TextWriter error)
{
    private const int MaximumMessageCharacters = 2_097_152;
    private const string LatestProtocolVersion = "2025-11-25";

    private static readonly HashSet<string> SupportedProtocolVersions =
    [
        LatestProtocolVersion,
        "2025-06-18",
        "2025-03-26",
        "2024-11-05"
    ];

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private bool initializeResponded;
    private bool initialized;

    public static async Task<int> RunAsync(
        IReadOnlyList<string> arguments,
        TextWriter error,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var options = ParseOptions(arguments);
            var session = new CartographerSession();
            await session.InitializeAsync(
                new InitializeParams(
                    "mcp",
                    "1.0",
                    options.WorkspaceRoots,
                    options.AtlasPath),
                cancellationToken);
            return await new McpServer(
                session,
                Console.OpenStandardInput(),
                Console.OpenStandardOutput(),
                error).RunAsync(cancellationToken);
        }
        catch (Exception exception)
        {
            await error.WriteLineAsync($"Kraken Atlas MCP startup failed: {exception.Message}");
            return 1;
        }
    }

    public async Task<int> RunAsync(CancellationToken cancellationToken = default)
    {
        using var reader = new StreamReader(
            input, new UTF8Encoding(false, true), detectEncodingFromByteOrderMarks: true, leaveOpen: true);
        await using var writer = new StreamWriter(
            output, new UTF8Encoding(false), bufferSize: 4096, leaveOpen: true)
        {
            AutoFlush = true
        };

        while (!cancellationToken.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(cancellationToken);
            if (line is null)
            {
                return 0;
            }
            if (line.Length == 0)
            {
                continue;
            }
            if (line.Length > MaximumMessageCharacters)
            {
                await WriteErrorAsync(writer, null, -32600, "MCP message exceeds the 2 MiB limit.");
                continue;
            }

            try
            {
                using var document = JsonDocument.Parse(line);
                await HandleAsync(document.RootElement, writer, cancellationToken);
            }
            catch (JsonException exception)
            {
                await error.WriteLineAsync($"Invalid MCP JSON: {exception.Message}");
                await WriteErrorAsync(writer, null, -32700, "Parse error.");
            }
            catch (Exception exception)
            {
                await error.WriteLineAsync($"MCP request failed: {exception}");
                await WriteErrorAsync(writer, null, -32603, exception.Message);
            }
        }

        return 0;
    }

    private async Task HandleAsync(
        JsonElement message,
        StreamWriter writer,
        CancellationToken cancellationToken)
    {
        if (message.ValueKind != JsonValueKind.Object
            || !message.TryGetProperty("jsonrpc", out var jsonrpc)
            || jsonrpc.GetString() != "2.0"
            || !message.TryGetProperty("method", out var methodElement)
            || string.IsNullOrWhiteSpace(methodElement.GetString()))
        {
            await WriteErrorAsync(writer, ReadId(message), -32600, "Invalid JSON-RPC request.");
            return;
        }

        var method = methodElement.GetString()!;
        var id = ReadId(message);
        var parameters = message.TryGetProperty("params", out var paramsElement)
            ? paramsElement
            : default;
        if (method == "notifications/initialized")
        {
            initialized = initializeResponded;
            return;
        }
        if (method.StartsWith("notifications/", StringComparison.Ordinal))
        {
            return;
        }
        if (id is null)
        {
            return;
        }

        if (method == "initialize")
        {
            if (initializeResponded)
            {
                await WriteErrorAsync(writer, id, -32600, "MCP is already initialized.");
                return;
            }
            var requested = parameters.ValueKind == JsonValueKind.Object
                && parameters.TryGetProperty("protocolVersion", out var versionElement)
                ? versionElement.GetString()
                : null;
            var negotiated = requested is not null && SupportedProtocolVersions.Contains(requested)
                ? requested
                : LatestProtocolVersion;
            initializeResponded = true;
            await WriteResultAsync(writer, id, new
            {
                protocolVersion = negotiated,
                capabilities = new { tools = new { listChanged = false } },
                serverInfo = new
                {
                    name = "kraken-atlas",
                    title = "Kraken Atlas Cartographer",
                    version = GetServiceVersion()
                },
                instructions = "Use Kraken Atlas before broad source exploration. Start with get_workspace_orientation. Build the Atlas if it is not_created. Before rebuilding a changed workspace, use project_git_changes to map live edits and assessments at risk. Use prepare_change for task-sized, token-budgeted context. Stable keys are canonical identities. Read durable assessments separately and write only reusable conclusions with decorate_nodes."
            });
            return;
        }

        if (method == "ping")
        {
            await WriteResultAsync(writer, id, new { });
            return;
        }
        if (!initialized)
        {
            await WriteErrorAsync(writer, id, -32002, "Complete MCP initialization before calling tools.");
            return;
        }

        switch (method)
        {
            case "tools/list":
                await WriteResultAsync(writer, id, new { tools = CreateToolDefinitions() });
                return;
            case "tools/call":
                await CallToolAsync(writer, id, parameters, cancellationToken);
                return;
            default:
                await WriteErrorAsync(writer, id, -32601, $"Method not found: {method}");
                return;
        }
    }

    private async Task CallToolAsync(
        StreamWriter writer,
        object id,
        JsonElement parameters,
        CancellationToken cancellationToken)
    {
        try
        {
            var call = parameters.Deserialize<McpToolCall>(JsonOptions)
                ?? throw new InvalidDataException("tools/call parameters are required.");
            var arguments = call.Arguments.ValueKind == JsonValueKind.Undefined
                ? EmptyObject()
                : call.Arguments;
            object? value = call.Name switch
            {
                "build_atlas" => await session.BuildAtlasAsync(cancellationToken),
                "get_atlas_summary" => await session.GetAtlasSummaryAsync(cancellationToken),
                "get_workspace_orientation" => await session.GetWorkspaceOrientationAsync(cancellationToken),
                "search_code" => await session.SearchEntitiesAsync(
                    DeserializeArguments<SearchEntitiesParams>(arguments), cancellationToken),
                "get_relations" => await session.GetRelationsAsync(
                    DeserializeArguments<GetRelationsParams>(arguments), cancellationToken),
                "trace_route" => await session.TraceRouteAsync(
                    DeserializeArguments<TraceRouteParams>(arguments), cancellationToken),
                "project_git_changes" => await session.GetGitChangesAsync(
                    DeserializeArguments<GetGitChangesParams>(arguments), cancellationToken),
                "prepare_change" => await session.PrepareTaskAsync(
                    DeserializeArguments<PrepareTaskParams>(arguments), cancellationToken),
                "get_assessments" => await session.GetAssessmentsAsync(
                    DeserializeArguments<GetAssessmentsParams>(arguments), cancellationToken),
                "decorate_nodes" => await DecorateNodesAsync(arguments, cancellationToken),
                _ => throw new InvalidOperationException($"Unknown Kraken Atlas tool: {call.Name}")
            };
            await WriteToolResultAsync(writer, id, value, false);
        }
        catch (Exception exception)
        {
            await error.WriteLineAsync($"MCP tool call failed: {exception}");
            await WriteToolResultAsync(writer, id, new { error = exception.Message }, true);
        }
    }

    private async Task<DecorateNodesResult> DecorateNodesAsync(
        JsonElement arguments,
        CancellationToken cancellationToken)
    {
        var parameters = DeserializeArguments<DecorateNodesToolParams>(arguments);
        return await session.DecorateNodesAsync(
            parameters.Batch,
            parameters.DryRun ?? false,
            cancellationToken);
    }

    private static object[] CreateToolDefinitions() =>
    [
        Tool(
            "build_atlas",
            "Build Atlas",
            "Index the current workspace into the local SQLite Atlas. Call when summary or orientation reports atlasState not_created or after source changes that must be reflected in map queries.",
            """{"type":"object","properties":{},"additionalProperties":false}""",
            readOnly: false),
        Tool(
            "get_atlas_summary",
            "Get Atlas Summary",
            "Return Atlas generation, project inventory, analyzer status, and entity/relation counts. Use for a compact freshness and coverage check.",
            """{"type":"object","properties":{},"additionalProperties":false}"""),
        Tool(
            "get_workspace_orientation",
            "Orient Workspace",
            "Return solutions, project roles, frameworks, build dimensions, repository rules, and verified build/test/run commands. Use before exploring individual symbols.",
            """{"type":"object","properties":{},"additionalProperties":false}"""),
        Tool(
            "search_code",
            "Search Code Map",
            "Search mapped symbols, HTTP endpoints, service registrations, database operations, and database objects. Returns stable keys for exact follow-up queries.",
            """{"type":"object","properties":{"query":{"type":"string"},"kinds":{"type":"array","items":{"type":"string"}},"limit":{"type":"integer","minimum":1,"maximum":100}},"required":["query"],"additionalProperties":false}"""),
        Tool(
            "get_relations",
            "Get Code Relations",
            "Query incoming, outgoing, or bidirectional relations for one exact stable key or entity ID. Filter by relation domains or kinds to inspect a specific map dimension.",
            """{"type":"object","properties":{"stableKey":{"type":"string"},"id":{"type":"integer"},"direction":{"type":"string","enum":["incoming","outgoing","both"]},"domains":{"type":"array","items":{"type":"string"}},"kinds":{"type":"array","items":{"type":"string"}},"limit":{"type":"integer","minimum":1,"maximum":100}},"additionalProperties":false}"""),
        Tool(
            "trace_route",
            "Trace Code Route",
            "Trace a bounded execution or dependency path between exact source and target entities, optionally through ordered stable-key waypoints and relation filters.",
            """{"type":"object","properties":{"sourceStableKey":{"type":"string"},"sourceId":{"type":"integer"},"targetStableKey":{"type":"string"},"targetId":{"type":"integer"},"viaStableKeys":{"type":"array","items":{"type":"string"}},"domains":{"type":"array","items":{"type":"string"}},"kinds":{"type":"array","items":{"type":"string"}},"maxDepth":{"type":"integer","minimum":1,"maximum":32},"maxVisited":{"type":"integer","minimum":10,"maximum":20000}},"additionalProperties":false}"""),
        Tool(
            "project_git_changes",
            "Project Git Changes",
            "Project working-tree or commit-range changes onto mapped files, symbols, dependent behavior, tests, projects, verification commands, and durable assessments whose evidence is now at risk.",
            """{"type":"object","properties":{"mode":{"type":"string","enum":["working_tree","range"],"default":"working_tree"},"baseRef":{"type":"string"},"targetRef":{"type":"string","default":"HEAD"},"maxDepth":{"type":"integer","minimum":1,"maximum":8,"default":2},"maxEntities":{"type":"integer","minimum":10,"maximum":1000,"default":100},"maxFiles":{"type":"integer","minimum":1,"maximum":1000,"default":100}},"additionalProperties":false}"""),
        Tool(
            "prepare_change",
            "Prepare Change Context",
            "Resolve a coding task to a likely seed and return a token-budgeted Context Pack with related symbols, tests, projects, assessments, verification commands, and optional bounded source excerpts. If resolution is needs_seed, call again with a candidate stableKey.",
            """{"type":"object","properties":{"task":{"type":"string","minLength":1,"maxLength":2000},"query":{"type":"string"},"stableKey":{"type":"string"},"id":{"type":"integer"},"tokenBudget":{"type":"integer","minimum":800,"maximum":32000,"default":4000},"maxDepth":{"type":"integer","minimum":1,"maximum":8,"default":3},"includeProposed":{"type":"boolean","default":false},"includeSource":{"type":"boolean","default":true},"sourceLineLimit":{"type":"integer","minimum":8,"maximum":120,"default":24},"candidateLimit":{"type":"integer","minimum":1,"maximum":20,"default":8}},"required":["task"],"additionalProperties":false}"""),
        Tool(
            "get_assessments",
            "Get Agent Assessments",
            "Read durable agent-authored knowledge for one exact map node. This is intentionally separate from structural relation queries; stale and historical claims are opt-in.",
            """{"type":"object","properties":{"stableKey":{"type":"string"},"id":{"type":"integer"},"includeProposed":{"type":"boolean","default":false},"includeStale":{"type":"boolean","default":false},"includeHistory":{"type":"boolean","default":false},"limit":{"type":"integer","minimum":1,"maximum":500}},"additionalProperties":false}"""),
        Tool(
            "decorate_nodes",
            "Decorate Atlas Nodes",
            "Validate or persist a schemaVersion 1.0 node-decoration batch containing reusable agent conclusions, evidence, confidence, and freshness dependencies. Prefer dryRun before the first write.",
            """{"type":"object","properties":{"batch":{"type":"object"},"dryRun":{"type":"boolean","default":false}},"required":["batch"],"additionalProperties":false}""",
            readOnly: false)
    ];

    private static object Tool(
        string name,
        string title,
        string description,
        string schema,
        bool readOnly = true) => new
        {
            name,
            title,
            description,
            inputSchema = JsonSerializer.Deserialize<JsonElement>(schema),
            annotations = new
            {
                title,
                readOnlyHint = readOnly,
                destructiveHint = false,
                idempotentHint = readOnly,
                openWorldHint = false
            }
        };

    private static T DeserializeArguments<T>(JsonElement arguments) =>
        arguments.Deserialize<T>(JsonOptions)
        ?? throw new InvalidDataException($"Invalid arguments for {typeof(T).Name}.");

    private static JsonElement EmptyObject() =>
        JsonSerializer.Deserialize<JsonElement>("{}");

    private static object? ReadId(JsonElement message) =>
        message.ValueKind == JsonValueKind.Object && message.TryGetProperty("id", out var id)
            ? id.Clone()
            : null;

    private static Task WriteResultAsync(StreamWriter writer, object? id, object? result) =>
        WriteMessageAsync(writer, new { jsonrpc = "2.0", id, result });

    private static Task WriteErrorAsync(
        StreamWriter writer,
        object? id,
        int code,
        string message) =>
        WriteMessageAsync(writer, new { jsonrpc = "2.0", id, error = new { code, message } });

    private static Task WriteToolResultAsync(
        StreamWriter writer,
        object id,
        object? value,
        bool isError)
    {
        var json = JsonSerializer.Serialize(value, JsonOptions);
        return WriteResultAsync(writer, id, new
        {
            content = new[] { new { type = "text", text = json } },
            structuredContent = value,
            isError
        });
    }

    private static Task WriteMessageAsync(StreamWriter writer, object message) =>
        writer.WriteLineAsync(JsonSerializer.Serialize(message, JsonOptions));

    private static McpOptions ParseOptions(IReadOnlyList<string> arguments)
    {
        var roots = new List<string>();
        string? atlasPath = null;
        for (var index = 0; index < arguments.Count; index++)
        {
            if (index + 1 >= arguments.Count)
            {
                throw new ArgumentException($"Missing value for {arguments[index]}.");
            }
            var option = arguments[index];
            var value = arguments[++index];
            switch (option)
            {
                case "--workspace":
                    roots.Add(value);
                    break;
                case "--atlas":
                    atlasPath = value;
                    break;
                default:
                    throw new ArgumentException($"Unknown MCP option: {option}");
            }
        }
        if (roots.Count == 0)
        {
            throw new ArgumentException("MCP requires at least one --workspace path.");
        }
        if (string.IsNullOrWhiteSpace(atlasPath))
        {
            throw new ArgumentException("MCP requires --atlas <path>.");
        }
        return new McpOptions(roots, Path.GetFullPath(atlasPath));
    }

    private static string GetServiceVersion()
    {
        var version = typeof(McpServer).Assembly.GetName().Version ?? new Version(0, 0, 0);
        return $"{version.Major}.{version.Minor}.{Math.Max(0, version.Build)}";
    }

    private sealed record McpOptions(IReadOnlyList<string> WorkspaceRoots, string AtlasPath);
    private sealed record McpToolCall
    {
        public required string Name { get; init; }

        public JsonElement Arguments { get; init; }

        [JsonPropertyName("_meta")]
        public JsonElement Metadata { get; init; }
    }

    private sealed record DecorateNodesToolParams(NodeDecorationBatch Batch, bool? DryRun);
}
