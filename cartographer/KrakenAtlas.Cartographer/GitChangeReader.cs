using System.Diagnostics;
using System.Text;
using KrakenAtlas.Core;

namespace KrakenAtlas.Cartographer;

internal static class GitChangeReader
{
    private static readonly StringComparer PathComparer = OperatingSystem.IsWindows()
        ? StringComparer.OrdinalIgnoreCase
        : StringComparer.Ordinal;

    public static async Task<IReadOnlyList<GitRepositoryDeltaBatch>> ReadAsync(
        IReadOnlyList<string> workspaceRoots,
        string mode,
        string? baseRef,
        string? targetRef,
        int maxFiles,
        CancellationToken cancellationToken)
    {
        if (mode is not ("working_tree" or "range"))
        {
            throw new ArgumentException("Git projection mode must be working_tree or range.");
        }
        if (mode == "range" && string.IsNullOrWhiteSpace(baseRef))
        {
            throw new ArgumentException("Git range projection requires baseRef.");
        }
        if (maxFiles is < 1 or > 1000)
        {
            throw new ArgumentOutOfRangeException(nameof(maxFiles),
                "Git projection maxFiles must be between 1 and 1000.");
        }

        var repositoryRoots = new HashSet<string>(PathComparer);
        foreach (var workspaceRoot in workspaceRoots)
        {
            var discovered = await TryRunGitAsync(
                workspaceRoot,
                ["rev-parse", "--show-toplevel"],
                cancellationToken);
            if (discovered is { ExitCode: 0 })
            {
                repositoryRoots.Add(Path.GetFullPath(discovered.Output.Trim()));
            }
        }

        var batches = new List<GitRepositoryDeltaBatch>();
        foreach (var repositoryRoot in repositoryRoots.OrderBy(path => path, PathComparer))
        {
            var head = (await RunGitAsync(repositoryRoot, ["rev-parse", "HEAD"], cancellationToken)).Output.Trim();
            var branchValue = (await RunGitAsync(
                repositoryRoot,
                ["branch", "--show-current"],
                cancellationToken)).Output.Trim();
            var dirty = !string.IsNullOrEmpty((await RunGitAsync(
                repositoryRoot,
                ["status", "--porcelain=v1", "--untracked-files=normal"],
                cancellationToken)).Output);

            IReadOnlyList<GitFileDelta> allDeltas;
            if (mode == "working_tree")
            {
                var status = await RunGitAsync(
                    repositoryRoot,
                    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
                    cancellationToken);
                allDeltas = ParseWorkingTree(repositoryRoot, status.Output);
            }
            else
            {
                var target = string.IsNullOrWhiteSpace(targetRef) ? "HEAD" : targetRef!;
                await VerifyRevisionAsync(repositoryRoot, baseRef!, cancellationToken);
                await VerifyRevisionAsync(repositoryRoot, target, cancellationToken);
                var diff = await RunGitAsync(
                    repositoryRoot,
                    ["diff", "--name-status", "-z", "--find-renames", $"{baseRef}...{target}"],
                    cancellationToken);
                allDeltas = ParseRange(repositoryRoot, diff.Output);
            }

            batches.Add(new GitRepositoryDeltaBatch(
                repositoryRoot,
                string.IsNullOrWhiteSpace(branchValue) ? null : branchValue,
                head,
                dirty,
                allDeltas.Count > maxFiles,
                allDeltas.Take(maxFiles).ToArray()));
        }
        return batches;
    }

    private static IReadOnlyList<GitFileDelta> ParseWorkingTree(string repositoryRoot, string output)
    {
        var fields = output.Split('\0', StringSplitOptions.RemoveEmptyEntries);
        var deltas = new List<GitFileDelta>();
        for (var index = 0; index < fields.Length; index++)
        {
            var field = fields[index];
            if (field.Length < 4)
            {
                continue;
            }
            var code = field[..2];
            var path = field[3..];
            string? oldPath = null;
            if ((code.Contains('R') || code.Contains('C')) && index + 1 < fields.Length)
            {
                oldPath = fields[++index];
            }
            deltas.Add(new GitFileDelta(repositoryRoot, NormalizeStatus(code), NormalizePath(path), NormalizeOptionalPath(oldPath)));
        }
        return deltas;
    }

