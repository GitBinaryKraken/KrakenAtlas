using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Xml;
using System.Xml.Linq;
using KrakenAtlas.Core;

namespace KrakenAtlas.Workspace;

internal sealed record WorkspaceOrientationSnapshot(
    IReadOnlyList<DiscoveredProjectFacet> ProjectFacets,
    IReadOnlyList<DiscoveredBuildDimension> BuildDimensions,
    IReadOnlyList<DiscoveredWorkspaceCommand> Commands,
    IReadOnlyList<DiscoveredRepositoryRule> RepositoryRules);

internal static class WorkspaceOrientationDiscovery
{
    public static WorkspaceOrientationSnapshot Discover(
        string workspaceKey,
        IReadOnlyList<DiscoveredSolution> solutions,
        IReadOnlyList<DiscoveredProject> projects,
        IReadOnlyList<DiscoveredFile> files)
    {
        var facets = new List<DiscoveredProjectFacet>();
        var dimensions = new List<DiscoveredBuildDimension>();
        var commands = new List<DiscoveredWorkspaceCommand>();
        var rules = new List<DiscoveredRepositoryRule>();

        foreach (var project in projects)
        {
            if (project.RelativePath.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase))
            {
                DiscoverDotnetProject(workspaceKey, project, files, facets, dimensions, commands);
            }
            else if (Path.GetFileName(project.RelativePath).Equals("package.json", StringComparison.OrdinalIgnoreCase))
            {
                DiscoverPackageProject(workspaceKey, project, facets, dimensions, commands);
            }
        }

        foreach (var solution in solutions)
        {
            var path = Quote(solution.RelativePath);
            AddCommand(
                workspaceKey,
                commands,
                solution.StableKey,
                "build",
                $"Build {solution.Name}",
                $"dotnet build {path}",
                solution.RootPath,
                solution.RootPath,
                solution.RelativePath,
                1,
                "derived_from_solution");
            AddCommand(
                workspaceKey,
                commands,
                solution.StableKey,
                "test",
                $"Test {solution.Name}",
                $"dotnet test {path}",
                solution.RootPath,
                solution.RootPath,
                solution.RelativePath,
                1,
                "derived_from_solution");
            AddCommand(
                workspaceKey,
                commands,
                solution.StableKey,
                "format",
                $"Format {solution.Name}",
                $"dotnet format {path}",
                solution.RootPath,
                solution.RootPath,
                solution.RelativePath,
                1,
                "derived_from_solution");
        }

        DiscoverWorkspaceConfiguration(workspaceKey, files, dimensions, rules);
        DiscoverRepositoryRules(workspaceKey, files, rules);

