using System.Security.Cryptography;
using System.Text;

namespace KrakenAtlas.Workspace;

public static class WorkspaceIdentity
{
    public static IReadOnlyList<string> NormalizeRoots(IEnumerable<string> requestedRoots) => requestedRoots
        .Where(root => !string.IsNullOrWhiteSpace(root))
        .Select(root => Path.TrimEndingDirectorySeparator(Path.GetFullPath(root)))
        .Distinct(PathComparer)
        .OrderBy(root => root, StringComparer.Ordinal)
        .ToArray();

    public static string CreateStableKey(IEnumerable<string> roots)
    {
        var normalized = NormalizeRoots(roots);
        var identity = string.Join("\n", normalized.Select(NormalizeForIdentity));
        return $"workspace:{Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity))).ToLowerInvariant()}";
    }

    private static string NormalizeForIdentity(string path) =>
        OperatingSystem.IsWindows() ? path.Replace('\\', '/').ToUpperInvariant() : path.Replace('\\', '/');

    private static StringComparer PathComparer => OperatingSystem.IsWindows()
        ? StringComparer.OrdinalIgnoreCase
        : StringComparer.Ordinal;
}
