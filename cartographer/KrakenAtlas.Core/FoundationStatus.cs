namespace KrakenAtlas.Core;

public sealed record FoundationStatus(
    string Phase,
    string CartographerState,
    string AtlasState,
    string IndexingState,
    string Message)
{
    public static FoundationStatus Create(AtlasSummary summary) => new(
        Phase: "change_surface_alpha",
        CartographerState: "available",
        AtlasState: summary.AtlasState,
        IndexingState: summary.Generation is null ? "not_started" : "current",
        Message: summary.Generation is null
            ? "Cartographer is ready. Build the Atlas to discover workspace projects and files."
            : $"Atlas generation {summary.Generation} contains {summary.Counts.Projects} projects, {summary.Counts.Files} files, and {summary.Counts.Relations} relations.");
}
