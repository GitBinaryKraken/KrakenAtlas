import { ReferenceRecord, RelationshipRecord, SourceRange } from "../model/records";
import { reactDeclarationId, routeTargetId } from "./reactIds";
import { ReactDeclaration, ReactSource } from "./reactAnalyzerTypes";
import { matchAll } from "./reactSourceText";
import { simpleTypeName, splitTopLevelGenericArgs } from "./reactTypeText";
import { rangeFromIndex } from "./textLocation";
import { WebAnalyzerResult } from "./webAnalyzerTypes";

type ReferenceBuilder = (
  symbolName: string,
  resolvedSymbolId: string,
  file: string,
  range: SourceRange,
  context: string,
  snippet: string,
  confidence: number
) => ReferenceRecord;

type RelationshipBuilder = (
  from: string,
  to: string,
  type: string,
  file: string,
  range: SourceRange,
  evidence: string,
  confidence: number
) => RelationshipRecord;

interface ReactConventionRecordBuilders {
  reference: ReferenceBuilder;
  relationship: RelationshipBuilder;
}

export function discoverContexts(source: ReactSource): ReactDeclaration[] {
  const declarations: ReactDeclaration[] = [];
  for (const match of matchAll(source.text, /\bconst\s+([A-Z][A-Za-z0-9_]*Context)\s*=\s*createContext\b/g)) {
    declarations.push({
      id: reactDeclarationId(source.file.path, "context", match[1]),
      name: match[1],
      kind: "context",
      file: source.file.path,
      language: source.file.language,
      range: rangeFromIndex(source.text, match.index, match[0].length),
      start: match.index,
      bodyStart: match.index,
      end: match.index + match[0].length,
      declaration: match[0],
      body: ""
    });
  }
  return declarations;
}

