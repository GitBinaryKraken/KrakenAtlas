# Getting Started

Kraken Atlas `0.3.1` is the first durable slice of the complete rewrite. It can
discover .NET solutions, projects, project references, and relevant files, then
store and query that structural map from a versioned SQLite Atlas.

## Requirements

- VS Code 1.90 or newer.
- Node.js and npm for extension development.
- .NET 10 runtime for the current development VSIX.
- .NET 10 SDK for building the Cartographer.

Self-contained, platform-specific VSIX packaging is scheduled for product
hardening; the current development package launches the installed `dotnet`
runtime.

## Build and Test

```powershell
npm install
npm test
```

## Package a VSIX

```powershell
npm run check:vsix
```

## Try the Extension

1. Open the repository in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Run `Kraken Atlas: Build Atlas`.
4. Run `Kraken Atlas: Show Atlas Summary` and inspect the discovered projects.
5. Run `Kraken Atlas: Lookup Entity` with a project stable key or numeric ID.
6. Run `Kraken Atlas: Open Architecture Plan` to inspect the implementation
   roadmap.

The Atlas database is stored under the VS Code workspace storage directory and
is not written into the source repository.
