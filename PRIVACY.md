# Privacy and Local Data

## Summary

The Kraken Atlas foundation preview processes codebase structure locally. Kraken
Atlas does not include telemetry, analytics, crash reporting, account services,
or a Kraken Atlas network backend.

The extension launches a local Cartographer child process and stores its Atlas in
a local SQLite database owned by VS Code workspace storage.

## Current Data Collected Locally

The Phase 1 structural Atlas may contain:

- Absolute workspace root and Atlas storage paths.
- Relative solution, project, and relevant file paths.
- Solution and project names, project kinds, languages, target frameworks, and
  project-reference relationships.
- Deterministic stable identifiers and file content hashes.
- Atlas generations, analyzer names, status, timings, and diagnostics.
- SQLite operational metadata required for persistence and migrations.

The current structural Atlas does not store source file bodies. Later semantic
phases may require bounded source locations or slices; those phases must update
this document before external testing.

## Network and Telemetry

Kraken Atlas does not transmit Atlas data, source data, paths, diagnostics, or
usage events. It does not contact a Kraken Atlas service because none exists.

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
databases. Kraken Atlas does invoke the installed `dotnet` host to run its own
Cartographer assembly.

## Storage and Deletion

The Atlas path is reported by the diagnostic export. VS Code may retain workspace
storage across reloads, extension upgrades, or uninstall. To remove the Atlas,
close VS Code and delete the reported SQLite file or its containing Kraken Atlas
storage directory.

## License Status

The preview is currently marked `UNLICENSED`; all rights are reserved. Invited
evaluation does not grant redistribution or open-source rights. A formal license
and any required legal notices must be chosen before broad public distribution.
