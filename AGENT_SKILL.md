# Kraken Atlas Agent Skill

Use Kraken Atlas to reduce context before editing. The goal is to find the smallest reliable source slice for the task.

## Query Loop

1. Run `kraken-atlas doctor --workspace . --format agent`.
2. Choose `--context ProjectOrFolderName` in parent workspaces.
3. Use `where-to-add` for planned changes.
4. Use `flow` for existing behavior.
5. Use `relationships` for a known file or symbol.
6. Use `search` only as fallback discovery.
7. Use `context` only after narrowing the target.
8. Stop when `Open These Files` and `Evidence` answer the immediate task.

## Token-Saving Rules

- Do not start with broad folder reads or recursive source scans when `.kraken-atlas` exists.
- Treat `Open These Files` as the maximum initial read list.
- Follow `Next Commands` one hop at a time.
- Keep `--workspace`, `--context`, and `--format agent` on follow-up commands.
- Prefer `--format agent` for compact output.
- Use `--format info` when a human-readable expanded answer is needed.
- Create a context pack for handoff with `kraken-atlas context where-to-add "requested change" --workspace . --context ProjectOrFolderName --format md`.

## Playbooks

Add or change code:

```bash
kraken-atlas query where-to-add "requested change" --workspace . --context ProjectOrFolderName --format agent
```

Trace behavior:

```bash
kraken-atlas query flow "feature or behavior" --workspace . --context ProjectOrFolderName --format agent
```

Inspect a file or symbol:

```bash
kraken-atlas query relationships "FileOrSymbolName" --workspace . --context ProjectOrFolderName --format agent
```

Fallback discovery:

```bash
kraken-atlas query search "natural language terms" --workspace . --context ProjectOrFolderName --format agent
```

Create compact handoff context:

```bash
kraken-atlas context where-to-add "requested change" --workspace . --context ProjectOrFolderName --format md
```

## Stop Conditions

- Stop after the top files provide enough evidence for the edit.
- Stop when a context pack contains the edit files, reasons, and relationship evidence.
- Ask for a narrower query or exact `--context` if results are ambiguous.

## Measure Success

- Fewer files opened.
- Fewer source lines pasted.
- Fewer exploratory searches.
- Top recommendations include the eventual edit files.
- Context pack is small enough to review in one agent turn.