        return new WorkspaceOrientationSnapshot(
            facets
                .GroupBy(facet => (facet.ProjectKey, facet.Facet))
                .Select(group => group.OrderBy(facet => facet.Line).First())
                .OrderBy(facet => facet.ProjectKey, StringComparer.Ordinal)
                .ThenBy(facet => facet.Facet, StringComparer.Ordinal)
                .ToArray(),
            dimensions
                .GroupBy(dimension => (dimension.ProjectKey, dimension.Kind, dimension.Value, dimension.Condition))
                .Select(group => group.OrderBy(dimension => dimension.Line).First())
                .OrderBy(dimension => dimension.ProjectKey, StringComparer.Ordinal)
                .ThenBy(dimension => dimension.Kind, StringComparer.Ordinal)
                .ThenBy(dimension => dimension.Value, StringComparer.Ordinal)
                .ToArray(),
            commands
                .GroupBy(command => (command.TargetKey, command.Kind, command.CommandText))
                .Select(group => group.First())
                .OrderBy(command => command.Kind, StringComparer.Ordinal)
                .ThenBy(command => command.CommandText, StringComparer.Ordinal)
                .ToArray(),
            rules
                .GroupBy(rule => (rule.SourceRootPath, rule.SourceRelativePath, rule.Line, rule.Name))
                .Select(group => group.First())
                .OrderByDescending(rule => rule.Precedence)
                .ThenBy(rule => rule.SourceRelativePath, StringComparer.Ordinal)
                .ThenBy(rule => rule.Line)
                .ToArray());
    }

    private static void DiscoverDotnetProject(
        string workspaceKey,
        DiscoveredProject project,
        IReadOnlyList<DiscoveredFile> files,
        List<DiscoveredProjectFacet> facets,
        List<DiscoveredBuildDimension> dimensions,
        List<DiscoveredWorkspaceCommand> commands)
    {
        var fullPath = Path.Combine(project.RootPath, project.RelativePath);
        var document = XDocument.Load(fullPath, LoadOptions.SetLineInfo);
        var root = document.Root ?? throw new InvalidDataException($"Project has no root element: {fullPath}");
        var sdk = root.Attribute("Sdk")?.Value ?? ElementValue(root, "Sdk") ?? project.Sdk;
        var properties = root.Descendants()
            .Where(element => element.Parent?.Name.LocalName == "PropertyGroup")
            .ToArray();
        var packageNames = root.Descendants()
            .Where(element => element.Name.LocalName is "PackageReference" or "FrameworkReference")
            .Select(element => element.Attribute("Include")?.Value)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Cast<string>()
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var projectLine = 1;
        switch (project.ProjectKind)
        {
            case "web":
                AddFacet(workspaceKey, facets, project, "application", projectLine, "msbuild");
                AddFacet(workspaceKey, facets, project, "aspnet_core_host", projectLine, "msbuild");
                break;
            case "worker":
                AddFacet(workspaceKey, facets, project, "application", projectLine, "msbuild");
                AddFacet(workspaceKey, facets, project, "worker", projectLine, "msbuild");
                break;
            default:
                AddFacet(workspaceKey, facets, project, project.ProjectKind, projectLine, "msbuild");
                break;
        }

        if (sdk?.Contains("Web", StringComparison.OrdinalIgnoreCase) == true
            || packageNames.Contains("Microsoft.AspNetCore.App"))
        {
            AddFacet(workspaceKey, facets, project, "application", projectLine, "msbuild");
            AddFacet(workspaceKey, facets, project, "aspnet_core_host", projectLine, "msbuild");
        }
        if (sdk?.Contains("Worker", StringComparison.OrdinalIgnoreCase) == true)
        {
            AddFacet(workspaceKey, facets, project, "application", projectLine, "msbuild");
            AddFacet(workspaceKey, facets, project, "worker", projectLine, "msbuild");
        }
        if (packageNames.Contains("Microsoft.NET.Test.Sdk")
            || string.Equals(ElementValue(root, "IsTestProject"), "true", StringComparison.OrdinalIgnoreCase))
        {
            AddFacet(workspaceKey, facets, project, "test", LineOf(root.Descendants().FirstOrDefault(
                element => element.Name.LocalName == "IsTestProject")), "msbuild");
        }

        var hasEfCore = packageNames.Any(name => name.StartsWith("Microsoft.EntityFrameworkCore", StringComparison.OrdinalIgnoreCase));
        if (hasEfCore)
        {
            AddFacet(workspaceKey, facets, project, "database", projectLine, "package_reference");
            var projectDirectory = Path.GetDirectoryName(fullPath)!;
            var hasMigrations = files.Any(file => file.ProjectKey == project.StableKey
                && IsWithin(Path.Combine(file.RootPath, file.RelativePath), Path.Combine(projectDirectory, "Migrations")));
            if (hasMigrations || packageNames.Contains("Microsoft.EntityFrameworkCore.Tools"))
            {
                AddFacet(workspaceKey, facets, project, "migration", projectLine, "package_reference");
            }
        }
        if (string.Equals(ElementValue(root, "PackAsTool"), "true", StringComparison.OrdinalIgnoreCase))
        {
            AddFacet(workspaceKey, facets, project, "tool", projectLine, "msbuild");
        }
        if (string.Equals(ElementValue(root, "IsRoslynComponent"), "true", StringComparison.OrdinalIgnoreCase))
        {
            AddFacet(workspaceKey, facets, project, "generator", projectLine, "msbuild");
        }

        if (!string.IsNullOrWhiteSpace(sdk))
        {
            AddDimension(workspaceKey, dimensions, project, "sdk", sdk!, projectLine, "msbuild", null);
        }
        AddPropertyDimensions(workspaceKey, project, properties, dimensions, "TargetFramework", "target_framework");
        AddPropertyDimensions(workspaceKey, project, properties, dimensions, "TargetFrameworks", "target_framework");
        AddPropertyDimensions(workspaceKey, project, properties, dimensions, "RuntimeIdentifier", "runtime_identifier");
        AddPropertyDimensions(workspaceKey, project, properties, dimensions, "RuntimeIdentifiers", "runtime_identifier");
        AddPropertyDimensions(workspaceKey, project, properties, dimensions, "Configurations", "build_configuration");
        AddPropertyDimensions(workspaceKey, project, properties, dimensions, "Platforms", "platform");
        AddPropertyDimensions(workspaceKey, project, properties, dimensions, "DefineConstants", "compilation_constant");
        AddPropertyDimensions(workspaceKey, project, properties, dimensions, "LangVersion", "compiler_option", "LangVersion=");
        AddPropertyDimensions(workspaceKey, project, properties, dimensions, "Nullable", "compiler_option", "Nullable=");

        if (!dimensions.Any(dimension => dimension.ProjectKey == project.StableKey
            && dimension.Kind == "build_configuration"))
        {
            AddDimension(workspaceKey, dimensions, project, "build_configuration", "Debug", 1, "sdk_default", null);
            AddDimension(workspaceKey, dimensions, project, "build_configuration", "Release", 1, "sdk_default", null);
        }
        if (!dimensions.Any(dimension => dimension.ProjectKey == project.StableKey
            && dimension.Kind == "platform"))
        {
            AddDimension(workspaceKey, dimensions, project, "platform", "AnyCPU", 1, "sdk_default", null);
        }

        var quotedProject = Quote(project.RelativePath);
        var workingDirectory = project.RootPath;
        AddCommand(workspaceKey, commands, project.StableKey, "build", $"Build {project.Name}",
            $"dotnet build {quotedProject}", workingDirectory, project.RootPath, project.RelativePath, 1, "derived_from_msbuild");

        var projectFacets = facets.Where(facet => facet.ProjectKey == project.StableKey)
            .Select(facet => facet.Facet)
            .ToHashSet(StringComparer.Ordinal);
        if (projectFacets.Contains("test"))
        {
            AddCommand(workspaceKey, commands, project.StableKey, "test", $"Test {project.Name}",
                $"dotnet test {quotedProject}", workingDirectory, project.RootPath, project.RelativePath, 1, "derived_from_msbuild");
        }
        if (projectFacets.Overlaps(["application", "aspnet_core_host", "worker", "tool"]))
        {
            AddCommand(workspaceKey, commands, project.StableKey, "run", $"Run {project.Name}",
                $"dotnet run --project {quotedProject}", workingDirectory, project.RootPath, project.RelativePath, 1, "derived_from_msbuild");
        }
        if (projectFacets.Contains("library")
            && !string.Equals(ElementValue(root, "IsPackable"), "false", StringComparison.OrdinalIgnoreCase))
        {
            AddCommand(workspaceKey, commands, project.StableKey, "package", $"Package {project.Name}",
                $"dotnet pack {quotedProject}", workingDirectory, project.RootPath, project.RelativePath, 1, "derived_from_msbuild");
        }
        if (projectFacets.Contains("migration"))
        {
            AddCommand(workspaceKey, commands, project.StableKey, "migrate", $"Apply migrations for {project.Name}",
                $"dotnet ef database update --project {quotedProject}", workingDirectory,
                project.RootPath, project.RelativePath, 1, "derived_from_ef_package");
        }
    }

    private static void DiscoverPackageProject(
        string workspaceKey,
        DiscoveredProject project,
        List<DiscoveredProjectFacet> facets,
        List<DiscoveredBuildDimension> dimensions,
        List<DiscoveredWorkspaceCommand> commands)
    {
        var fullPath = Path.Combine(project.RootPath, project.RelativePath);
        var text = File.ReadAllText(fullPath);
        using var document = JsonDocument.Parse(text);
        var root = document.RootElement;
        AddFacet(workspaceKey, facets, project, project.ProjectKind, 1, "package_json");
        if (project.ProjectKind == "frontend")
        {
            AddFacet(workspaceKey, facets, project, "application", 1, "package_json");
        }
        AddDimension(workspaceKey, dimensions, project, "package_manager", project.Sdk ?? "npm", 1, "lockfile", null);
        AddDimension(workspaceKey, dimensions, project, "language", project.Language, 1, "package_json", null);

        var packageNames = PackageNames(root).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var framework in new[] { "react", "next", "vue", "svelte", "angular" })
        {
            if (packageNames.Contains(framework))
            {
                AddDimension(workspaceKey, dimensions, project, "framework", framework, FindJsonLine(text, framework),
                    "package_json", null);
            }
        }

        if (!root.TryGetProperty("scripts", out var scripts) || scripts.ValueKind != JsonValueKind.Object)
        {
            return;
        }
        var workingDirectory = Path.GetDirectoryName(fullPath)!;
        foreach (var script in scripts.EnumerateObject())
        {
            var kind = ClassifyPackageScript(script.Name);
            AddCommand(
                workspaceKey,
                commands,
                project.StableKey,
                kind,
                $"{project.Name}: {script.Name}",
                $"{project.Sdk ?? "npm"} run {script.Name}",
                workingDirectory,
                project.RootPath,
                project.RelativePath,
                FindJsonLine(text, script.Name),
                "package_script");
        }
    }

    private static void DiscoverWorkspaceConfiguration(
        string workspaceKey,
        IReadOnlyList<DiscoveredFile> files,
        List<DiscoveredBuildDimension> dimensions,
        List<DiscoveredRepositoryRule> rules)
    {
        foreach (var file in files.Where(file => Path.GetFileName(file.RelativePath).Equals(
                     "global.json",
                     StringComparison.OrdinalIgnoreCase)))
        {
            var text = File.ReadAllText(Path.Combine(file.RootPath, file.RelativePath));
            using var document = JsonDocument.Parse(text);
            if (!document.RootElement.TryGetProperty("sdk", out var sdk) || sdk.ValueKind != JsonValueKind.Object)
            {
                continue;
            }
            foreach (var property in sdk.EnumerateObject())
            {
                var value = property.Value.ToString();
                var line = FindJsonLine(text, property.Name);
                dimensions.Add(new DiscoveredBuildDimension(
                    FactKey(workspaceKey, "build_dimension", "workspace", $"dotnet_sdk_{property.Name}", value),
                    null,
                    $"dotnet_sdk_{ToSnakeCase(property.Name)}",
                    value,
                    file.RootPath,
                    file.RelativePath,
                    line,
                    "global_json",
                    null));
                rules.Add(new DiscoveredRepositoryRule(
                    FactKey(workspaceKey, "repository_rule", file.RelativePath, property.Name, value),
                    "dotnet_sdk",
                    property.Name,
                    value,
                    $".NET SDK {property.Name} is {value}.",
                    RelativeDirectory(file.RelativePath),
                    "structured_configuration",
                    Precedence(file.RelativePath, 70),
                    file.RootPath,
                    file.RelativePath,
                    line,
                    "global_json"));
            }
        }
    }

    private static void DiscoverRepositoryRules(
        string workspaceKey,
        IReadOnlyList<DiscoveredFile> files,
        List<DiscoveredRepositoryRule> rules)
    {
        foreach (var file in files)
        {
            var name = Path.GetFileName(file.RelativePath);
            if (name.Equals(".editorconfig", StringComparison.OrdinalIgnoreCase))
            {
                DiscoverEditorConfig(workspaceKey, file, rules);
            }
            else if (name.Equals("Directory.Build.props", StringComparison.OrdinalIgnoreCase)
                || name.Equals("Directory.Build.targets", StringComparison.OrdinalIgnoreCase))
            {
                DiscoverDirectoryBuildRules(workspaceKey, file, rules);
            }
            else if (IsInstructionFile(file.RelativePath))
            {
                var category = name.Equals("CONTRIBUTING.md", StringComparison.OrdinalIgnoreCase)
                    ? "contribution_guide"
                    : "agent_instructions";
                rules.Add(new DiscoveredRepositoryRule(
                    FactKey(workspaceKey, "repository_rule", file.RelativePath, category),
                    category,
                    name,
                    null,
                    $"Governing instructions are defined in {file.RelativePath}.",
                    RelativeDirectory(file.RelativePath),
                    "repository_documentation",
                    Precedence(file.RelativePath, category == "agent_instructions" ? 90 : 50),
                    file.RootPath,
                    file.RelativePath,
                    1,
                    "documentation_reference"));
            }
        }
    }

    private static void DiscoverEditorConfig(
        string workspaceKey,
        DiscoveredFile file,
        List<DiscoveredRepositoryRule> rules)
    {
        var scope = "*";
        var lines = File.ReadAllLines(Path.Combine(file.RootPath, file.RelativePath));
        for (var index = 0; index < lines.Length; index++)
        {
            var line = lines[index].Trim();
            if (line.StartsWith('[') && line.EndsWith(']'))
            {
                scope = line[1..^1].Trim();
                continue;
            }
            if (line.Length == 0 || line.StartsWith('#') || line.StartsWith(';'))
            {
                continue;
            }
            var separator = line.IndexOf('=');
            if (separator <= 0)
            {
                continue;
            }
            var key = line[..separator].Trim();
            var value = line[(separator + 1)..].Trim();
            rules.Add(new DiscoveredRepositoryRule(
                FactKey(workspaceKey, "repository_rule", file.RelativePath, scope, key, value),
                "editorconfig",
                key,
                value,
                $"{key} = {value}",
                $"{RelativeDirectory(file.RelativePath)}:{scope}",
                "structured_configuration",
                Precedence(file.RelativePath, 80),
                file.RootPath,
                file.RelativePath,
                index + 1,
                "editorconfig"));
        }
    }

    private static void DiscoverDirectoryBuildRules(
        string workspaceKey,
        DiscoveredFile file,
        List<DiscoveredRepositoryRule> rules)
    {
        var document = XDocument.Load(
            Path.Combine(file.RootPath, file.RelativePath),
            LoadOptions.SetLineInfo);
        foreach (var property in document.Descendants().Where(element => element.Parent?.Name.LocalName == "PropertyGroup"))
        {
            var value = property.Value.Trim();
            if (value.Length == 0)
            {
                continue;
            }
            var condition = property.Attribute("Condition")?.Value ?? property.Parent?.Attribute("Condition")?.Value;
            var summary = condition is null
                ? $"{property.Name.LocalName} = {value}"
                : $"{property.Name.LocalName} = {value} when {condition}";
            rules.Add(new DiscoveredRepositoryRule(
                FactKey(workspaceKey, "repository_rule", file.RelativePath, property.Name.LocalName, value, condition ?? ""),
                "msbuild_convention",
                property.Name.LocalName,
                value,
                summary,
                RelativeDirectory(file.RelativePath),
                "structured_configuration",
                Precedence(file.RelativePath, 85),
                file.RootPath,
                file.RelativePath,
                LineOf(property),
                "msbuild"));
        }
    }

    private static void AddPropertyDimensions(
        string workspaceKey,
        DiscoveredProject project,
        IEnumerable<XElement> properties,
        List<DiscoveredBuildDimension> dimensions,
        string propertyName,
        string kind,
        string prefix = "")
    {
        foreach (var property in properties.Where(element => element.Name.LocalName == propertyName))
        {
            var condition = property.Attribute("Condition")?.Value ?? property.Parent?.Attribute("Condition")?.Value;
            foreach (var value in property.Value.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                AddDimension(workspaceKey, dimensions, project, kind, $"{prefix}{value}", LineOf(property), "msbuild", condition);
            }
        }
    }

    private static void AddFacet(
        string workspaceKey,
        List<DiscoveredProjectFacet> facets,
        DiscoveredProject project,
        string facet,
        int line,
        string provenance,
        string? condition = null) => facets.Add(new DiscoveredProjectFacet(
            FactKey(workspaceKey, "project_facet", project.StableKey, facet),
            project.StableKey,
            facet,
            project.RootPath,
            project.RelativePath,
            line,
            provenance,
            condition));

    private static void AddDimension(
        string workspaceKey,
        List<DiscoveredBuildDimension> dimensions,
        DiscoveredProject project,
        string kind,
        string value,
        int line,
        string provenance,
        string? condition) => dimensions.Add(new DiscoveredBuildDimension(
            FactKey(workspaceKey, "build_dimension", project.StableKey, kind, value, condition ?? ""),
            project.StableKey,
            kind,
            value,
            project.RootPath,
            project.RelativePath,
            line,
            provenance,
            condition));

    private static void AddCommand(
        string workspaceKey,
        List<DiscoveredWorkspaceCommand> commands,
        string targetKey,
        string kind,
        string name,
        string commandText,
        string workingDirectory,
        string sourceRootPath,
        string sourceRelativePath,
        int line,
        string provenance,
        string? condition = null) => commands.Add(new DiscoveredWorkspaceCommand(
            FactKey(workspaceKey, "workspace_command", targetKey, kind, commandText),
            targetKey,
            kind,
            name,
            commandText,
            workingDirectory,
            sourceRootPath,
            sourceRelativePath,
            line,
            provenance,
            condition));

    private static IEnumerable<string> PackageNames(JsonElement root)
    {
        foreach (var propertyName in new[] { "dependencies", "devDependencies", "peerDependencies" })
        {
            if (!root.TryGetProperty(propertyName, out var dependencies)
                || dependencies.ValueKind != JsonValueKind.Object)
            {
                continue;
            }
            foreach (var property in dependencies.EnumerateObject())
            {
                yield return property.Name;
            }
        }
    }

    private static string ClassifyPackageScript(string name)
    {
        var normalized = name.ToLowerInvariant();
        if (normalized.Contains("build")) return "build";
        if (normalized.Contains("test")) return "test";
        if (normalized.Contains("format") || normalized.Contains("lint")) return "format";
        if (normalized.Contains("generate") || normalized.Contains("codegen")) return "generate";
        if (normalized.Contains("package") || normalized == "pack") return "package";
        if (normalized.Contains("migrate")) return "migrate";
        return "run";
    }

    private static bool IsInstructionFile(string relativePath)
    {
        var name = Path.GetFileName(relativePath);
        return name.Equals("AGENTS.md", StringComparison.OrdinalIgnoreCase)
            || name.Equals("CLAUDE.md", StringComparison.OrdinalIgnoreCase)
            || name.Equals("copilot-instructions.md", StringComparison.OrdinalIgnoreCase)
            || name.Equals("CONTRIBUTING.md", StringComparison.OrdinalIgnoreCase);
    }

    private static string? ElementValue(XElement root, string localName) => root
        .Descendants()
        .FirstOrDefault(element => element.Name.LocalName == localName && !string.IsNullOrWhiteSpace(element.Value))
        ?.Value.Trim();

    private static int LineOf(XElement? element) => element is IXmlLineInfo lineInfo && lineInfo.HasLineInfo()
        ? lineInfo.LineNumber
        : 1;

    private static int FindJsonLine(string text, string propertyName)
    {
        var lines = text.Split('\n');
        for (var index = 0; index < lines.Length; index++)
        {
            if (lines[index].Contains($"\"{propertyName}\"", StringComparison.Ordinal))
            {
                return index + 1;
            }
        }
        return 1;
    }

    private static int Precedence(string relativePath, int authority) =>
        authority + RelativeDirectory(relativePath).Count(character => character == '/') * 10;

    private static string RelativeDirectory(string relativePath)
    {
        var directory = Path.GetDirectoryName(relativePath)?.Replace('\\', '/');
        return string.IsNullOrEmpty(directory) ? "." : directory;
    }

    private static string Quote(string value) => $"\"{value.Replace("\"", "\\\"")}\"";

    private static string ToSnakeCase(string value)
    {
        var builder = new StringBuilder();
        foreach (var character in value)
        {
            if (char.IsUpper(character) && builder.Length > 0)
            {
                builder.Append('_');
            }
            builder.Append(char.ToLowerInvariant(character));
        }
        return builder.ToString();
    }

    private static bool IsWithin(string path, string directory)
    {
        var relative = Path.GetRelativePath(directory, path);
        return relative != ".."
            && !relative.StartsWith($"..{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
            && !Path.IsPathRooted(relative);
    }

    private static string FactKey(string workspaceKey, string kind, params string[] parts)
    {
        var identity = string.Join("\n", new[] { workspaceKey }.Concat(parts));
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity))).ToLowerInvariant();
        return $"{kind}:{hash}";
    }
}
