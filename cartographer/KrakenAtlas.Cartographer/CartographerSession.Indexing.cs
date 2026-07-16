using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using KrakenAtlas.Analyzers.Roslyn;
using KrakenAtlas.Core;

namespace KrakenAtlas.Cartographer;

internal sealed partial class CartographerSession
{
    private async Task<IndexedSemanticSnapshot> BuildSemanticSnapshotAsync(
        WorkspaceSnapshot snapshot,
        AtlasIndexState? current,
        CancellationToken cancellationToken)
    {
        var csharpProjects = snapshot.Projects
            .Where(project => project.Language == "csharp"
                && project.RelativePath.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase))
            .OrderBy(project => project.StableKey, StringComparer.Ordinal)
            .ToArray();
        var fingerprints = csharpProjects.ToDictionary(
            project => project.StableKey,
            project => CreateProjectInputFingerprint(snapshot, project),
            StringComparer.Ordinal);
        var cachedByProject = (current?.SemanticProjects ?? [])
            .ToDictionary(entry => entry.ProjectKey, StringComparer.Ordinal);
        var currentProjectKeys = csharpProjects
            .Select(project => project.StableKey)
            .ToHashSet(StringComparer.Ordinal);
        var directlyChanged = csharpProjects
            .Where(project => !cachedByProject.TryGetValue(project.StableKey, out var cached)
                || cached.InputFingerprint != fingerprints[project.StableKey])
            .Select(project => project.StableKey)
            .ToHashSet(StringComparer.Ordinal);

        if (current?.SemanticStatus == "failed")
        {
            directlyChanged.UnionWith(currentProjectKeys);
        }

        if (cachedByProject.Keys.Any(projectKey => !currentProjectKeys.Contains(projectKey)))
        {
            directlyChanged.UnionWith(currentProjectKeys);
        }

        var invalidated = ExpandToDependentProjects(snapshot.ProjectReferences, directlyChanged);
        var reused = csharpProjects
            .Where(project => !invalidated.Contains(project.StableKey)
                && cachedByProject.TryGetValue(project.StableKey, out var cached)
                && cached.InputFingerprint == fingerprints[project.StableKey])
            .Select(project => cachedByProject[project.StableKey])
            .ToArray();
        var knownSymbols = reused
            .SelectMany(entry => entry.Symbols)
            .GroupBy(symbol => symbol.StableKey, StringComparer.Ordinal)
            .Select(group => group.First())
            .ToArray();
        var knownAssemblies = reused
            .Where(entry => !string.IsNullOrWhiteSpace(entry.AssemblyName))
            .Select(entry => new AnalyzedProjectAssembly(entry.ProjectKey, entry.AssemblyName!))
            .ToArray();

        CSharpSemanticSnapshot analyzed;
        if (invalidated.Count == 0)
        {
            analyzed = new CSharpSemanticSnapshot(
                knownSymbols,
                [],
                new AnalyzerExecution(
                    CSharpDeclarationAnalyzer.AnalyzerName,
                    CSharpDeclarationAnalyzer.AnalyzerVersion,
                    CSharpDeclarationAnalyzer.Capability,
                    "succeeded",
                    0,
                    $"Reused {reused.Length} unchanged project analyses."),
                knownAssemblies);
        }
        else
        {
            var semanticStopwatch = Stopwatch.StartNew();
            try
            {
                analyzed = await csharpDeclarationAnalyzer.AnalyzeAsync(
                    snapshot,
                    invalidated,
                    knownSymbols,
                    knownAssemblies,
                    cancellationToken);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception exception)
            {
                semanticStopwatch.Stop();
                analyzed = new CSharpSemanticSnapshot(
                    knownSymbols,
                    [],
                    new AnalyzerExecution(
                        CSharpDeclarationAnalyzer.AnalyzerName,
                        CSharpDeclarationAnalyzer.AnalyzerVersion,
                        CSharpDeclarationAnalyzer.Capability,
                        "failed",
                        semanticStopwatch.ElapsedMilliseconds,
                        $"{exception.GetType().Name}: {exception.Message}"),
                    knownAssemblies);
            }
        }

        var symbols = analyzed.Symbols
            .GroupBy(symbol => symbol.StableKey, StringComparer.Ordinal)
            .Select(group => group.Last())
            .OrderBy(symbol => symbol.StableKey, StringComparer.Ordinal)
            .ToArray();
        var relations = CSharpDeclarationAnalyzer.RebuildGlobalRelations(
            symbols,
            reused.SelectMany(entry => entry.Relations).Concat(analyzed.Relations));
        var projectAssemblies = (analyzed.ProjectAssemblies ?? [])
            .GroupBy(entry => entry.ProjectKey, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Last().AssemblyName, StringComparer.Ordinal);

