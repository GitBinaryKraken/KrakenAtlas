using KrakenAtlas.Analyzers.Roslyn;
using KrakenAtlas.Core;
using KrakenAtlas.Workspace;

namespace KrakenAtlas.Cartographer;

internal sealed partial class CartographerSession
{
    private static readonly (string Name, string Version)[] ExpectedAnalyzerVersions =
    [
        (WorkspaceDiscovery.AnalyzerName, WorkspaceDiscovery.AnalyzerVersion),
        (CSharpDeclarationAnalyzer.AnalyzerName, CSharpDeclarationAnalyzer.AnalyzerVersion)
    ];

    public async Task<AtlasHealthResult> GetAtlasHealthAsync(CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        var summary = workspaceKey is null
            ? AtlasSummary.NotCreated()
            : await activeRepository.GetSummaryAsync(workspaceKey, cancellationToken);
        var analyzers = BuildAnalyzerCompatibility(summary);
        var reasons = new List<AtlasHealthReason>();
        var buildRequired = summary.AtlasState == "not_created";
        var sourceState = summary.AtlasState == "not_created" ? "not_indexed" : "unknown";
        var workspaceRootsAvailable = workspaceRoots.Count > 0
            && workspaceRoots.All(Directory.Exists);

        if (buildRequired)
        {
            reasons.Add(new AtlasHealthReason(
                "atlas_not_created",
                "No Atlas generation exists for the current workspace roots."));
        }
        else
        {
            foreach (var analyzer in analyzers.Where(item => !item.Current))
            {
                buildRequired = true;
                reasons.Add(new AtlasHealthReason(
                    "analyzer_version_changed",
                    $"{analyzer.Analyzer} expects {analyzer.ExpectedVersion}; indexed versions are "
                    + (analyzer.IndexedVersions.Count == 0
                        ? "missing."
                        : $"{string.Join(", ", analyzer.IndexedVersions)}.")));
            }

            foreach (var run in summary.AnalyzerRuns.Where(run => run.Status == "failed"))
            {
                buildRequired = true;
                reasons.Add(new AtlasHealthReason(
                    "analyzer_failed",
                    $"{run.Analyzer} {run.AnalyzerVersion} failed for {run.Capability}."));
            }
        }

        if (workspaceRoots.Count == 0)
        {
            buildRequired = true;
            sourceState = "workspace_unavailable";
            reasons.Add(new AtlasHealthReason(
                "workspace_roots_missing",
                "No workspace roots are connected to this Cartographer session."));
        }
        else if (workspaceRoots.Any(root => !Directory.Exists(root)))
        {
            buildRequired = true;
            sourceState = "workspace_unavailable";
            reasons.Add(new AtlasHealthReason(
                "workspace_root_unavailable",
                "At least one configured workspace root no longer exists at its launch path."));
        }
        else
        {
            var snapshot = await discovery.DiscoverAsync(workspaceRoots, cancellationToken);
            if (summary.Generation is null)
            {
                sourceState = "not_indexed";
            }
            else
            {
                var current = await activeRepository.GetIndexStateAsync(
                    snapshot.StableKey,
                    CSharpDeclarationAnalyzer.AnalyzerName,
                    CSharpDeclarationAnalyzer.AnalyzerVersion,
                    cancellationToken);
                sourceState = current?.SourceFingerprint == snapshot.SourceFingerprint
                    ? "current"
                    : "changed";
                if (sourceState == "changed")
                {
                    buildRequired = true;
                    reasons.Add(new AtlasHealthReason(
                        "workspace_sources_changed",
                        "Discovered workspace inputs differ from the current Atlas generation."));
                }
            }
        }

        IReadOnlyList<GitRepositoryDeltaBatch> gitBatches = !workspaceRootsAvailable
            ? []
            : await GitChangeReader.ReadAsync(
                workspaceRoots,
                "working_tree",
                null,
                null,
                1,
                cancellationToken);
        var git = gitBatches.Count == 0
            ? new AtlasGitHealth(
                "no_repository",
                [],
                "Skip project_git_changes until a workspace root is inside a Git repository.")
            : new AtlasGitHealth(
                "repository",
                gitBatches.Select(batch => batch.RepositoryRoot).ToArray(),
                "Use project_git_changes before rebuilding source edits that need impact projection.");
        var coverage = WorkspaceOrientation.CurrentCoverage();
        if (coverage.Status != "complete")
        {
            reasons.Add(new AtlasHealthReason(
                "orientation_coverage_partial",
                $"Pending orientation sources: {string.Join(", ", coverage.PendingSources)}."));
        }

        var actions = new List<string>();
        if (buildRequired)
        {
            actions.Add("Call build_atlas before relying on map queries.");
        }
        else
        {
            actions.Add("Use get_workspace_orientation for repository structure and commands.");
        }
        actions.Add(git.Guidance);
        actions.Add("Use prepare_change only for a concrete code-change task, not for install or workspace-health review.");
        actions.Add("For setup diagnostics, use this health result plus get_atlas_summary and get_workspace_orientation.");

        return new AtlasHealthResult(
            buildRequired
                ? summary.Generation is null ? "not_created" : "requires_rebuild"
                : "current",
            summary.Generation,
            buildRequired,
            sourceState,
            workspaceRoots,
            analyzers,
            git,
            new AtlasConnectionHealth(
                "path_bound_stdio",
                true,
                "Managed VS Code client configurations refresh on trusted extension activation; rerun Set Up AI Agent after a move if the client starts before that refresh."),
            coverage,
            reasons,
            actions);
    }

    private static IReadOnlyList<AtlasAnalyzerCompatibility> BuildAnalyzerCompatibility(
        AtlasSummary summary) => ExpectedAnalyzerVersions
            .Select(expected =>
            {
                var indexed = summary.AnalyzerRuns
                    .Where(run => run.Analyzer == expected.Name)
                    .Select(run => run.AnalyzerVersion)
                    .Distinct(StringComparer.Ordinal)
                    .OrderBy(version => version, StringComparer.Ordinal)
                    .ToArray();
                return new AtlasAnalyzerCompatibility(
                    expected.Name,
                    expected.Version,
                    indexed,
                    indexed.Contains(expected.Version, StringComparer.Ordinal));
            })
            .ToArray();

    private static bool AnalyzerRunsAreCurrent(AtlasSummary summary) =>
        summary.Generation is null
        || (BuildAnalyzerCompatibility(summary).All(analyzer => analyzer.Current)
            && summary.AnalyzerRuns.All(run => run.Status != "failed"));
}
