namespace KrakenAtlas.Core;

public sealed record AtlasSourceFile(
    string StableKey,
    string RootPath,
    string RelativePath,
    string Language,
    string ContentHash,
    long SizeBytes);