        var cacheEntries = csharpProjects.Select(project =>
        {
            projectAssemblies.TryGetValue(project.StableKey, out var assemblyName);
            var projectSymbols = symbols
                .Where(symbol => symbol.ProjectKey == project.StableKey)
                .ToArray();
            var symbolKeys = projectSymbols.Select(symbol => symbol.StableKey).ToHashSet(StringComparer.Ordinal);
            var projectRelations = relations
                .Where(relation => relation.Kind != "matches_endpoint"
                    && (relation.SourceEntityKey == project.StableKey
                        || symbolKeys.Contains(relation.SourceEntityKey)))
                .ToArray();
            return new SemanticProjectCacheEntry(
                project.StableKey,
                fingerprints[project.StableKey],
                assemblyName,
                projectSymbols,
                projectRelations);
        }).ToArray();

        var previousFiles = (current?.Files ?? []).ToDictionary(file => file.StableKey, StringComparer.Ordinal);
        var currentFileKeys = snapshot.Files.Select(file => file.StableKey).ToHashSet(StringComparer.Ordinal);
        var changedFiles = snapshot.Files.Count(file =>
            !previousFiles.TryGetValue(file.StableKey, out var previous)
            || previous.ContentHash != file.ContentHash);
        var removedFiles = previousFiles.Values.Count(file => !currentFileKeys.Contains(file.StableKey));
        var indexing = new AtlasIndexingSummary(
            current is null ? "full" : "incremental",
            changedFiles,
            removedFiles,
            directlyChanged.Count,
            invalidated.Count,
            reused.Length,
            invalidated.OrderBy(key => key, StringComparer.Ordinal).ToArray());
        var diagnostic = string.Join(" ", new[]
        {
            analyzed.AnalyzerRun.Diagnostic,
            $"Index mode {indexing.Mode}; analyzed {indexing.AnalyzedProjects}, reused {indexing.ReusedProjects}."
        }.Where(value => !string.IsNullOrWhiteSpace(value)));
        var semanticSnapshot = new CSharpSemanticSnapshot(
            symbols,
            relations,
            analyzed.AnalyzerRun with { Diagnostic = diagnostic },
            projectAssemblies.Select(entry => new AnalyzedProjectAssembly(entry.Key, entry.Value)).ToArray());
        return new IndexedSemanticSnapshot(semanticSnapshot, cacheEntries, indexing);
    }

    private static HashSet<string> ExpandToDependentProjects(
        IReadOnlyList<DiscoveredProjectReference> references,
        IReadOnlySet<string> directlyChanged)
    {
        var invalidated = directlyChanged.ToHashSet(StringComparer.Ordinal);
        var dependents = references
            .Where(reference => reference.TargetProjectKey is not null)
            .GroupBy(reference => reference.TargetProjectKey!, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => group.Select(reference => reference.SourceProjectKey).Distinct(StringComparer.Ordinal).ToArray(),
                StringComparer.Ordinal);
        var queue = new Queue<string>(invalidated);
        while (queue.TryDequeue(out var changed))
        {
            if (!dependents.TryGetValue(changed, out var projectDependents))
            {
                continue;
            }
            foreach (var dependent in projectDependents)
            {
                if (invalidated.Add(dependent))
                {
                    queue.Enqueue(dependent);
                }
            }
        }
        return invalidated;
    }

    private static string CreateProjectInputFingerprint(
        WorkspaceSnapshot snapshot,
        DiscoveredProject project)
    {
        var builder = new StringBuilder()
            .AppendLine(project.StableKey)
            .AppendLine(project.TargetFrameworks)
            .AppendLine(project.Sdk);
        foreach (var file in snapshot.Files
            .Where(file => file.ProjectKey == project.StableKey || IsGlobalCSharpInput(file))
            .OrderBy(file => file.StableKey, StringComparer.Ordinal))
        {
            builder.Append(file.StableKey).Append('|').AppendLine(file.ContentHash);
        }
        foreach (var reference in snapshot.ProjectReferences
            .Where(reference => reference.SourceProjectKey == project.StableKey)
            .OrderBy(reference => reference.TargetPath, StringComparer.Ordinal))
        {
            builder.Append("ref|")
                .Append(reference.TargetProjectKey)
                .Append('|')
                .AppendLine(reference.TargetPath);
        }
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(builder.ToString())))
            .ToLowerInvariant();
    }

    private static bool IsGlobalCSharpInput(DiscoveredFile file)
    {
        if (file.ProjectKey is not null)
        {
            return false;
        }
        var name = Path.GetFileName(file.RelativePath);
        return file.RelativePath.EndsWith(".props", StringComparison.OrdinalIgnoreCase)
            || file.RelativePath.EndsWith(".targets", StringComparison.OrdinalIgnoreCase)
            || name.Equals("global.json", StringComparison.OrdinalIgnoreCase)
            || name.Equals("NuGet.config", StringComparison.OrdinalIgnoreCase)
            || name.Equals(".editorconfig", StringComparison.OrdinalIgnoreCase);
    }

    private sealed record IndexedSemanticSnapshot(
        CSharpSemanticSnapshot Snapshot,
        IReadOnlyList<SemanticProjectCacheEntry> CacheEntries,
        AtlasIndexingSummary Indexing);
}
