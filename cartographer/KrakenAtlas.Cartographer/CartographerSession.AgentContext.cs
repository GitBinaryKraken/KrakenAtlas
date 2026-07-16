using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using KrakenAtlas.Core;
using KrakenAtlas.Protocol;

namespace KrakenAtlas.Cartographer;

internal sealed partial class CartographerSession
{
    private const long MaximumSourceFileBytes = 1_048_576;

    private static readonly JsonSerializerOptions ContextJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private static readonly HashSet<string> TaskStopWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "add", "and", "are", "change", "create", "delete", "feature", "fix", "for", "from",
        "have", "into", "make", "new", "our", "please", "remove", "should", "that", "the",
        "this", "through", "update", "using", "want", "with"
    };

    private static readonly HashSet<string> SourceExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".cs", ".cshtml", ".js", ".jsx", ".razor", ".sql", ".ts", ".tsx"
    };

    public async Task<TaskContextResult> PrepareTaskAsync(
        PrepareTaskParams parameters,
        CancellationToken cancellationToken)
    {
        var task = parameters.Task?.Trim() ?? string.Empty;
        if (task.Length is < 1 or > 2000)
        {
            throw new ArgumentException("Task must contain between 1 and 2000 characters.", nameof(parameters));
        }
        var candidateLimit = parameters.CandidateLimit ?? 8;
        if (candidateLimit is < 1 or > 20)
        {
            throw new ArgumentOutOfRangeException(
                nameof(parameters), "candidateLimit must be between 1 and 20.");
        }
        if (workspaceKey is null)
        {
            return TaskContextResult.NotCreated(task);
        }
        var summary = await GetAtlasSummaryAsync(cancellationToken);
        if (summary.AtlasState == "not_created")
        {
            return TaskContextResult.NotCreated(task);
        }
        if (parameters.Query is { Length: > 500 })
        {
            throw new ArgumentException("Task query must contain at most 500 characters.", nameof(parameters));
        }

        if (!string.IsNullOrWhiteSpace(parameters.StableKey) || parameters.Id is not null)
        {
            var exactPack = await PrepareChangeAsync(
                ToPrepareChangeParams(parameters, parameters.StableKey, parameters.Id),
                cancellationToken);
            return new TaskContextResult(
                exactPack.AtlasState,
                exactPack.Generation,
                task,
                "exact",
                [],
                [],
                exactPack);
        }

        var terms = ExtractTaskTerms(parameters.Query, task);
        var ranked = await ResolveTaskSeedsAsync(terms, candidateLimit, cancellationToken);
        var generation = summary.Generation;
        if (ranked.Count == 0)
        {
            return new TaskContextResult(
                "current", generation, task, "no_match", terms, [], null);
        }

        var top = ranked[0];
        var second = ranked.Count > 1 ? ranked[1] : null;
        var canSelect = second is null
            || top.ExactNameMatch && top.Score - second.Score >= 30
            || top.Score >= 100 && top.Score - second.Score >= 70;
        if (!canSelect)
        {
            return new TaskContextResult(
                "current", generation, task, "needs_seed", terms, ranked, null);
        }

        var pack = await PrepareChangeAsync(
            ToPrepareChangeParams(parameters, top.Entity.StableKey, null),
            cancellationToken);
        return new TaskContextResult(
            pack.AtlasState,
            pack.Generation,
            task,
            "auto",
            terms,
            ranked,
            pack);
    }

    private async Task<IReadOnlyList<TaskSeedCandidate>> ResolveTaskSeedsAsync(
        IReadOnlyList<string> terms,
        int limit,
        CancellationToken cancellationToken)
    {
        var candidates = new Dictionary<string, CandidateAccumulator>(StringComparer.Ordinal);
        foreach (var term in terms)
        {
            var result = await SearchEntitiesAsync(
                new SearchEntitiesParams(term, null, 20), cancellationToken);
            foreach (var match in result.Matches)
            {
                var exactName = match.Name.Equals(term, StringComparison.OrdinalIgnoreCase)
                    || match.QualifiedName.Equals(term, StringComparison.OrdinalIgnoreCase);
                var score = exactName
                    ? 120
                    : match.Name.StartsWith(term, StringComparison.OrdinalIgnoreCase)
                        ? 70
                        : match.Name.Contains(term, StringComparison.OrdinalIgnoreCase)
                            ? 50
                            : 30;
                score += KindPriority(match.Kind);
                if (!candidates.TryGetValue(match.StableKey, out var candidate))
                {
                    candidate = new CandidateAccumulator(match);
                    candidates.Add(match.StableKey, candidate);
                }
                candidate.Score += score;
                candidate.ExactNameMatch |= exactName;
                candidate.MatchedTerms.Add(term);
            }
        }

        return candidates.Values
            .Select(candidate => new TaskSeedCandidate(
                candidate.Entity,
                candidate.Score,
                candidate.MatchedTerms.OrderBy(value => value, StringComparer.OrdinalIgnoreCase).ToArray(),
                candidate.ExactNameMatch))
            .OrderByDescending(candidate => candidate.Score)
            .ThenByDescending(candidate => candidate.ExactNameMatch)
            .ThenBy(candidate => candidate.Entity.QualifiedName, StringComparer.Ordinal)
            .Take(limit)
            .ToArray();
    }

    private async Task<PreparedChangeResult> AttachSourceSlicesAsync(
        PreparedChangeResult result,
        int sourceLineLimit,
        CancellationToken cancellationToken)
    {
        if (sourceLineLimit is < 8 or > 120)
        {
            throw new ArgumentOutOfRangeException(
                nameof(sourceLineLimit), "sourceLineLimit must be between 8 and 120.");
        }

        var items = result.Items.ToArray();
        var eligible = items.Count(item => item.Evidence is { IsGenerated: false });
        var included = 0;
        var includedSlices = new List<PreparedSourceSlice>();
        for (var index = 0; index < items.Length; index++)
        {
            var evidence = items[index].Evidence;
            if (evidence is null || evidence.IsGenerated)
            {
                continue;
            }
            var slice = await ReadSourceSliceAsync(evidence, sourceLineLimit, cancellationToken);
            if (slice is null)
            {
                continue;
            }
            if (includedSlices.Any(existing => SlicesOverlap(existing, slice)))
            {
                continue;
            }

            var candidateItems = items.ToArray();
            candidateItems[index] = candidateItems[index] with { Source = slice };
            var candidate = result with
            {
                Items = candidateItems,
                SourceSlicesIncluded = included + 1,
                OmittedSourceSlices = Math.Max(0, eligible - included - 1)
            };
            if (EstimateTokens(candidate) > result.TokenBudget)
            {
                continue;
            }
            items = candidateItems;
            included++;
            includedSlices.Add(slice);
        }

        var final = result with
        {
            Items = items,
            SourceSlicesIncluded = included,
            OmittedSourceSlices = Math.Max(0, eligible - included),
            Truncated = result.Truncated || included < eligible
        };
        final = final with { EstimatedTokens = EstimateTokens(final) };
        return final with { EstimatedTokens = EstimateTokens(final) };
    }

    private async Task<PreparedSourceSlice?> ReadSourceSliceAsync(
        EntityLocationDetail evidence,
        int lineLimit,
        CancellationToken cancellationToken)
    {
        var sourceFile = await RequireRepository().GetSourceFileAsync(
            workspaceKey!, evidence.FileStableKey, cancellationToken);
        if (sourceFile is null
            || sourceFile.SizeBytes > MaximumSourceFileBytes
            || !SourceExtensions.Contains(Path.GetExtension(sourceFile.RelativePath)))
        {
            return null;
        }

        var fullPath = Path.GetFullPath(Path.Combine(sourceFile.RootPath, sourceFile.RelativePath));
        if (!IsWithinWorkspaceRoot(fullPath, sourceFile.RootPath)
            || !workspaceRoots.Any(root => IsWithinWorkspaceRoot(fullPath, root))
            || !File.Exists(fullPath)
            || new FileInfo(fullPath).Length > MaximumSourceFileBytes)
        {
            return null;
        }

        var lines = await File.ReadAllLinesAsync(fullPath, cancellationToken);
        if (lines.Any(line => line.Contains('\0')) || lines.Length == 0)
        {
            return null;
        }

        var evidenceStart = Math.Clamp(evidence.StartLine, 1, lines.Length);
        var evidenceEnd = Math.Clamp(Math.Max(evidence.StartLine, evidence.EndLine), evidenceStart, lines.Length);
        var start = Math.Max(1, evidenceStart - 3);
        var desiredEnd = Math.Min(lines.Length, evidenceEnd + 3);
        var end = Math.Min(desiredEnd, start + lineLimit - 1);
        if (end - start + 1 < lineLimit && start > 1)
        {
            start = Math.Max(1, end - lineLimit + 1);
        }
        var content = string.Join('\n', lines.Skip(start - 1).Take(end - start + 1));
        return new PreparedSourceSlice(
            sourceFile.RelativePath,
            start,
            end,
            sourceFile.Language,
            content,
            start > 1 || end < lines.Length || end < desiredEnd);
    }

    private static IReadOnlyList<string> ExtractTaskTerms(string? query, string task)
    {
        var terms = new List<string>();
        if (!string.IsNullOrWhiteSpace(query))
        {
            terms.Add(query.Trim());
        }
        terms.AddRange(Regex.Matches(string.IsNullOrWhiteSpace(query) ? task : query, "[A-Za-z_][A-Za-z0-9_.]*")
            .Select(match => match.Value)
            .Where(value => value.Length >= 3 && !TaskStopWords.Contains(value))
            .OrderByDescending(value => value.Length));
        return terms
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(8)
            .ToArray();
    }

    private static int KindPriority(string kind) => kind switch
    {
        "http_endpoint" => 25,
        "method" => 20,
        "database_operation" or "database_object" => 18,
        "class" or "interface" => 15,
        "service_registration" => 12,
        _ => 5
    };

    private static bool SlicesOverlap(PreparedSourceSlice left, PreparedSourceSlice right) =>
        left.RelativePath.Equals(right.RelativePath, StringComparison.OrdinalIgnoreCase)
        && left.StartLine <= right.EndLine + 2
        && right.StartLine <= left.EndLine + 2;

    private static PrepareChangeParams ToPrepareChangeParams(
        PrepareTaskParams parameters,
        string? stableKey,
        long? id) => new(
            parameters.Task,
            stableKey,
            id,
            parameters.TokenBudget,
            parameters.MaxDepth,
            parameters.IncludeProposed,
            parameters.IncludeSource ?? true,
            parameters.SourceLineLimit);

    private static bool IsWithinWorkspaceRoot(string fullPath, string root)
    {
        var normalizedRoot = Path.TrimEndingDirectorySeparator(Path.GetFullPath(root));
        var comparison = OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;
        return fullPath.Equals(normalizedRoot, comparison)
            || fullPath.StartsWith(normalizedRoot + Path.DirectorySeparatorChar, comparison);
    }

    private static int EstimateTokens<T>(T value)
    {
        var json = JsonSerializer.Serialize(value, ContextJsonOptions);
        return Math.Max(1, (json.Length + 3) / 4);
    }

    private sealed class CandidateAccumulator(AtlasEntitySearchMatch entity)
    {
        public AtlasEntitySearchMatch Entity { get; } = entity;
        public int Score { get; set; }
        public bool ExactNameMatch { get; set; }
        public HashSet<string> MatchedTerms { get; } = new(StringComparer.OrdinalIgnoreCase);
    }
}
