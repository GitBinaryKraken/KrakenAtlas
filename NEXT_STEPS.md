# Kraken Atlas Next Steps

Kraken Atlas is moving from "query before reading" toward "pattern-aware editing."

The SYNAPSE comparison is useful signal: developers and agents both want architecture mapping. Atlas should lean into that demand while staying distinct. The goal is not to become a pretty graph viewer first. The goal is to make a repo's existing patterns actionable before an edit happens.

## Product Thesis

Atlas wins when it can answer:

- What pattern does this repo already use?
- Where is the closest example?
- Which files should an agent edit first?
- What would violate the local architecture?
- What context can be safely ignored?

Pattern mapping is the right center of gravity because it connects existing Atlas strengths: symbol indexing, route discovery, config relationships, project dependencies, ownership hints, duplicate detection, and agent-readable output.

## Near-Term Priorities

### 1. Pattern Map v1 Polish

Make `query pattern-map` the standard first move before `where-to-add`.

Next work:

- Add `pattern-map` examples to `AGENT_SKILL.md`.
- Add a short pattern-first workflow to `GETTING_STARTED.md`.
- Make category labels sharper and more consistent.
- Improve context scoping so maps can be filtered by project, feature area, or folder.
- Add fixtures for common architecture shapes:
  - controller to service to repository
  - Razor page to handler to service
  - API route to DTO to validator to service
  - config binding to options usage
  - frontend event to backend endpoint

### 2. Pattern Fit in `where-to-add`

`where-to-add` should not only return likely files. It should explain the local pattern an edit should follow.

Target output:

- Likely pattern
- Existing examples
- Add or change points
- Files to avoid
- Caveats
- Suggested next query

This makes Atlas more useful for coding agents because it converts architecture discovery into edit planning.

### 3. Pattern Drift Detection

Add early drift candidates that identify when code appears to break an established repo pattern.

First drift checks:

- Controller bypasses the service layer where service usage is the norm.
- Service writes directly to `DbContext` where repository usage is the norm.
- Form post or endpoint exists without nearby validation.
- Config key is used but not bound through the local options pattern.
- Frontend fetch or form action points at a backend route Atlas cannot resolve.
- New file sits outside the folder pattern used by similar features.

The tone should stay careful: these are candidates, not accusations.

### 4. Alpha Feedback Loop

Turn feedback into regression fixtures quickly.

Add pattern-specific prompts to `ALPHA_FEEDBACK.md`:

- Did Atlas identify the pattern you would copy?
- Did it miss the canonical example?
- Did it recommend files that are technically related but architecturally wrong?
- Did it catch or miss a pattern violation?

Every good miss should become either a fixture, a scoring tweak, or a new relationship edge.

### 5. Demo Story

Build one end-to-end demo that shows why Atlas is different.

Suggested demo:

1. Ask Atlas for the pattern map.
2. Ask where to add a notification or preferences field.
3. Follow the returned flow across UI, route, service, persistence, validation, and config.
4. Generate a context pack for the exact edit.
5. Show the agent opening fewer files and following the local pattern.

The story should feel practical, not theoretical: "Here is how you add a real feature without wandering the repo."

## Roadmap

### 0.1.27: Pattern Map Polish

- Document pattern-first workflows.
- Add `pattern-map` to the agent skill playbook.
- Tighten agent output around observed architecture areas.
- Add regression coverage for core pattern categories.

### 0.1.28: Pattern-Fit `where-to-add`

- Attach pattern summaries to add-location results.
- Rank files by architectural role, not just symbol or relationship proximity.
- Include canonical examples when available.
- Add tests for edit guidance output.

### 0.1.29: Pattern Drift Candidates

- Add first drift record shape.
- Implement two or three high-confidence checks.
- Keep output scoped and cautious.
- Add alpha feedback fields for false positives and missed drift.

### 0.1.30: Demo Package and Scoring Loop

- Add a small demo fixture or guided walkthrough.
- Capture before and after agent workflow.
- Track whether top results include the files humans actually edit.
- Use feedback to tune ranking and category language.

## Non-Goals Right Now

- Full visual graph browser.
- Team sync or collaboration features.
- Broad framework expansion before C#/.NET and web app flows are stronger.
- Automatic deletion or cleanup.
- Whole-repo summaries that replace targeted queries.
- Styling-heavy docs work that does not improve the agent workflow.

## Success Metrics

Atlas is improving if:

- The top three recommended files include the eventual edit files.
- Agents open fewer unrelated files before making a change.
- `pattern-map` identifies the pattern a human maintainer would copy.
- Drift candidates are usually either real issues or intentional exceptions.
- Context packs fit in one agent turn without losing the important files.
- Alpha users describe the output as "that is how this repo works."

## Suggested Next Implementation Tasks

1. Add `query pattern-map` to `AGENT_SKILL.md` examples and playbooks.
2. Add pattern-specific feedback prompts to `ALPHA_FEEDBACK.md`.
3. Extend `where-to-add` with a pattern-fit summary.
4. Add tests for pattern-fit ranking and output.
5. Define a cautious pattern drift result shape.
6. Implement the first two drift checks.
7. Build the notification or preferences demo walkthrough.
