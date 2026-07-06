# Where We Left Off

Date: 2026-07-06

## Current Checkpoint

The committed repo checkpoint is:

```text
1be7113 Prepare Kraken Atlas 0.1.27 alpha release
```

The working tree is far ahead of that checkpoint. Public/package docs currently present `0.2.2` as the latest packaged alpha, while `CHANGELOG.md` has additional React/TypeScript semantic-analysis work staged under `Unreleased`.

The main product thread has moved from the earlier pattern-planning slice into `0.2.x` React/TypeScript hardening. Atlas should still describe this as first-pass React/TypeScript support, but not as purely convention-based anymore: some compiler-backed project, import, declaration, prop, and call slices are now in place.

## React/TypeScript Support State

Packaged `0.2.0` completed the first React analyzer milestone:

- `.jsx`, `.ts`, and `.tsx` language detection.
- Components, hooks, context providers/consumers, routes, stores, props, JSX events, imports, and API/fetch calls.
- React relationships such as `RENDERS_COMPONENT`, `USES_HOOK`, `USES_STORE`, `PASSES_PROP`, `PROVIDES_CONTEXT`, `CONSUMES_CONTEXT`, `HANDLES_EVENT`, `IMPORTS_MODULE`, `MAPS_ROUTE`, and `CALLS_API_ROUTE`.
- Route object styles, Next-style file routes, lightweight `"use client"` / `"use server"` roles, and Next `app/api/**/route.ts` handlers.
- Object-shaped props aliases, `React.FC<Props>` / `FC<Props>` / `FunctionComponent<Props>` prop ownership, nested prop hints such as `params.workflowId`, and React barrel re-export resolution.
- Regression coverage across Vite-style React apps, route/state organization variants, Next-style file routes, and mixed `.jsx` / TypeScript barrel paths.

Packaged `0.2.2` added the TypeScript semantic foundation:

- Queryable TypeScript project facts from `tsconfig.json`, `package.json`, path aliases, package exports, and project references.
- TypeScript compiler module resolution for React/TypeScript imports, including aliases, barrels, workspace package exports, default barrel re-exports, package-subpath imports, and namespace JSX component usage.
- Compiler-AST declaration extraction for interfaces, object type aliases, scalar type aliases, enums, enum members, and member summaries.
- Type-only import separation with `TYPE_IMPORTS_MODULE` relationships and `typescript-type-import` references.
- JSX `PASSES_PROP` edges to declared prop member nodes when the rendered component has a known props type.
- First-pass intersection props and parallel React relationship evidence preservation.

Unreleased work now extends the semantic path with:

- Type-parameter nodes, discriminated-union variants, literal union values, exported API/client contract patterns, local `REFERENCES_TYPE`, and `USES_TYPE_ARGUMENT` edges.
- Imported function, hook, and store call resolution through import bindings, including namespace-style calls.
- Import-resolved evidence markers for React call and hook relationships.
- Default/named import and re-export aliases through React barrels.
- Imported prop type aliases, inherited props with `EXTENDS_PROPS`, `ComponentProps<typeof Component>` aliases, and JSX prop resolution through inherited or shared prop declarations.
- Utility-prop expansion for `Pick`, `Omit`, `Partial`, `Required`, `Readonly`, finite-key `Record`, and simple mapped types.
- Inferred prop nodes for untyped destructured component parameters in TypeScript and JavaScript/JSX components.

## Documentation Alignment

Docs should use this wording split:

- Public scope: first-pass React/TypeScript support with compiler-backed project discovery, import resolution, declaration/member extraction, and selected prop/call/type edges.
- Known limits: full type-checker-backed inference, complex mapped/indexed types, broad generic expansion, external package type surfaces, generated declaration coverage, and deeper framework conventions remain in progress.
- Next steps: prioritize real-project validation and fixture-backed misses before expanding into broader React framework features.

## Recommended Next Steps

1. Validate React/Next query quality on a larger real project or convert alpha misses into fixtures.
2. Deepen inferred props for nested destructuring, rest props, default-value refinement, and checker-backed inferred prop types.
3. Deepen utility-prop coverage for broad index signatures, key remapping, template-literal keys, conditional mapped types, and checker-backed value/optional types.
4. Expand generic props beyond first-pass names, including generic components, generic type aliases, constraints/defaults, and concrete JSX type arguments.
5. Add workspace/package-manager fixture coverage for pnpm/yarn/npm package boundaries, generated declarations, package exports, project references, path aliases, and mixed JS/TS package boundaries.
6. Continue call-graph resolution for callbacks, imported object methods, hook-return methods, service clients, and async action functions.
7. Improve relationship evidence labels so compiler-resolved, import-resolved, convention-derived, and text-derived edges are easy to filter in SQLite and agent output.
8. Keep React Server Components, Suspense, loading/error boundary conventions, and broader external package type surfaces behind the core prop/type/call semantics work.
9. In parallel, add .NET Minimal API route-group and endpoint-filter fixture coverage when the React/TypeScript slice is stable enough to pause.

## Validation

`npm test` passed on 2026-07-06 with 84/84 tests after the React/TypeScript documentation alignment.