    private static IReadOnlyList<GitFileDelta> ParseRange(string repositoryRoot, string output)
    {
        var fields = output.Split('\0', StringSplitOptions.RemoveEmptyEntries);
        var deltas = new List<GitFileDelta>();
        for (var index = 0; index < fields.Length;)
        {
            var code = fields[index++];
            if (index >= fields.Length)
            {
                break;
            }
            if (code.StartsWith('R') || code.StartsWith('C'))
            {
                if (index + 1 >= fields.Length)
                {
                    break;
                }
                var oldPath = fields[index++];
                var path = fields[index++];
                deltas.Add(new GitFileDelta(
                    repositoryRoot,
                    NormalizeStatus(code),
                    NormalizePath(path),
                    NormalizeOptionalPath(oldPath)));
            }
            else
            {
                deltas.Add(new GitFileDelta(
                    repositoryRoot,
                    NormalizeStatus(code),
                    NormalizePath(fields[index++]),
                    null));
            }
        }
        return deltas;
    }

    private static string NormalizeStatus(string code)
    {
        if (code == "??") return "untracked";
        if (code.Contains('U') || code is "AA" or "DD") return "conflicted";
        if (code.StartsWith('R') || code.Contains('R')) return "renamed";
        if (code.StartsWith('C') || code.Contains('C')) return "copied";
        if (code.Contains('D')) return "deleted";
        if (code.Contains('A')) return "added";
        if (code.Contains('T')) return "type_changed";
        return "modified";
    }

    private static string NormalizePath(string path) => path.Replace('\\', '/');

    private static string? NormalizeOptionalPath(string? path) => path is null ? null : NormalizePath(path);

    private static async Task VerifyRevisionAsync(
        string repositoryRoot,
        string revision,
        CancellationToken cancellationToken)
    {
        var result = await TryRunGitAsync(
            repositoryRoot,
            ["rev-parse", "--verify", $"{revision}^{{commit}}"],
            cancellationToken);
        if (result is not { ExitCode: 0 })
        {
            throw new InvalidOperationException($"Git revision could not be resolved: {revision}");
        }
    }

    private static async Task<GitProcessResult> RunGitAsync(
        string workingDirectory,
        IReadOnlyList<string> arguments,
        CancellationToken cancellationToken)
    {
        var result = await TryRunGitAsync(workingDirectory, arguments, cancellationToken);
        if (result is null || result.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"Git command failed in {workingDirectory}: {result?.Error.Trim() ?? "git was not found"}");
        }
        return result;
    }

    private static async Task<GitProcessResult?> TryRunGitAsync(
        string workingDirectory,
        IReadOnlyList<string> arguments,
        CancellationToken cancellationToken)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo("git")
            {
                WorkingDirectory = workingDirectory,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = new UTF8Encoding(false),
                StandardErrorEncoding = new UTF8Encoding(false),
                CreateNoWindow = true
            }
        };
        process.StartInfo.ArgumentList.Add("-c");
        process.StartInfo.ArgumentList.Add("core.quotepath=false");
        foreach (var argument in arguments)
        {
            process.StartInfo.ArgumentList.Add(argument);
        }
        try
        {
            if (!process.Start())
            {
                return null;
            }
        }
        catch (System.ComponentModel.Win32Exception)
        {
            return null;
        }

        var outputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var errorTask = process.StandardError.ReadToEndAsync(cancellationToken);
        try
        {
            await process.WaitForExitAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
            throw;
        }
        return new GitProcessResult(process.ExitCode, await outputTask, await errorTask);
    }

    private sealed record GitProcessResult(int ExitCode, string Output, string Error);
}

internal sealed record GitRepositoryDeltaBatch(
    string RepositoryRoot,
    string? Branch,
    string Head,
    bool Dirty,
    bool ChangesTruncated,
    IReadOnlyList<GitFileDelta> Deltas);
