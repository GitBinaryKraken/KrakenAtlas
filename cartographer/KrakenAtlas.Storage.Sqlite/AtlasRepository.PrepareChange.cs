using System.Text.Json;
using KrakenAtlas.Core;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    private static readonly string[] PrepareChangeInstructions =
    [
        "Use stableKey as canonical identity; names and paths are display metadata.",
        "Read the listed evidence spans first and broaden source retrieval only when the pack reports a gap.",
        "dependency means the prior entity depends on this item; dependent means this item depends on the prior entity.",
        "Treat static surface items as inspection candidates, not a claim that every item must be edited.",
        "Reuse only current assessments and preserve their status, confidence, author, and evidence in downstream reasoning.",
        "Rebuild the Atlas and prepare a new pack if the workspace generation changes before editing."
    ];

    public async Task<PreparedChangeResult> PrepareChangeAsync(
        string workspaceKey,
        string task,
        string? stableKey,
        long? id,
        int tokenBudget = 4000,
        int maxDepth = 3,
        bool includeProposed = false,
        CancellationToken cancellationToken = default)
    {
        ValidateIdentity(stableKey, id, "Prepare-change seed");
        task = task.Trim();
        if (task.Length is < 1 or > 2000)
        {
            throw new ArgumentException("Prepare-change task must contain between 1 and 2000 characters.", nameof(task));
        }
        if (tokenBudget is < 800 or > 32000)
        {
            throw new ArgumentOutOfRangeException(
                nameof(tokenBudget), "Prepare-change tokenBudget must be between 800 and 32000.");
        }
        if (maxDepth is < 1 or > 8)
        {
            throw new ArgumentOutOfRangeException(nameof(maxDepth), "Prepare-change maxDepth must be between 1 and 8.");
        }

        var surfaceLimit = Math.Clamp(tokenBudget / 30, 20, 300);
        var surface = await GetChangeSurfaceAsync(
            workspaceKey,
            stableKey,
            id,
            maxDepth: maxDepth,
            maxEntities: surfaceLimit,
            cancellationToken: cancellationToken);
        if (surface.AtlasState == "not_created")
        {
            return PreparedChangeResult.NotCreated(task, tokenBudget);
        }
        if (surface.AtlasState == "entity_not_found" || surface.Seed is null || surface.Generation is null)
        {
            return PreparedChangeResult.EntityNotFound(surface.Generation ?? 0, task, tokenBudget);
        }

        var seedDetail = await GetEntityAsync(
            workspaceKey, surface.Seed.StableKey, null, cancellationToken);
        var candidates = new Dictionary<string, PreparedChangeItem>(StringComparer.Ordinal);
        AddCandidate(candidates, new PreparedChangeItem(
            surface.Seed,
            "seed",
            100,
            0,
            null,
            null,
            null,
            surface.SeedProject,
            seedDetail?.Locations.FirstOrDefault()));
        foreach (var item in surface.Direct)
        {
            AddSurfaceCandidate(candidates, item, "direct", 90);
        }
        foreach (var item in surface.RelatedTests)
        {
            AddSurfaceCandidate(candidates, item, "related_test", 95);
        }
        foreach (var item in surface.Transitive)
        {
            AddSurfaceCandidate(candidates, item, "transitive", Math.Max(40, 75 - item.Depth * 5));
        }
        var rankedCandidates = candidates.Values
            .OrderByDescending(item => item.Score)
            .ThenBy(item => item.Depth)
            .ThenBy(item => item.Entity.QualifiedName, StringComparer.Ordinal)
            .ToArray();
        var allAssessments = await GetAssessmentsForEntitiesAsync(
            workspaceKey,
            rankedCandidates.Select(item => item.Entity.StableKey).ToArray(),
            includeProposed,
            500,
            cancellationToken);
        var scoresByKey = rankedCandidates.ToDictionary(
            item => item.Entity.StableKey, item => item.Score, StringComparer.Ordinal);
        var rankedAssessments = allAssessments
            .OrderByDescending(assessment => scoresByKey.GetValueOrDefault(assessment.Subject.StableKey))
            .ThenBy(assessment => assessment.Status == "accepted" ? 0 : 1)
            .ThenByDescending(assessment => assessment.Confidence)
            .ThenByDescending(assessment => assessment.UpdatedUtc)
            .ToArray();

        var projects = surface.AffectedProjects.ToList();
        var commands = surface.VerificationCommands.ToList();
        var selectedItems = SelectWithinBudget(
            rankedCandidates,
            Math.Max(300, tokenBudget * 55 / 100),
            item => EstimateTokens(item));
        if (selectedItems.All(item => item.Relevance != "seed"))
        {
            selectedItems.Insert(0, rankedCandidates.Single(item => item.Relevance == "seed"));
        }
        var selectedAssessments = SelectWithinBudget(
            rankedAssessments,
            Math.Max(150, tokenBudget * 25 / 100),
            assessment => EstimateTokens(assessment));

        var omittedItems = rankedCandidates.Length - selectedItems.Count;
        var omittedAssessments = rankedAssessments.Length - selectedAssessments.Count;
        PreparedChangeResult result;
        while (true)
        {
            result = new PreparedChangeResult(
                "current",
                surface.Generation,
                task,
                tokenBudget,
                0,
                omittedItems > 0 || omittedAssessments > 0 || surface.Truncated || surface.GraphTruncated,
                surface.Truncated,
                surface.GraphTruncated,
                surface.Seed,
                surface.SeedProject,
                PrepareChangeInstructions,
                selectedItems,
                selectedAssessments,
                projects,
                commands,
                omittedItems,
                omittedAssessments);
            var estimated = EstimateTokens(result);
            if (estimated <= tokenBudget)
            {
                return result with { EstimatedTokens = estimated };
            }
            if (selectedItems.Count > 1 && (selectedAssessments.Count <= 1 || selectedItems.Count >= selectedAssessments.Count))
            {
                selectedItems.RemoveAt(selectedItems.Count - 1);
                omittedItems++;
                continue;
            }
            if (selectedAssessments.Count > 0)
            {
                selectedAssessments.RemoveAt(selectedAssessments.Count - 1);
                omittedAssessments++;
                continue;
            }
            if (commands.Count > 0)
            {
                commands.RemoveAt(commands.Count - 1);
                continue;
            }
            if (projects.Count > 1)
            {
                projects.RemoveAt(projects.Count - 1);
                continue;
            }
            return result with { EstimatedTokens = estimated, Truncated = true };
        }
    }

    private static void AddSurfaceCandidate(
        IDictionary<string, PreparedChangeItem> candidates,
        ChangeSurfaceItem item,
        string relevance,
        int score) => AddCandidate(candidates, new PreparedChangeItem(
            item.Entity,
            relevance,
            score,
            item.Depth,
            item.PathDirection,
            item.ViaRelation.Domain,
            item.ViaRelation.Kind,
            item.Project,
            item.ViaRelation.Evidence));

    private static void AddCandidate(
        IDictionary<string, PreparedChangeItem> candidates,
        PreparedChangeItem candidate)
    {
        if (!candidates.TryGetValue(candidate.Entity.StableKey, out var existing)
            || candidate.Score > existing.Score)
        {
            candidates[candidate.Entity.StableKey] = candidate;
        }
    }

    private static List<T> SelectWithinBudget<T>(
        IEnumerable<T> candidates,
        int budget,
        Func<T, int> estimate)
    {
        var selected = new List<T>();
        var used = 0;
        foreach (var candidate in candidates)
        {
            var cost = estimate(candidate);
            if (selected.Count > 0 && used + cost > budget)
            {
                continue;
            }
            selected.Add(candidate);
            used += cost;
        }
        return selected;
    }

    private static int EstimateTokens<T>(T value)
    {
        var json = JsonSerializer.Serialize(value, AssessmentJsonOptions);
        return Math.Max(1, (json.Length + 3) / 4);
    }
}
