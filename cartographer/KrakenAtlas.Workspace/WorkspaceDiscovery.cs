using System.Security.Cryptography;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using KrakenAtlas.Core;

namespace KrakenAtlas.Workspace;

public sealed class WorkspaceDiscovery
{
    private static readonly HashSet<string> ExcludedDirectories = new(StringComparer.OrdinalIgnoreCase)
    {
        ".git", ".hg", ".svn", ".vs", ".idea", ".kraken-atlas", "bin", "obj",
        "node_modules", "packages", "vendor", "coverage", "dist", "dist-test"
    };

    public async Task<WorkspaceSnapshot> DiscoverAsync(
        IReadOnlyList<string> requestedRoots,
        CancellationToken cancellationToken = default)
    {
        var roots = WorkspaceIdentity.NormalizeRoots(requestedRoots).ToArray();

        if (roots.Length == 0)
        {
            throw new InvalidOperationException("Workspace discovery requires at least one root.");
        }

        foreach (var root in roots)
        {
            if (!Directory.Exists(root))
            {
                throw new DirectoryNotFoundException($"Workspace root does not exist: {root}");
            }
        }

        var workspaceKey = WorkspaceIdentity.CreateStableKey(roots);
        var discoveredCandidates = new List<FileCandidate>();
        foreach (var root in roots)
        {
            discoveredCandidates.AddRange(EnumerateFiles(root, cancellationToken));
        }
        var candidates = discoveredCandidates
            .GroupBy(candidate => candidate.FullPath, PathComparer)
            .Select(group => group.OrderByDescending(candidate => candidate.RootPath.Length).First())
            .OrderBy(candidate => candidate.FullPath, StringComparer.Ordinal)
            .ToArray();

        var solutions = candidates
            .Where(candidate => candidate.Extension is ".sln" or ".slnx")
            .Select(candidate => new DiscoveredSolution(
                StableKey(workspaceKey, "solution", candidate.RootPath, candidate.RelativePath),
                Path.GetFileNameWithoutExtension(candidate.FullPath),
                candidate.RootPath,
                candidate.RelativePath,
                candidate.Extension[1..]))
            .OrderBy(solution => solution.StableKey, StringComparer.Ordinal)
            .ToArray();

        var projects = new List<DiscoveredProject>();
        var projectReferences = new List<PendingProjectReference>();
        foreach (var candidate in candidates.Where(candidate => candidate.Extension == ".csproj"))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var (project, references) = ReadProject(workspaceKey, candidate);
            projects.Add(project);
            projectReferences.AddRange(references);
        }

        var orderedProjects = projects.OrderBy(project => project.StableKey, StringComparer.Ordinal).ToArray();
        var projectsByPath = orderedProjects.ToDictionary(
            project => NormalizeAbsolutePath(Path.Combine(project.RootPath, project.RelativePath)),
            project => project,
            PathComparer);

        var resolvedReferences = projectReferences
            .Select(reference => new DiscoveredProjectReference(
                reference.SourceProjectKey,
                projectsByPath.GetValueOrDefault(reference.TargetFullPath)?.StableKey,
                reference.TargetFullPath,
                reference.Line))
            .OrderBy(reference => reference.SourceProjectKey, StringComparer.Ordinal)
            .ThenBy(reference => reference.TargetPath, StringComparer.Ordinal)
            .ToArray();

        var projectDirectories = orderedProjects
            .Select(project => new
            {
                Project = project,
                Directory = NormalizeAbsolutePath(Path.GetDirectoryName(Path.Combine(project.RootPath, project.RelativePath))!)
            })
            .OrderByDescending(item => item.Directory.Length)
            .ToArray();

