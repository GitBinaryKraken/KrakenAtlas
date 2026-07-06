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
- cannot trace a React component, hook, context, route, store, prop, JSX event, or API-client call
- misses a TypeScript export, prop/interface member, wrapper component such as `memo`/`forwardRef`, or route-object declaration

## Quick Feedback Commands

Run these from the target workspace after `Kraken Atlas: Install AI Agent Setup` and opening a new terminal:

```powershell
kraken-atlas doctor --workspace . --format agent
kraken-atlas query project --workspace . --format agent
kraken-atlas query pattern-map --workspace . --context ProjectOrFolderName --format agent
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
- for React/TypeScript misses, the expected component, hook, context, store, prop, route, event, API route, or import/export edge
- for code-health findings, why the candidate is intentional, reachable, missing, or incorrectly grouped

Avoid sharing secrets, proprietary source code, credentials, or generated `.kraken-atlas/index.sqlite` files. Short file paths, symbol names, and trimmed command output are usually enough.

## React And TypeScript Feedback Prompts

React/TypeScript support is first-pass, with compiler-backed project discovery, import resolution, declaration/member extraction, and selected prop/call/type edges now present. The best reports name the exact map fact Atlas should have found.

Use these prompts when a React query is wrong or incomplete:

- Component composition: Did Atlas miss a `RENDERS_COMPONENT` edge from a parent component to a child component?
- Props and members: Did Atlas miss a prop/interface member, a `DECLARES_PROPS` edge, or a `DECLARES_PROP` member edge?
- Nested props: Did Atlas miss a nested prop/member hint such as `params.workflowId`?
- Inferred props: Did Atlas miss a destructured, defaulted, nested, or rest prop in an untyped component parameter?
- Typed components: Did Atlas miss prop ownership for `React.FC<Props>`, `FC<Props>`, or `FunctionComponent<Props>`?
- Utility and inherited props: Did Atlas miss `Pick`, `Omit`, `Partial`, `Required`, `Readonly`, finite-key `Record`, mapped-type, intersection, inherited, or `ComponentProps<typeof Component>` prop relationships?
- Type contracts: Did Atlas miss a generic type parameter, discriminated-union variant, literal union value, enum member, exported API/client type, `REFERENCES_TYPE`, or `USES_TYPE_ARGUMENT` edge?
- Hooks and context: Did Atlas miss `USES_HOOK`, `PROVIDES_CONTEXT`, or `CONSUMES_CONTEXT` evidence?
- Stores: Did Atlas miss a store hook module, a `USES_STORE` edge, or a state-store pattern-map category?
- Routes: Did Atlas miss a route mapping from `componentName`, `Component`, `component`, `element: <Component />`, `app/**/page.tsx`, or `pages/**/*.tsx`?
- Route handlers: Did Atlas miss a Next.js API route handler under `app/api/**/route.ts`?
- Client/server conventions: Did Atlas miss `"use client"` component or `"use server"` action roles?
- UI events: Did Atlas miss a JSX `onClick`, `onSubmit`, `onChange`, or other `HANDLES_EVENT` edge?
- API calls: Did Atlas miss a `CALLS_API_ROUTE` edge from `fetch`, `axios`, or a local API-client helper?
- Imports and exports: Did Atlas miss a default export, named export, re-export, `memo(...)`, `forwardRef(...)`, or another wrapper-assigned component?
- Type-only imports: Did Atlas miss a `TYPE_IMPORTS_MODULE` relationship or `typescript-type-import` reference for `import type` usage?
- Barrel files: Did Atlas stop at `index.ts` instead of following `export { Component } from "./Component"` or `export * from "./Component"` to the implementation file?
- Resolved calls: Did Atlas fall back to a same-name local match instead of resolving an imported function, hook, store call, or namespace-style call to the implementation file?
- Pattern map: Did `pattern-map` miss the local pattern an agent should copy, or group technically related React files under the wrong architecture area?
- Token/context noise: Did React output include too many adjacent components, generated files, tests, or unrelated routes for the requested feature?

Helpful React report shape:

```text
Query:
kraken-atlas query flow "bulk approve workflow item" --workspace . --context ReactWorkflowBoard --format agent

Problem:
Atlas opened WorkspacePage first but did not show the WorkflowCard onApprove handler or the workflowApi approve call.

Expected:
WorkspacePage -> WorkflowCard should have RENDERS_COMPONENT.
WorkflowCard should have HANDLES_EVENT for onApprove.
workflowApi.approveWorkflow should have CALLS_API_ROUTE for /api/workflows/:id/approve.

Snippet:
Small trimmed snippets for the parent JSX, child props, and API helper.

Doctor:
Kraken Atlas status: ready...
```

Turn a miss into one of these outcomes:

- a new React fixture or fixture variant
- a parser/analyzer expansion
- a relationship edge fix
- a role/tag/member enrichment tweak
- a query-ranking or pattern-map scoring test

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