export function discoverRoutes(source: ReactSource): ReactDeclaration[] {
  const declarations: ReactDeclaration[] = [];
  const seen = new Set<string>();
  const apiRoute = nextRouteHandlerFromSource(source);
  if (apiRoute) {
    declarations.push(apiRoute);
    seen.add(`${apiRoute.name}:${routePathFromBody(apiRoute.body)}:${routeHandlerNameFromRouteBody(apiRoute.body)}`);
  }

  const fileRoute = nextFileRouteFromSource(source);
  if (fileRoute) {
    declarations.push(fileRoute);
    seen.add(`${fileRoute.name}:${routePathFromBody(fileRoute.body)}:${componentNameFromRouteBody(fileRoute.body)}`);
  }

  for (const match of matchAll(source.text, /\{[\s\S]*?\bpath\s*:\s*["'][^"']+["'][\s\S]*?\}/g)) {
    const body = match[0];
    const pathValue = routePathFromBody(body);
    const componentName = componentNameFromRouteBody(body);
    if (!pathValue || !componentName) {
      continue;
    }

    const name = routeNameFromBody(body, pathValue);
    const key = `${match.index}:${name}:${pathValue}:${componentName}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    declarations.push({
      id: reactDeclarationId(source.file.path, "route", name),
      name,
      kind: "route",
      file: source.file.path,
      language: source.file.language,
      range: rangeFromIndex(source.text, match.index, match[0].length),
      start: match.index,
      bodyStart: match.index,
      end: match.index + match[0].length,
      declaration: body.slice(0, 160),
      body
    });
  }
  return declarations;
}

export function analyzeContextUsage(
  source: ReactSource,
  declaration: ReactDeclaration,
  declarationsByName: Map<string, ReactDeclaration[]>,
  result: WebAnalyzerResult,
  records: Pick<ReactConventionRecordBuilders, "relationship">
): void {
  for (const match of matchAll(declaration.body, /\buseContext\s*\(\s*([A-Z][A-Za-z0-9_]*Context)\b/g)) {
    const context = declarationsByName.get(match[1])?.find((candidate) => candidate.kind === "context");
    if (!context) {
      continue;
    }
    const range = rangeFromIndex(source.text, declaration.bodyStart + match.index, match[0].length);
    result.relationships.push(records.relationship(declaration.id, context.id, "CONSUMES_CONTEXT", declaration.file, range, match[0], 0.88));
  }

  for (const match of matchAll(declaration.body, /<([A-Z][A-Za-z0-9_]*Context)\.Provider\b/g)) {
    const context = declarationsByName.get(match[1])?.find((candidate) => candidate.kind === "context");
    if (!context) {
      continue;
    }
    const range = rangeFromIndex(source.text, declaration.bodyStart + match.index, match[0].length);
    result.relationships.push(records.relationship(declaration.id, context.id, "PROVIDES_CONTEXT", declaration.file, range, match[0], 0.9));
  }
}

export function analyzeRoutes(
  fileDeclarations: ReactDeclaration[],
  declarationsByName: Map<string, ReactDeclaration[]>,
  result: WebAnalyzerResult,
  records: ReactConventionRecordBuilders
): void {
  for (const route of fileDeclarations.filter((declaration) => declaration.kind === "route")) {
    const componentName = componentNameFromRouteBody(route.body);
    const handlerName = routeHandlerNameFromRouteBody(route.body);
    const pathValue = routePathFromBody(route.body);
    if (pathValue) {
      const routeReferenceId = pathValue.startsWith("/api/") ? routeTargetId(pathValue) : `route:react:${pathValue}`;
      result.references.push(records.reference(pathValue, routeReferenceId, route.file, route.range, "react-route", route.declaration, 0.82));
    }
    if (componentName) {
      const targetComponent = declarationsByName.get(componentName)?.find((candidate) => candidate.kind === "component");
      const target = targetComponent?.id ?? `symbol:react-component:${componentName}`;
      result.relationships.push(records.relationship(route.id, target, "MAPS_ROUTE", route.file, route.range, route.declaration, targetComponent ? 0.86 : 0.62));
    }
    if (handlerName) {
      const targetHandler = declarationsByName.get(handlerName)?.find((candidate) => candidate.kind === "function");
      const target = targetHandler?.id ?? `symbol:react-route-handler:${handlerName}`;
      result.relationships.push(records.relationship(route.id, target, "MAPS_ROUTE", route.file, route.range, route.declaration, targetHandler ? 0.86 : 0.62));
    }
  }
}

export function hasUseDirective(text: string, directive: "client" | "server"): boolean {
  const trimmed = text.replace(/^\uFEFF/u, "").trimStart();
  return new RegExp(`^["']use ${directive}["'];?`, "u").test(trimmed);
}

export function isNextAppSourceFile(filePath: string): boolean {
  return /(?:^|\/)app\/.+\.(?:tsx|jsx|ts|js)$/iu.test(filePath.replace(/\\/g, "/"));
}

export function functionKind(filePath: string, name: string, body: string): ReactDeclaration["kind"] {
  if (isReactStoreFunction(filePath, name, body)) {
    return "store";
  }
  if (/^use[A-Z]/u.test(name)) {
    return "hook";
  }
  if (/^[A-Z]/u.test(name) && (/<[A-Z][A-Za-z0-9_.]*\b/u.test(body) || /<[a-z][A-Za-z0-9-]*\b/u.test(body) || /\.(tsx|jsx)$/iu.test(filePath))) {
    return "component";
  }
  return "function";
}

export function propsTypeFromDeclaration(declaration: string): string | undefined {
  const directProps = /:\s*([A-Za-z_$][\w$]*Props)\b/u.exec(declaration)?.[1];
  if (directProps) {
    return directProps;
  }

  const componentGeneric = /:\s*(?:React\.)?(?:FC|FunctionComponent)\s*<([^>\n]+)>/u.exec(declaration)?.[1];
  if (componentGeneric) {
    return propsTypeFromTypeExpression(componentGeneric);
  }

  const propsWithChildren = /:\s*(?:React\.)?PropsWithChildren\s*<([^>\n]+)>/u.exec(declaration)?.[1];
  return propsWithChildren ? propsTypeFromTypeExpression(propsWithChildren) : undefined;
}

export function propsTypeArgumentsFromDeclaration(declaration: string): string[] {
  const directProps = /:\s*[A-Za-z_$][\w$]*Props\s*<([^>\n]+)>/u.exec(declaration)?.[1];
  return directProps ? splitTopLevelGenericArgs(directProps) : [];
}

export function propsTypeFromWrapper(wrapperName: string, genericText: string | undefined, declaration: string): string | undefined {
  const declaredProps = propsTypeFromDeclaration(declaration);
  if (declaredProps) {
    return declaredProps;
  }

  if (!genericText) {
    return undefined;
  }

  const genericArgs = splitTopLevelGenericArgs(genericText);
  if (wrapperName === "forwardRef" && genericArgs.length > 1) {
    const propsName = simpleTypeName(genericArgs[1]);
    if (propsName?.endsWith("Props")) {
      return propsName;
    }
  }

  return genericArgs.map(propsTypeFromTypeExpression).find((name): name is string => Boolean(name?.endsWith("Props")));
}

function nextRouteHandlerFromSource(source: ReactSource): ReactDeclaration | undefined {
  const routePath = nextApiRoutePathFromFilePath(source.file.path);
  if (!routePath) {
    return undefined;
  }

  const handlerName = nextRouteHandlerName(source.text);
  if (!handlerName) {
    return undefined;
  }

  const routeName = routeNameFromPath(routePath);
  const body = `{ path: "${routePath}", handler: ${handlerName} }`;
  const declaration = `Next.js API route ${routePath} -> ${handlerName}`;
  const range = rangeFromIndex(source.text, 0, Math.min(source.text.length, 1));
  return {
    id: reactDeclarationId(source.file.path, "route", routeName),
    name: routeName,
    kind: "route",
    file: source.file.path,
    language: source.file.language,
    range,
    start: 0,
    bodyStart: 0,
    end: Math.min(source.text.length, 1),
    declaration,
    body
  };
}

function nextFileRouteFromSource(source: ReactSource): ReactDeclaration | undefined {
  const routePath = nextRoutePathFromFilePath(source.file.path);
  if (!routePath) {
    return undefined;
  }

  const componentName = defaultExportedComponentName(source.text);
  if (!componentName) {
    return undefined;
  }

  const routeName = routeNameFromPath(routePath);
  const body = `{ path: "${routePath}", Component: ${componentName} }`;
  const declaration = `Next.js file route ${routePath} -> ${componentName}`;
  const range = rangeFromIndex(source.text, 0, Math.min(source.text.length, 1));
  return {
    id: reactDeclarationId(source.file.path, "route", routeName),
    name: routeName,
    kind: "route",
    file: source.file.path,
    language: source.file.language,
    range,
    start: 0,
    bodyStart: 0,
    end: Math.min(source.text.length, 1),
    declaration,
    body
  };
}

function nextRoutePathFromFilePath(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, "/");
  const appMatch = /(?:^|\/)app\/(.+?)\/page\.(?:tsx|jsx|ts|js)$/iu.exec(normalized)
    ?? /(?:^|\/)app\/page\.(?:tsx|jsx|ts|js)$/iu.exec(normalized);
  if (appMatch) {
    const routePart = appMatch[1] ?? "";
    return routePathFromSegments(routePart ? routePart.split("/") : []);
  }

  const pagesMatch = /(?:^|\/)pages\/(.+?)\.(?:tsx|jsx|ts|js)$/iu.exec(normalized);
  if (!pagesMatch) {
    return undefined;
  }

  const routePart = pagesMatch[1];
  if (routePart.startsWith("api/") || /^_(?:app|document|error)$/iu.test(routePart)) {
    return undefined;
  }

  const segments = routePart.split("/");
  if (segments[segments.length - 1] === "index") {
    segments.pop();
  }
  return routePathFromSegments(segments);
}

function nextApiRoutePathFromFilePath(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, "/");
  const match = /(?:^|\/)app\/api\/(.+?)\/route\.(?:ts|js)$/iu.exec(normalized);
  if (!match) {
    return undefined;
  }

  return routePathFromSegments(["api", ...match[1].split("/")]);
}

