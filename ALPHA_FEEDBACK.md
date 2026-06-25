# Alpha Feedback Guide

Kraken Atlas alpha feedback is most useful when it can be turned into a regression test.

## What To Report

Please report cases where Kraken Atlas:

- recommends the wrong files for `where-to-add`
- misses an important relationship, route, service call, form post, validator, config key, or project reference
- returns noisy `Next Commands`
- makes `--format agent` output too large for an AI-agent turn
- fails to build, update, install CLI setup, or report map health clearly
- behaves differently between an exact `--context` and a partial `--context`
- reports an orphan candidate that is called dynamically, by a framework, or through an analyzer-missed local call
- misses or noisily groups duplicate code through `query duplicates`
- cannot trace a JavaScript controller call, injected browser API, custom event emission, or event subscription

## Quick Feedback Commands

Run these from the target workspace after `Kraken Atlas: Install AI Agent Setup` and opening a new terminal:

```powershell
kraken-atlas doctor --workspace . --format agent
kraken-atlas query project --workspace . --format agent
kraken-atlas query where-to-add "the change you wanted" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query flow "feature or behavior" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query relationships "FileOrSymbolName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query search "fallback search terms" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query orphans "optional filter" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query duplicates "optional filter" --workspace . --context ProjectOrFolderName --format agent
```

If the workspace has multiple projects, include the context that worked or failed:

```powershell
kraken-atlas query where-to-add "the change you wanted" --workspace . --context WebUI --format agent
kraken-atlas query where-to-add "the change you wanted" --workspace . --context FullProjectName --format agent
```

## What To Include

Include:

- Kraken Atlas version
- VS Code version
- OS
- project shape, such as `ASP.NET Core MVC`, `Razor Pages`, `class library`, `multi-project solution`
- command or Command Palette action used
- exact query text
- `--context` value, if any
- output from `doctor --format agent`
- the returned `Open These Files`, `Evidence`, and `Next Commands`
- what files or relationships you expected instead
- for JavaScript flow misses, the expected call/event chain in order
- for code-health findings, why the candidate is intentional, reachable, missing, or incorrectly grouped

Avoid sharing secrets, proprietary source code, credentials, or generated `.kraken-atlas/index.sqlite` files. Short file paths, symbol names, and trimmed command output are usually enough.

## What Good Feedback Looks Like

```text
Query:
kraken-atlas query where-to-add "add validation for profile setup" --workspace . --context WebUI --format agent

Problem:
It recommended Program.cs first, but the existing validation lives in Controllers/FormsController.cs and Models/ProfileBioFormModel.cs.

Expected:
FormsController and Profile*FormModel files should appear before Program.cs.

Doctor:
Kraken Atlas status: ready...
```

That kind of report can become a focused ranking test.
