# Privacy and Local Data

## Summary

The Kraken Atlas preview processes codebase structure, C# declarations, and
compiler-resolved C# relationships locally. Kraken Atlas does not include
telemetry, analytics, crash reporting, account services, or a Kraken Atlas
network backend.

The extension launches a local Cartographer child process and stores its Atlas in
a local SQLite database owned by VS Code workspace storage.

## Current Data Collected Locally

The local Atlas may contain:

- Absolute workspace root and Atlas storage paths.
- Relative solution, project, and relevant file paths.
- Solution and project names, project kinds, languages, target frameworks, and
  project-reference relationships.
- Package-project names, package-manager and framework markers, package-script
  command names, and derived .NET build/test/run/package/migration commands.
- Structured build and EditorConfig values plus references to governing
  repository instruction files, with scope and precedence.
- Deterministic stable identifiers and file content hashes.
- Brotli-compressed per-project semantic cache entries containing the same
  declaration and relation metadata already represented in canonical Atlas
  tables; cache entries do not contain source file bodies.
- C# namespace, type, and member names; qualified names; signatures; visibility;
  containing-symbol relationships; exact definition spans; and generated/manual
  source status.
- Compiler-resolved internal calls, construction, member reads and writes, type
  use, inheritance, implementations, and overrides, including dispatch kind and
  exact source evidence spans.
- Atlas generations, analyzer names, status, timings, and diagnostics.
- User- or agent-submitted analysis-session metadata, typed assessment updates,
  concise claim statements, confidence, status, tags, exact evidence references,
  captured dependency fingerprints, and assessment history.
- SQLite operational metadata required for persistence and migrations.

The SQLite Atlas does not store source file bodies. By default, map queries
return source locations, declaration metadata, relation metadata, and
agent-provided structured conclusions. A caller may explicitly request bounded
source excerpts in a prepared-change Context Pack. Excerpts are read on demand,
returned to that local CLI, JSON-RPC, or MCP client, counted inside the requested
token budget, and are not written back to SQLite.

Source excerpt reads are restricted to indexed files under the active workspace
roots and to recognized code extensions: C#, Razor, JavaScript, TypeScript, and
SQL. Generated, oversized, binary, and non-code files are excluded. The default
limit is 24 lines per selected item and the accepted range is 8 through 120.
Agents and users should still inspect excerpts before passing them to any model
or service whose data policy they do not control.

Decoration payloads must not contain raw prompts, private reasoning,
chain-of-thought, transcripts, secrets, or source bodies.

## Network and Telemetry

Kraken Atlas does not transmit Atlas data, source data, paths, diagnostics, or
usage events. It does not contact a Kraken Atlas service because none exists.
Git change projection invokes only local `git` status, revision, branch, and
diff commands. It does not fetch, pull, push, or otherwise contact a remote.
The bundled MCP server is a local stdio child process. The AI client invoking an
MCP tool may transmit returned results according to that client's own provider
and privacy settings; that transmission is outside Kraken Atlas.

VS Code, installed extensions, the .NET runtime, package managers, operating
system services, and repositories may have their own network or telemetry
behavior outside Kraken Atlas. Their policies apply independently.

## Diagnostic Export

`Kraken Atlas: Export Diagnostics` creates a JSON file only after the user chooses
a destination. It includes:

- VS Code, extension, Cartographer, protocol, operating system, and .NET runtime
  versions.
- Workspace root and Atlas paths.
- Cartographer capabilities and status.
- Atlas generation, aggregate counts, analyzer timings, and diagnostics.
- Startup or runtime errors when available.

It excludes source bodies, entity inventories, and project lists. Local paths and
analyzer error text may still be sensitive. Review the file before sharing it.

## Static Analysis Safety

Default indexing does not execute application code, run migrations, instantiate
EF Core contexts, invoke project design-time factories, or connect to live
databases. It evaluates C# projects through Roslyn `MSBuildWorkspace` but does not
request package restore. Kraken Atlas invokes the installed `dotnet` host to run
its own Cartographer assembly.

## Storage and Deletion

The Atlas path is reported by the diagnostic export. VS Code may retain workspace
storage across reloads, extension upgrades, or uninstall. To remove the Atlas,
close VS Code and delete the reported SQLite file or its containing Kraken Atlas
storage directory.

## License Status

The preview is currently marked `UNLICENSED`; all rights are reserved. Invited
evaluation does not grant redistribution or open-source rights. A formal license
and any required legal notices must be chosen before broad public distribution.