function routePathFromSegments(segments: string[]): string {
  const routeSegments = segments
    .filter((segment) => segment && !segment.startsWith("(") && !segment.startsWith("@"))
    .map((segment) => {
      if (segment === "index") {
        return "";
      }
      const optionalCatchAll = /^\[\[\.\.\.([A-Za-z_$][\w$-]*)\]\]$/u.exec(segment);
      if (optionalCatchAll) {
        return `:${optionalCatchAll[1]}*`;
      }
      const catchAll = /^\[\.\.\.([A-Za-z_$][\w$-]*)\]$/u.exec(segment);
      if (catchAll) {
        return `:${catchAll[1]}*`;
      }
      const dynamic = /^\[([A-Za-z_$][\w$-]*)\]$/u.exec(segment);
      if (dynamic) {
        return `:${dynamic[1]}`;
      }
      return segment;
    });
  return routeSegments.length > 0 ? `/${routeSegments.join("/")}` : "/";
}

function defaultExportedComponentName(text: string): string | undefined {
  return /\bexport\s+default\s+(?:async\s+)?function\s+([A-Z][A-Za-z0-9_]*)\b/u.exec(text)?.[1]
    ?? /\bexport\s+default\s+([A-Z][A-Za-z0-9_]*)\b/u.exec(text)?.[1];
}

