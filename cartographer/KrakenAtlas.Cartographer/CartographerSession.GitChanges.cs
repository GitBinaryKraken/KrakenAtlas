using KrakenAtlas.Core;
using KrakenAtlas.Protocol;

namespace KrakenAtlas.Cartographer;

internal sealed partial class CartographerSession
{
    public async Task<GitChangeProjectionResult> GetGitChangesAsync(
        GetGitChangesParams parameters,
        CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        var mode = string.IsNullOrWhiteSpace(parameters.Mode)
            ? "working_tree"
            : parameters.Mode.Trim().ToLowerInvariant();
        var targetRef = mode == "range"
            ? string.IsNullOrWhiteSpace(parameters.TargetRef) ? "HEAD" : parameters.TargetRef
            : null;
        var maxDepth = parameters.MaxDepth ?? 2;
        var maxEntities = parameters.MaxEntities ?? 100;
        var maxFiles = parameters.MaxFiles ?? 100;
        if (maxDepth is < 1 or > 8)
        {
            throw new ArgumentOutOfRangeException(nameof(parameters),
                "Git projection maxDepth must be between 1 and 8.");
        }
        var batches = await GitChangeReader.ReadAsync(
            workspaceRoots,
            mode,
            parameters.BaseRef,
            targetRef,
            maxFiles,
            cancellationToken);
        var deltas = batches.SelectMany(batch => batch.Deltas).ToArray();

        if (workspaceKey is null)
        {
            return GitChangeProjectionResult.NotCreated(
                mode,
                parameters.BaseRef,
                targetRef,
                CreateRepositoryProjections(batches, []));
        }

        var map = await activeRepository.MapGitChangesAsync(
            workspaceKey,
            deltas,
            maxEntities,
            cancellationToken);
        var repositories = CreateRepositoryProjections(batches, map.ChangedFiles);
        if (map.AtlasState == "not_created")
        {
            return GitChangeProjectionResult.NotCreated(mode, parameters.BaseRef, targetRef, repositories);
        }

        var changedEntities = map.ChangedFiles
            .SelectMany(file => file.Entities)
            .Where(entity => entity.Kind is not ("file" or "project" or "solution" or "workspace"))
            .DistinctBy(entity => entity.StableKey)
            .ToArray();
        var seeds = changedEntities.Take(Math.Min(8, maxEntities)).ToArray();
        var changedEntityKeys = changedEntities.Select(entity => entity.StableKey).ToHashSet(StringComparer.Ordinal);
        var impacts = new Dictionary<string, GitProjectedImpact>(StringComparer.Ordinal);
        var relatedTests = new Dictionary<string, ChangeSurfaceItem>(StringComparer.Ordinal);
        var affectedProjects = map.ChangedFiles
            .Where(file => file.Project is not null)
            .Select(file => file.Project!)
            .GroupBy(project => project.StableKey, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.Ordinal);
        var verificationCommands = new Dictionary<string, WorkspaceCommandDetail>(StringComparer.Ordinal);
        var truncated = map.Truncated
            || batches.Any(batch => batch.ChangesTruncated)
            || changedEntities.Length > seeds.Length;

        foreach (var seed in seeds)
        {
            var surface = await activeRepository.GetChangeSurfaceAsync(
                workspaceKey,
                seed.StableKey,
                null,
                maxDepth: maxDepth,
                maxEntities: Math.Max(10, Math.Min(100, maxEntities)),
                cancellationToken: cancellationToken);
            truncated |= surface.Truncated || surface.GraphTruncated;
            foreach (var item in surface.Direct.Concat(surface.Transitive))
            {
                if (changedEntityKeys.Contains(item.Entity.StableKey)
                    || item.Project?.IsTest == true
                    || impacts.Count >= maxEntities)
                {
                    continue;
                }
                var candidate = new GitProjectedImpact(
                    item.Entity,
                    seed.StableKey,
                    item.Depth,
                    item.PathDirection,
                    item.ViaRelation.Domain,
                    item.ViaRelation.Kind,
                    item.Project);
                if (!impacts.TryGetValue(item.Entity.StableKey, out var existing)
                    || candidate.Depth < existing.Depth)
                {
                    impacts[item.Entity.StableKey] = candidate;
                }
            }
            foreach (var item in surface.RelatedTests)
            {
                if (relatedTests.Count < maxEntities)
                {
                    relatedTests.TryAdd(item.Entity.StableKey, item);
                }
            }
            foreach (var project in surface.AffectedProjects)
            {
                affectedProjects.TryAdd(project.StableKey, project);
            }
            foreach (var command in surface.VerificationCommands)
            {
                verificationCommands.TryAdd(command.StableKey, command);
            }
        }
        truncated |= impacts.Count >= maxEntities;

        return new GitChangeProjectionResult(
            batches.Count == 0 ? "no_repository" : "current",
            map.Generation,
            mode,
            parameters.BaseRef,
            targetRef,
            truncated,
            repositories,
            impacts.Values
                .OrderBy(item => item.Depth)
                .ThenBy(item => item.Project?.RelativePath, StringComparer.Ordinal)
                .ThenBy(item => item.Entity.QualifiedName, StringComparer.Ordinal)
                .ToArray(),
            relatedTests.Values
                .OrderBy(item => item.Project?.RelativePath, StringComparer.Ordinal)
                .ThenBy(item => item.Entity.QualifiedName, StringComparer.Ordinal)
                .ToArray(),
            affectedProjects.Values
                .OrderByDescending(project => project.IsTest)
                .ThenBy(project => project.RelativePath, StringComparer.Ordinal)
                .ToArray(),
            map.AssessmentRisks,
            verificationCommands.Values
                .OrderBy(command => command.Kind, StringComparer.Ordinal)
                .ThenBy(command => command.CommandText, StringComparer.Ordinal)
                .ToArray());
    }

    private static IReadOnlyList<GitRepositoryProjection> CreateRepositoryProjections(
        IReadOnlyList<GitRepositoryDeltaBatch> batches,
        IReadOnlyList<GitChangedFileProjection> changedFiles)
    {
        var offset = 0;
        return batches.Select(batch =>
        {
            var files = changedFiles.Skip(offset).Take(batch.Deltas.Count).ToArray();
            if (files.Length == 0 && batch.Deltas.Count > 0)
            {
                files = batch.Deltas.Select(delta => new GitChangedFileProjection(
                    delta.Status, delta.Path, delta.OldPath, null, null, false, [])).ToArray();
            }
            offset += batch.Deltas.Count;
            return new GitRepositoryProjection(
                batch.RepositoryRoot,
                batch.Branch,
                batch.Head,
                batch.Dirty,
                batch.ChangesTruncated,
                files);
        }).ToArray();
    }
}