        var files = new List<DiscoveredFile>();
        foreach (var candidate in candidates.Where(IsAtlasFile))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var projectKey = projectDirectories.FirstOrDefault(item =>
                IsWithin(candidate.FullPath, item.Directory))?.Project.StableKey;
            await using var stream = File.OpenRead(candidate.FullPath);
            var hash = Convert.ToHexString(await SHA256.HashDataAsync(stream, cancellationToken)).ToLowerInvariant();
            files.Add(new DiscoveredFile(
                StableKey(workspaceKey, "file", candidate.RootPath, candidate.RelativePath),
                candidate.RootPath,
                candidate.RelativePath,
                projectKey,
                GetLanguage(candidate),
                hash,
                stream.Length,
                IsGenerated(candidate.RelativePath)));
        }

        var orderedFiles = files.OrderBy(file => file.StableKey, StringComparer.Ordinal).ToArray();
        var fingerprint = HashText(string.Join(
            "\n",
            orderedFiles.Select(file => $"{file.StableKey}:{file.ContentHash}")));

        return new WorkspaceSnapshot(
            workspaceKey,
            roots.Length == 1 ? new DirectoryInfo(roots[0]).Name : $"{roots.Length} workspace roots",
            roots,
            fingerprint,
            solutions,
            orderedProjects,
            resolvedReferences,
            orderedFiles);
    }

    private static (DiscoveredProject Project, IReadOnlyList<PendingProjectReference> References) ReadProject(
        string workspaceKey,
        FileCandidate candidate)
    {
        var document = XDocument.Load(candidate.FullPath, LoadOptions.SetLineInfo);
        var root = document.Root ?? throw new InvalidDataException($"Project has no root element: {candidate.FullPath}");
        var stableKey = StableKey(workspaceKey, "project", candidate.RootPath, candidate.RelativePath);
        var sdk = root.Attribute("Sdk")?.Value ?? FirstValue(root, "Sdk");
        var targetFrameworks = FirstValue(root, "TargetFrameworks") ?? FirstValue(root, "TargetFramework");
        var outputType = FirstValue(root, "OutputType");
        var isTestProject = string.Equals(FirstValue(root, "IsTestProject"), "true", StringComparison.OrdinalIgnoreCase);
        var name = FirstValue(root, "AssemblyName") ?? Path.GetFileNameWithoutExtension(candidate.FullPath);
        var project = new DiscoveredProject(
            stableKey,
            name,
            candidate.RootPath,
            candidate.RelativePath,
            "csharp",
            ClassifyProject(sdk, outputType, isTestProject),
            targetFrameworks,
            sdk);

        var references = root.Descendants()
            .Where(element => element.Name.LocalName == "ProjectReference")
            .Select(element => new
            {
                Include = element.Attribute("Include")?.Value,
                Line = element is IXmlLineInfo lineInfo && lineInfo.HasLineInfo() ? lineInfo.LineNumber : 1
            })
            .Where(item => !string.IsNullOrWhiteSpace(item.Include))
            .Select(item => new PendingProjectReference(
                stableKey,
                NormalizeAbsolutePath(Path.Combine(Path.GetDirectoryName(candidate.FullPath)!, item.Include!)),
                item.Line))
            .ToArray();

        return (project, references);
    }

    private static string? FirstValue(XElement root, string localName) => root
        .Descendants()
        .FirstOrDefault(element => element.Name.LocalName == localName && !string.IsNullOrWhiteSpace(element.Value))
        ?.Value.Trim();

    private static string ClassifyProject(string? sdk, string? outputType, bool isTestProject)
    {
        if (isTestProject)
        {
            return "test";
        }
        if (sdk?.Contains("Web", StringComparison.OrdinalIgnoreCase) == true)
        {
            return "web";
        }
        if (sdk?.Contains("Worker", StringComparison.OrdinalIgnoreCase) == true)
        {
            return "worker";
        }
        return outputType is not null
            && (outputType.Equals("Exe", StringComparison.OrdinalIgnoreCase)
                || outputType.Equals("WinExe", StringComparison.OrdinalIgnoreCase))
            ? "application"
            : "library";
    }

    private static IEnumerable<FileCandidate> EnumerateFiles(string root, CancellationToken cancellationToken)
    {
        var pending = new Stack<DirectoryInfo>();
        pending.Push(new DirectoryInfo(root));
        while (pending.Count > 0)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var directory = pending.Pop();
            FileSystemInfo[] children;
            try
            {
                children = directory.GetFileSystemInfos();
            }
            catch (Exception exception) when (exception is UnauthorizedAccessException or IOException)
            {
                continue;
            }

            foreach (var child in children.OrderBy(child => child.Name, StringComparer.Ordinal))
            {
                if (child is DirectoryInfo childDirectory)
                {
                    if (!ExcludedDirectories.Contains(childDirectory.Name)
                        && !childDirectory.Attributes.HasFlag(FileAttributes.ReparsePoint))
                    {
                        pending.Push(childDirectory);
                    }
                    continue;
                }

                if (child is FileInfo file)
                {
                    if (file.Attributes.HasFlag(FileAttributes.ReparsePoint))
                    {
                        continue;
                    }
                    var relativePath = NormalizeRelativePath(Path.GetRelativePath(root, file.FullName));
                    yield return new FileCandidate(
                        root,
                        NormalizeAbsolutePath(file.FullName),
                        relativePath,
                        file.Extension.ToLowerInvariant(),
                        file.Name);
                }
            }
        }
    }

    private static bool IsAtlasFile(FileCandidate candidate)
    {
        if (candidate.Extension is ".cs" or ".cshtml" or ".razor" or ".csproj" or ".sln" or ".slnx"
            or ".props" or ".targets" or ".ts" or ".tsx" or ".js" or ".jsx" or ".sql" or ".md")
        {
            return true;
        }

        return candidate.Name.Equals("global.json", StringComparison.OrdinalIgnoreCase)
            || candidate.Name.Equals("package.json", StringComparison.OrdinalIgnoreCase)
            || candidate.Name.Equals("package-lock.json", StringComparison.OrdinalIgnoreCase)
            || candidate.Name.Equals("pnpm-lock.yaml", StringComparison.OrdinalIgnoreCase)
            || candidate.Name.Equals("yarn.lock", StringComparison.OrdinalIgnoreCase)
            || candidate.Name.StartsWith("tsconfig", StringComparison.OrdinalIgnoreCase)
                && candidate.Extension == ".json";
    }

    private static string GetLanguage(FileCandidate candidate) => candidate.Extension switch
    {
        ".cs" => "csharp",
        ".cshtml" or ".razor" => "razor",
        ".ts" => "typescript",
        ".tsx" => "typescriptreact",
        ".js" => "javascript",
        ".jsx" => "javascriptreact",
        ".sql" => "sql",
        ".md" => "markdown",
        ".csproj" or ".props" or ".targets" or ".slnx" => "xml",
        ".json" => "json",
        ".yaml" => "yaml",
        _ => "text"
    };

    private static bool IsGenerated(string relativePath)
    {
        var fileName = Path.GetFileName(relativePath);
        return fileName.EndsWith(".g.cs", StringComparison.OrdinalIgnoreCase)
            || fileName.EndsWith(".generated.cs", StringComparison.OrdinalIgnoreCase)
            || fileName.EndsWith(".designer.cs", StringComparison.OrdinalIgnoreCase);
    }

    private static string StableKey(string workspaceKey, string kind, string root, string relativePath) =>
        $"{kind}:{HashText($"{workspaceKey}\n{NormalizeForIdentity(root)}\n{NormalizeRelativePath(relativePath)}")}";

    private static string HashText(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    private static string NormalizeAbsolutePath(string path) =>
        Path.TrimEndingDirectorySeparator(Path.GetFullPath(path));

    private static string NormalizeRelativePath(string path) => path.Replace('\\', '/');

    private static string NormalizeForIdentity(string path) =>
        OperatingSystem.IsWindows() ? path.Replace('\\', '/').ToUpperInvariant() : path.Replace('\\', '/');

    private static bool IsWithin(string path, string directory)
    {
        var relative = Path.GetRelativePath(directory, path);
        return relative != ".."
            && !relative.StartsWith($"..{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
            && !Path.IsPathRooted(relative);
    }

    private static StringComparer PathComparer => OperatingSystem.IsWindows()
        ? StringComparer.OrdinalIgnoreCase
        : StringComparer.Ordinal;

    private sealed record FileCandidate(
        string RootPath,
        string FullPath,
        string RelativePath,
        string Extension,
        string Name);

    private sealed record PendingProjectReference(
        string SourceProjectKey,
        string TargetFullPath,
        int Line);
}