function routePathFromBody(body: string): string | undefined {
  return /\bpath\s*:\s*["']([^"']+)["']/u.exec(body)?.[1];
}

function routeNameFromBody(body: string, pathValue: string): string {
  const id = /\bid\s*:\s*["']([^"']+)["']/u.exec(body)?.[1];
  return id ?? routeNameFromPath(pathValue);
}

function routeNameFromPath(pathValue: string): string {
  const normalized = pathValue.replace(/^\/+|\/+$/gu, "");
  return normalized ? `path:${normalized}` : "root";
}

function componentNameFromRouteBody(body: string): string | undefined {
  return /\bcomponentName\s*:\s*["']([A-Za-z_$][\w$]*)["']/u.exec(body)?.[1]
    ?? /\b(?:Component|component)\s*:\s*([A-Z][A-Za-z0-9_]*)\b/u.exec(body)?.[1]
    ?? /\belement\s*:\s*<([A-Z][A-Za-z0-9_]*)\b/u.exec(body)?.[1];
}

function routeHandlerNameFromRouteBody(body: string): string | undefined {
  return /\bhandler\s*:\s*([A-Z][A-Z0-9_]*)\b/u.exec(body)?.[1];
}

function nextRouteHandlerName(text: string): string | undefined {
  return /\bexport\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/u.exec(text)?.[1]
    ?? /\bexport\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/u.exec(text)?.[1];
}

function isReactStoreFunction(filePath: string, name: string, body: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();
  return /(^|\/)(stores?|state)(\/|$)/u.test(normalizedPath) && /^use[A-Z].*Store$/u.test(name)
    || /^use[A-Z].*Store$/u.test(name)
    || /\buseSyncExternalStore\s*\(/u.test(body);
}

function propsTypeFromTypeExpression(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const simple = simpleTypeName(trimmed);
  if (simple?.endsWith("Props")) {
    return simple;
  }

  const generic = /^[A-Za-z_$][\w$.]*\s*<([\s\S]+)>$/u.exec(trimmed)?.[1];
  if (generic) {
    return splitTopLevelGenericArgs(generic)
      .map(propsTypeFromTypeExpression)
      .find((name): name is string => Boolean(name?.endsWith("Props")));
  }

  return splitTopLevelGenericArgs(trimmed.replace(/[|&]/gu, ","))
    .map(simpleTypeName)
    .find((name): name is string => Boolean(name?.endsWith("Props")));
}
