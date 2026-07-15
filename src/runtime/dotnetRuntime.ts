import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const requiredDotnetRuntimeMajor = 10;
export const dotnetDownloadUrl = "https://dotnet.microsoft.com/download/dotnet/10.0";

export interface DotnetRuntimeInspection {
  command: "dotnet --list-runtimes";
  requiredRuntime: string;
  available: boolean;
  installedCoreRuntimeVersions: string[];
  diagnostic?: string;
}

export function parseDotnetCoreRuntimeVersions(output: string): string[] {
  const versions = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^Microsoft\.NETCore\.App\s+(\d+(?:\.\d+){1,3}(?:[-+][^\s]+)?)/.exec(line.trim());
    if (match) {
      versions.add(match[1]);
    }
  }
  return [...versions].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

export async function inspectDotnetRuntime(): Promise<DotnetRuntimeInspection> {
  try {
    const { stdout } = await execFileAsync("dotnet", ["--list-runtimes"], {
      encoding: "utf8",
      windowsHide: true
    });
    const installedCoreRuntimeVersions = parseDotnetCoreRuntimeVersions(stdout);
    return {
      command: "dotnet --list-runtimes",
      requiredRuntime: requiredRuntimeLabel(),
      available: installedCoreRuntimeVersions.some(
        (version) => Number.parseInt(version.split(".")[0], 10) === requiredDotnetRuntimeMajor
      ),
      installedCoreRuntimeVersions
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      command: "dotnet --list-runtimes",
      requiredRuntime: requiredRuntimeLabel(),
      available: false,
      installedCoreRuntimeVersions: [],
      diagnostic: code === "ENOENT"
        ? "The dotnet executable was not found on PATH."
        : `Runtime inspection failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export function createDotnetRuntimeRequirementError(inspection: DotnetRuntimeInspection): Error {
  const detected = inspection.installedCoreRuntimeVersions.length > 0
    ? `Detected Microsoft.NETCore.App ${inspection.installedCoreRuntimeVersions.join(", ")}.`
    : inspection.diagnostic ?? "No Microsoft.NETCore.App runtimes were detected.";
  return new Error(
    `Kraken Atlas requires ${inspection.requiredRuntime}. ${detected} `
    + `Install the runtime from ${dotnetDownloadUrl} and reload VS Code.`
  );
}

function requiredRuntimeLabel(): string {
  return `Microsoft.NETCore.App ${requiredDotnetRuntimeMajor}.x`;
}
