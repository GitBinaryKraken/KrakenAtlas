import { strict as assert } from "node:assert";
import test from "node:test";
import {
  createDotnetRuntimeRequirementError,
  parseDotnetCoreRuntimeVersions
} from "../src/runtime/dotnetRuntime";

test("parses installed Microsoft.NETCore.App runtime versions", () => {
  const versions = parseDotnetCoreRuntimeVersions([
    "Microsoft.AspNetCore.App 10.0.4 [C:\\Program Files\\dotnet\\shared\\Microsoft.AspNetCore.App]",
    "Microsoft.NETCore.App 8.0.18 [C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App]",
    "Microsoft.NETCore.App 10.0.4 [C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App]",
    "Microsoft.NETCore.App 10.0.4 [duplicate]",
    ""
  ].join("\r\n"));

  assert.deepEqual(versions, ["8.0.18", "10.0.4"]);
});

test("runtime requirement errors explain how to install .NET 10", () => {
  const error = createDotnetRuntimeRequirementError({
    command: "dotnet --list-runtimes",
    requiredRuntime: "Microsoft.NETCore.App 10.x",
    available: false,
    installedCoreRuntimeVersions: ["8.0.18"]
  });

  assert.match(error.message, /requires Microsoft\.NETCore\.App 10\.x/);
  assert.match(error.message, /Detected Microsoft\.NETCore\.App 8\.0\.18/);
  assert.match(error.message, /https:\/\/dotnet\.microsoft\.com\/download\/dotnet\/10\.0/);
  assert.match(error.message, /reload VS Code/);
});
