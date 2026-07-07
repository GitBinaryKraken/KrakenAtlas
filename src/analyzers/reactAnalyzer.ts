import * as path from "path";
import * as ts from "typescript";
import { FileRecord, ReferenceRecord, RelationshipRecord, SourceRange, SymbolRecord } from "../model/records";
import {
  analyzeContextUsage,
  analyzeRoutes,
  discoverContexts,
  discoverRoutes,
  functionKind,
  hasUseDirective,
  isNextAppSourceFile,
  propsTypeArgumentsFromDeclaration,
  propsTypeFromDeclaration,
  propsTypeFromWrapper
} from "./reactConventions";
import { reactDeclarationId, reactModuleId, routeTargetId } from "./reactIds";
import { declarationNamesForImport, resolveReExportedFile } from "./reactImportResolution";
import { analyzeComponentComposition, membersForPropsDeclaration, resolvePropsDeclaration } from "./reactJsxComposition";
import { syntheticMembersForPropUtilities } from "./reactPropUtilities";
import { findMatchingBrace, findMatchingParen, IndexedMatch, matchAll } from "./reactSourceText";
import { discoverTypeScriptDeclarations, typeParametersFromGenericText } from "./reactTypeScriptDeclarations";
import { discoverInterfaceMembers } from "./reactTypeScriptMembers";
import {
  ImportBinding,
  ReactDeclaration,
  ReactMember,
  ReactSource,
  TypeScriptInferredProp
} from "./reactAnalyzerTypes";
import { escapeRegExp, slug, splitTopLevelGenericArgs } from "./reactTypeText";
import { rangeFromIndex } from "./textLocation";
import { resolveTypeScriptModuleFile, TypeScriptProjectContext } from "./typescriptProjectAnalyzer";
import { WebAnalyzerResult } from "./webAnalyzerTypes";

export type { ReactSource } from "./reactAnalyzerTypes";

interface ImportSpecifier {
  name: string;
  importedName?: string;
  importStyle: ImportBinding["importStyle"];
  typeOnly: boolean;
}

const reactExtensions = new Set([".jsx", ".tsx", ".ts"]);
const ignoredCallNames = new Set([
  "Array",
  "Boolean",
  "Date",
  "Error",
  "JSON",
  "Math",
  "Number",
  "Object",
  "Promise",
  "Set",
  "String",
  "catch",
  "filter",
  "find",
  "forEach",
  "if",
  "includes",
  "join",
  "map",
  "reduce",
  "return",
  "setTimeout",
  "sort",
  "switch"
]);

export function isReactSourceFile(file: FileRecord): boolean {
  return reactExtensions.has(file.extension);
}

function modulePatternsForSource(source: ReactSource): string[] {
  const patterns = ["react-module"];
  if (hasUseDirective(source.text, "client")) {
    patterns.push("react-client-module");
  }
  if (hasUseDirective(source.text, "server")) {
    patterns.push("react-server-action-module");
  }
  return patterns;
}

function applySourceRuntime(source: ReactSource, declaration: ReactDeclaration): ReactDeclaration {
  if (hasUseDirective(source.text, "client") && (declaration.kind === "component" || declaration.kind === "hook" || declaration.kind === "function")) {
    return { ...declaration, runtime: "client" };
  }
  if ((hasUseDirective(source.text, "server") || /["']use server["']/u.test(declaration.body)) && declaration.kind === "function") {
    return { ...declaration, runtime: "server-action" };
  }
  if (declaration.kind === "component" && isNextAppSourceFile(source.file.path)) {
    return { ...declaration, runtime: "server-component" };
  }
  return declaration;
}

export function analyzeReactSources(sources: ReactSource[], result: WebAnalyzerResult, typeScriptProjects: TypeScriptProjectContext[] = []): void {
  const moduleIds = new Map<string, string>();
  const declarations: ReactDeclaration[] = [];
  const importsByFile = new Map<string, ImportBinding[]>();
  const reExportsByFile = new Map<string, ImportBinding[]>();
  const sourcesByPath = new Map(sources.map((source) => [source.file.path, source]));

  for (const source of sources) {
    const moduleId = reactModuleId(source.file.path);
    moduleIds.set(source.file.path, moduleId);
    result.symbols.push(symbol(moduleId, path.basename(source.file.path), source.file.path, source.file.language, "module", source.file.path, rangeFromIndex(source.text, 0, Math.min(source.text.length, 1)), 0.78, modulePatternsForSource(source)));

    const imports = discoverImports(source, sources, typeScriptProjects);
    importsByFile.set(source.file.path, imports);
    reExportsByFile.set(source.file.path, discoverReExports(source, sources, typeScriptProjects));

    const sourceDeclarations = [
      ...discoverTypeScriptDeclarations(source),
      ...discoverContexts(source),
      ...discoverFunctions(source),
      ...discoverRoutes(source)
    ].map((declaration) => applySourceRuntime(source, declaration));
    declarations.push(...sourceDeclarations);
  }

  for (const source of sources) {
    const moduleId = moduleIds.get(source.file.path) ?? reactModuleId(source.file.path);
    for (const importBinding of importsByFile.get(source.file.path) ?? []) {
      emitImportBinding(source, moduleId, importBinding, reExportsByFile, result);
    }

    for (const reExport of reExportsByFile.get(source.file.path) ?? []) {
      if (!reExport.resolvedFile) {
        continue;
      }
      result.references.push(reference(reExport.name, `file:${reExport.resolvedFile}`, source.file.path, reExport.range, "react-re-export", reExport.snippet, 0.76));
      result.relationships.push(relationship(moduleId, `file:${reExport.resolvedFile}`, "RE_EXPORTS_MODULE", source.file.path, reExport.range, reExport.snippet, 0.78));
    }
  }

  const declarationsByName = declarations.reduce((map, declaration) => {
    const current = map.get(declaration.name) ?? [];
    current.push(declaration);
    map.set(declaration.name, current);
    return map;
  }, new Map<string, ReactDeclaration[]>());
  const members = declarations.flatMap((declaration) => {
    const source = sourcesByPath.get(declaration.file);
    const directMembers = source ? discoverInterfaceMembers(source, declaration) : [];
    return [...directMembers, ...syntheticMembersForPropUtilities(declaration, declarationsByName)];
  });
  const membersByParentId = members.reduce((map, member) => {
    const current = map.get(member.parentId) ?? [];
    current.push(member);
    map.set(member.parentId, current);
    return map;
  }, new Map<string, ReactMember[]>());
  const typeParameterIdsByName = new Map<string, string>();
  for (const declaration of declarations) {
    for (const typeParameter of declaration.typeParameters ?? []) {
      typeParameterIdsByName.set(`${declaration.id}:${typeParameter.name}`, `${declaration.id}:type-parameter:${slug(typeParameter.name)}`);
    }
  }

  for (const declaration of declarations) {
    result.symbols.push(symbol(
      declaration.id,
      declaration.name,
      `${declaration.file}.${declaration.name}`,
      declaration.language,
      declaration.kind,
      declaration.file,
      declaration.range,
      confidenceForDeclaration(declaration),
      patternsForDeclaration(declaration),
      declaration.propsType
    ));

    const moduleId = moduleIds.get(declaration.file) ?? reactModuleId(declaration.file);
    result.relationships.push(relationship(moduleId, declaration.id, "CONTAINS", declaration.file, declaration.range, declaration.declaration, 0.82));
    if (isTypeContractDeclaration(declaration)) {
      emitTypeReferenceEdges(declaration.id, declaration.body, declaration.file, declaration.range, declarationsByName, typeParameterIdsByName, result, "typescript-declaration-type");
      emitGenericTypeArgumentEdges(declaration.id, declaration.body, declaration.file, declaration.range, declarationsByName, typeParameterIdsByName, result);
    }
    for (const inheritedType of declaration.extendsTypes ?? []) {
      const inheritedDeclaration = resolvePropsDeclaration(inheritedType, declaration.file, declarationsByName, importsByFile, reExportsByFile);
      if (inheritedDeclaration) {
        result.relationships.push(relationship(declaration.id, inheritedDeclaration.id, "EXTENDS_PROPS", declaration.file, declaration.range, inheritedType, 0.78));
      }
    }

    for (const typeParameter of declaration.typeParameters ?? []) {
      const parameterId = `${declaration.id}:type-parameter:${slug(typeParameter.name)}`;
      result.symbols.push(symbol(
        parameterId,
        typeParameter.name,
        `${declaration.name}<${typeParameter.name}>`,
        declaration.language,
        "type-parameter",
        declaration.file,
        typeParameter.range,
        0.78,
        ["typescript-type-parameter"],
        typeParameter.summary
      ));
      result.relationships.push(relationship(declaration.id, parameterId, "HAS_TYPE_PARAMETER", declaration.file, typeParameter.range, typeParameter.declaration, 0.78));
      emitTypeReferenceEdges(parameterId, typeParameter.declaration, declaration.file, typeParameter.range, declarationsByName, typeParameterIdsByName, result, "typescript-type-parameter-reference");
    }

    for (const variant of declaration.unionVariants ?? []) {
      const variantId = `${declaration.id}:variant:${slug(variant.name)}`;
      result.symbols.push(symbol(
        variantId,
        variant.name,
        `${declaration.name}.${variant.name}`,
        declaration.language,
        "union-variant",
        declaration.file,
        variant.range,
        0.8,
        variant.variantKind === "literal" ? ["typescript-union-variant", "typescript-literal-union-value"] : ["typescript-union-variant", "typescript-discriminated-union-variant"],
        variant.variantKind === "literal" ? `literal: ${variant.declaration}` : `discriminator: ${variant.discriminator}`
      ));
      result.relationships.push(relationship(declaration.id, variantId, "HAS_UNION_VARIANT", declaration.file, variant.range, variant.declaration, 0.8));
    }
  }

  for (const member of members) {
    result.symbols.push(symbol(
      member.id,
      member.name,
      `${member.parentName}.${member.name}`,
      member.language,
      member.kind,
      member.file,
      member.range,
      0.78,
      patternsForMember(member),
      memberSummary(member)
    ));
    result.relationships.push(relationship(member.parentId, member.id, "HAS_MEMBER", member.file, member.range, member.declaration, 0.82));
    emitTypeReferenceEdges(member.id, member.typeName, member.file, member.range, declarationsByName, typeParameterIdsByName, result, "typescript-member-type");
  }

  for (const declaration of declarations) {
    if (!declaration.componentPropsType) {
      continue;
    }
    const component = declarationsByName.get(declaration.componentPropsType)?.find((candidate) => candidate.kind === "component");
    if (component) {
      result.relationships.push(relationship(declaration.id, component.id, "ALIASES_COMPONENT_PROPS", declaration.file, declaration.range, declaration.declaration, 0.76));
    }
  }

  for (const source of sources) {
    const fileDeclarations = declarations.filter((declaration) => declaration.file === source.file.path);
    for (const declaration of fileDeclarations) {
    analyzeDeclarationBody(source, declaration, declarationsByName, membersByParentId, importsByFile, reExportsByFile, typeParameterIdsByName, result);
    }
    analyzeRoutes(fileDeclarations, declarationsByName, result, { reference, relationship });
  }
}

function discoverImports(source: ReactSource, sources: ReactSource[], typeScriptProjects: TypeScriptProjectContext[]): ImportBinding[] {
  const imports: ImportBinding[] = [];
  for (const match of matchAll(source.text, /\bimport\s+(type\s+)?([^;]+?)\s+from\s+["']([^"']+)["']/g)) {
    const typeOnly = Boolean(match[1]);
    const specifierText = match[2];
    const importSource = match[3];
    const range = rangeFromIndex(source.text, match.index, match[0].length);
    const specifiers = importSpecifiers(specifierText);
    const resolution = resolveImportFile(source.file.path, importSource, sources, typeScriptProjects);
    for (const specifier of specifiers) {
      imports.push({
        name: specifier.name,
        importedName: specifier.importedName,
        source: importSource,
        resolvedFile: resolution?.file,
        resolution: resolution?.kind,
        range,
        snippet: match[0],
        kind: "import",
        importStyle: specifier.importStyle,
        typeOnly: typeOnly || specifier.typeOnly
      });
    }
  }
  return imports;
}

function discoverReExports(source: ReactSource, sources: ReactSource[], typeScriptProjects: TypeScriptProjectContext[]): ImportBinding[] {
  const reExports: ImportBinding[] = [];
  for (const match of matchAll(source.text, /\bexport\s+(type\s+)?(\*|\{[^}]+\})\s+from\s+["']([^"']+)["']/g)) {
    const typeOnly = Boolean(match[1]);
    const specifierText = match[2];
    const importSource = match[3];
    const range = rangeFromIndex(source.text, match.index, match[0].length);
    const specifiers = specifierText === "*" ? [{ name: "*", importedName: "*", importStyle: "namespace" as const, typeOnly: false }] : importSpecifiers(specifierText);
    const resolution = resolveImportFile(source.file.path, importSource, sources, typeScriptProjects);
    for (const specifier of specifiers) {
      reExports.push({
        name: specifier.name,
        importedName: specifier.importedName,
        source: importSource,
        resolvedFile: resolution?.file,
        resolution: resolution?.kind,
        range,
        snippet: match[0],
        kind: "re-export",
        importStyle: specifier.importStyle,
        typeOnly: typeOnly || specifier.typeOnly
      });
    }
  }
  return reExports;
}

function emitImportBinding(
  source: ReactSource,
  moduleId: string,
  importBinding: ImportBinding,
  reExportsByFile: Map<string, ImportBinding[]>,
  result: WebAnalyzerResult
): void {
  if (!importBinding.resolvedFile) {
    return;
  }

  const importContext = importBinding.typeOnly
    ? (importBinding.resolution === "typescript" ? "typescript-type-import" : "type-import")
    : (importBinding.resolution === "typescript" ? "typescript-import" : "import");
  const importConfidence = importBinding.resolution === "typescript" ? 0.84 : 0.72;
  const importEvidenceTags = [
    importBinding.typeOnly ? "type-only" : undefined,
    importBinding.resolution === "typescript" ? "TypeScript module resolver" : undefined
  ].filter(Boolean).join("; ");
  const importEvidence = importEvidenceTags ? `${importBinding.snippet} (${importEvidenceTags})` : importBinding.snippet;
  const importRelationship = importBinding.typeOnly ? "TYPE_IMPORTS_MODULE" : "IMPORTS_MODULE";
  result.references.push(reference(importBinding.name, `file:${importBinding.resolvedFile}`, source.file.path, importBinding.range, importContext, importBinding.snippet, importConfidence));
  result.relationships.push(relationship(moduleId, `file:${importBinding.resolvedFile}`, importRelationship, source.file.path, importBinding.range, importEvidence, importConfidence));

  const barrelTarget = resolveReExportedFile(importBinding, reExportsByFile);
  if (!barrelTarget || barrelTarget === importBinding.resolvedFile) {
    return;
  }

  result.references.push(reference(importBinding.name, `file:${barrelTarget}`, source.file.path, importBinding.range, importBinding.typeOnly ? "barrel-type-import" : "barrel-import", importBinding.snippet, 0.78));
  result.relationships.push(relationship(moduleId, `file:${barrelTarget}`, importRelationship, source.file.path, importBinding.range, `${importBinding.snippet} via ${importBinding.resolvedFile}`, 0.78));
}

function importSpecifiers(specifierText: string): ImportSpecifier[] {
  const specifiers: ImportSpecifier[] = [];
  const defaultImport = specifierText.match(/^\s*([A-Za-z_$][\w$]*)/u);
  if (defaultImport && defaultImport[1] !== "{" && defaultImport[1] !== "*") {
    specifiers.push({ name: defaultImport[1], importedName: "default", importStyle: "default", typeOnly: false });
  }

  const namedImport = specifierText.match(/\{([^}]+)\}/u);
  if (namedImport) {
    for (const part of namedImport[1].split(",")) {
      const trimmed = part.trim();
      const localTypeOnly = /^type\s+/u.test(trimmed);
      const withoutType = trimmed.replace(/^type\s+/u, "");
      const [importedPart, localPart] = withoutType.split(/\s+as\s+/iu);
      const importedName = importedPart?.trim();
      const name = (localPart ?? importedPart)?.trim();
      if (name) {
        specifiers.push({ name, importedName, importStyle: "named", typeOnly: localTypeOnly });
      }
    }
  }

  const namespaceImport = specifierText.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/u);
  if (namespaceImport) {
    specifiers.push({ name: namespaceImport[1], importedName: "*", importStyle: "namespace", typeOnly: false });
  }

  const seen = new Set<string>();
  return specifiers.filter((specifier) => {
    const key = `${specifier.importStyle}:${specifier.name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

interface ImportResolution {
  file: string;
  kind: "typescript" | "convention";
}

function resolveImportFile(fromFile: string, importSource: string, sources: ReactSource[], typeScriptProjects: TypeScriptProjectContext[]): ImportResolution | undefined {
  const available = new Set(sources.map((source) => source.file.path.replace(/\\/g, "/")));
  const typeScriptResolved = resolveTypeScriptModuleFile(fromFile, importSource, typeScriptProjects, available);
  if (typeScriptResolved) {
    return { file: typeScriptResolved, kind: "typescript" };
  }

  const basePath = importSource.startsWith(".")
    ? path.posix.normalize(path.posix.join(path.posix.dirname(fromFile.replace(/\\/g, "/")), importSource))
    : resolveTypeScriptImportBase(fromFile, importSource, typeScriptProjects, available);
  if (!basePath) {
    return undefined;
  }

  const conventionResolved = resolveCandidateFile(basePath, available);
  return conventionResolved ? { file: conventionResolved, kind: "convention" } : undefined;
}

function resolveCandidateFile(basePath: string, available: Set<string>): string | undefined {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    path.posix.join(basePath, "index.ts"),
    path.posix.join(basePath, "index.tsx"),
    path.posix.join(basePath, "index.js"),
    path.posix.join(basePath, "index.jsx")
  ];
  return candidates.find((candidate) => available.has(candidate));
}

function resolveTypeScriptImportBase(
  fromFile: string,
  importSource: string,
  typeScriptProjects: TypeScriptProjectContext[],
  available: Set<string>
): string | undefined {
  const project = bestTypeScriptProjectForFile(fromFile, typeScriptProjects);
  if (!project) {
    return undefined;
  }

  for (const mapping of project.paths) {
    const matched = matchPathAlias(importSource, mapping.alias);
    if (matched === undefined) {
      continue;
    }
    for (const target of mapping.targets) {
      const substituted = target.includes("*") ? target.replace(/\*/g, matched) : target;
      const candidate = projectRelativePath(project, substituted);
      const resolved = resolveCandidateFile(candidate, available);
      if (resolved) {
        return resolved;
      }
    }
  }

  if (!project.baseUrl) {
    return undefined;
  }

  const baseUrlCandidate = projectRelativePath(project, path.posix.join(project.baseUrl, importSource));
  return resolveCandidateFile(baseUrlCandidate, available);
}

function bestTypeScriptProjectForFile(fromFile: string, typeScriptProjects: TypeScriptProjectContext[]): TypeScriptProjectContext | undefined {
  const normalized = fromFile.replace(/\\/g, "/");
  return typeScriptProjects
    .filter((project) => project.projectRoot === "." || normalized === project.projectRoot || normalized.startsWith(`${project.projectRoot}/`))
    .sort((left, right) => right.projectRoot.length - left.projectRoot.length)[0];
}

function matchPathAlias(importSource: string, alias: string): string | undefined {
  if (!alias.includes("*")) {
    return importSource === alias ? "" : undefined;
  }

  const [prefix, suffix] = alias.split("*");
  if (!importSource.startsWith(prefix) || !importSource.endsWith(suffix)) {
    return undefined;
  }
  return importSource.slice(prefix.length, importSource.length - suffix.length);
}

function projectRelativePath(project: TypeScriptProjectContext, candidate: string): string {
  return path.posix.normalize(path.posix.join(project.projectRoot === "." ? "" : project.projectRoot, candidate));
}

function discoverFunctions(source: ReactSource): ReactDeclaration[] {
  const declarations: ReactDeclaration[] = [];
  const seen = new Set<string>();
  const functionPattern = /\b(?:export\s+default\s+|export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(<[^>\n]+>)?\s*\(([^)]*)\)\s*(?::\s*(?:[^{}]|\{[^{}]*\})+)?\{/g;
  for (const match of matchAll(source.text, functionPattern)) {
    const openBrace = match.index + match[0].lastIndexOf("{");
    const closeBrace = findMatchingBrace(source.text, openBrace);
    if (closeBrace < 0) {
      continue;
    }

    const name = match[1];
    const body = source.text.slice(openBrace + 1, closeBrace);
    const kind = functionKind(source.file.path, name, body);
    const key = `${kind}:${name}:${match.index}`;
    seen.add(key);
    const explicitPropsType = propsTypeFromDeclaration(match[0]);
    const inferredProps = kind === "component" && !explicitPropsType ? inferredPropsFromParameters(source, match[3], paramsStartFromMatch(match, 3)) : [];
    const propsType = explicitPropsType ?? (inferredProps.length ? inferredPropsName(name) : undefined);
    declarations.push({
      id: reactDeclarationId(source.file.path, kind, name),
      name,
      kind,
      file: source.file.path,
      language: source.file.language,
      range: rangeFromIndex(source.text, match.index, closeBrace + 1 - match.index),
      start: match.index,
      bodyStart: openBrace + 1,
      end: closeBrace + 1,
      declaration: match[0].slice(0, 160),
      body,
      propsType,
      propsTypeArguments: explicitPropsType ? propsTypeArgumentsFromDeclaration(match[0]) : undefined,
      exported: /\bexport\b/u.test(match[0]),
      typeParameters: typeParametersFromGenericText(source, match[2], paramsStartFromMatch(match, 2))
    });
    declarations.push(...inferredPropsDeclaration(source, name, match.index, match[0], inferredProps));
  }

  const arrowPattern = /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*(?:async\s*)?(?:\(([^)]*)\)|[A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=>\s*(\{|\()/g;
  for (const match of matchAll(source.text, arrowPattern)) {
    const name = match[1];
    const bodyStartToken = match[3];
    const bodyStart = match.index + match[0].lastIndexOf(bodyStartToken);
    const bodyEnd = bodyStartToken === "{" ? findMatchingBrace(source.text, bodyStart) : findMatchingParen(source.text, bodyStart);
    if (bodyEnd < 0) {
      continue;
    }

    const body = source.text.slice(bodyStart + 1, bodyEnd);
    const kind = functionKind(source.file.path, name, body);
    const key = `${kind}:${name}:${match.index}`;
    if (seen.has(key)) {
      continue;
    }
    const explicitPropsType = propsTypeFromDeclaration(match[0]);
    const inferredProps = kind === "component" && !explicitPropsType && match[2] ? inferredPropsFromParameters(source, match[2], paramsStartFromMatch(match, 2)) : [];
    const propsType = explicitPropsType ?? (inferredProps.length ? inferredPropsName(name) : undefined);
    declarations.push({
      id: reactDeclarationId(source.file.path, kind, name),
      name,
      kind,
      file: source.file.path,
      language: source.file.language,
      range: rangeFromIndex(source.text, match.index, bodyEnd + 1 - match.index),
      start: match.index,
      bodyStart: bodyStart + 1,
      end: bodyEnd + 1,
      declaration: match[0].slice(0, 160),
      body,
      propsType,
      propsTypeArguments: explicitPropsType ? propsTypeArgumentsFromDeclaration(match[0]) : undefined,
      exported: /\bexport\b/u.test(match[0])
    });
    declarations.push(...inferredPropsDeclaration(source, name, match.index, match[0], inferredProps));
  }

  const wrappedArrowPattern = /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*(?:React\.)?(memo|forwardRef)\s*(?:<([^>\n]+)>)?\s*\(\s*(?:async\s*)?(?:\(([^)]*)\)|[A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=>\s*(\{|\()/g;
  for (const match of matchAll(source.text, wrappedArrowPattern)) {
    const name = match[1];
    if (!/^[A-Z]/u.test(name) && !/^use[A-Z]/u.test(name)) {
      continue;
    }

    const bodyStartToken = match[5];
    const bodyStart = match.index + match[0].lastIndexOf(bodyStartToken);
    const bodyEnd = bodyStartToken === "{" ? findMatchingBrace(source.text, bodyStart) : findMatchingParen(source.text, bodyStart);
    if (bodyEnd < 0) {
      continue;
    }

    const body = source.text.slice(bodyStart + 1, bodyEnd);
    const kind = functionKind(source.file.path, name, body);
    const key = `${kind}:${name}:${match.index}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    declarations.push({
      id: reactDeclarationId(source.file.path, kind, name),
      name,
      kind,
      file: source.file.path,
      language: source.file.language,
      range: rangeFromIndex(source.text, match.index, bodyEnd + 1 - match.index),
      start: match.index,
      bodyStart: bodyStart + 1,
      end: bodyEnd + 1,
      declaration: match[0].slice(0, 160),
      body,
      propsType: propsTypeFromWrapper(match[2], match[3], match[0]),
      propsTypeArguments: propsTypeArgumentsFromDeclaration(match[0]),
      exported: /\bexport\b/u.test(match[0])
    });
  }

  return declarations;
}

function inferredPropsName(componentName: string): string {
  return `${componentName}InferredProps`;
}

function inferredPropsDeclaration(
  source: ReactSource,
  componentName: string,
  start: number,
  declarationText: string,
  inferredProps: TypeScriptInferredProp[]
): ReactDeclaration[] {
  if (!inferredProps.length) {
    return [];
  }

  const name = inferredPropsName(componentName);
  const firstProp = inferredProps[0];
  const rangeStart = firstProp.range.startLine > 0 ? firstProp.range : rangeFromIndex(source.text, start, declarationText.length);
  return [{
    id: reactDeclarationId(source.file.path, "props", name),
    name,
    kind: "props",
    file: source.file.path,
    language: source.file.language,
    range: rangeStart,
    start,
    bodyStart: start,
    end: start + declarationText.length,
    declaration: `inferred props for ${componentName}`,
    body: inferredProps.map((prop) => prop.declaration).join("; "),
    propsType: "inferred: destructured parameters",
    inferredProps
  }];
}

function inferredPropsFromParameters(source: ReactSource, paramsText: string | undefined, paramsStart: number): TypeScriptInferredProp[] {
  if (!paramsText?.trim().startsWith("{")) {
    return [];
  }

  const prefix = "function __atlas__(";
  const sourceFile = ts.createSourceFile("__atlas__.tsx", `${prefix}${paramsText}) {}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const statement = sourceFile.statements[0];
  if (!statement || !ts.isFunctionDeclaration(statement)) {
    return [];
  }

  const parameter = statement.parameters[0];
  if (!parameter || !ts.isObjectBindingPattern(parameter.name)) {
    return [];
  }

  const seen = new Set<string>();
  const props: TypeScriptInferredProp[] = [];
  for (const element of parameter.name.elements) {
    for (const prop of inferredPropsFromBindingElement(source, sourceFile, element, paramsStart, prefix.length)) {
      if (seen.has(prop.name)) {
        continue;
      }
      seen.add(prop.name);
      props.push(prop);
    }
  }
  return props;
}

function inferredPropsFromBindingElement(
  source: ReactSource,
  sourceFile: ts.SourceFile,
  element: ts.BindingElement,
  paramsStart: number,
  prefixLength: number,
  parentName?: string,
  parentOptional = false
): TypeScriptInferredProp[] {
  if (element.dotDotDotToken) {
    const restName = bindingPropertyName(element.name);
    if (!restName) {
      return [];
    }
    const sourceOffset = paramsStart + Math.max(0, element.getStart(sourceFile) - prefixLength);
    const elementEnd = paramsStart + Math.max(0, element.end - prefixLength);
    const declaration = source.text.slice(sourceOffset, Math.min(source.text.length, elementEnd)).trim().replace(/,$/u, "");
    return [{
      name: parentName ? `${parentName}.${restName}` : restName,
      typeName: "object",
      optional: true,
      readonly: false,
      rest: true,
      range: rangeFromIndex(source.text, sourceOffset, Math.max(1, declaration.length)),
      declaration: declaration || `...${restName}`
    }];
  }

  const sourceName = element.propertyName ?? element.name;
  const name = bindingPropertyName(sourceName);
  if (!name) {
    return [];
  }

  const sourceOffset = paramsStart + Math.max(0, sourceName.getStart(sourceFile) - prefixLength);
  const elementEnd = paramsStart + Math.max(0, element.end - prefixLength);
  const declaration = source.text.slice(sourceOffset, Math.min(source.text.length, elementEnd)).trim().replace(/,$/u, "");
  const fullName = parentName ? `${parentName}.${name}` : name;
  const optional = parentOptional || Boolean(element.initializer);
  const prop: TypeScriptInferredProp = {
    name: fullName,
    typeName: inferredTypeFromBindingElement(element),
    optional,
    readonly: false,
    range: rangeFromIndex(source.text, sourceOffset, Math.max(1, declaration.length)),
    declaration: declaration || name
  };

  if (ts.isObjectBindingPattern(element.name)) {
    const nested = element.name.elements.flatMap((child) =>
      inferredPropsFromBindingElement(source, sourceFile, child, paramsStart, prefixLength, fullName, optional)
    );
    return [prop, ...nested];
  }

  return [prop];
}

function bindingPropertyName(node: ts.BindingName | ts.PropertyName): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function inferredTypeFromInitializer(initializer: ts.Expression | undefined): string {
  if (!initializer) {
    return "unknown";
  }
  if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) {
    return "string";
  }
  if (ts.isNumericLiteral(initializer)) {
    return "number";
  }
  if (initializer.kind === ts.SyntaxKind.TrueKeyword || initializer.kind === ts.SyntaxKind.FalseKeyword) {
    return "boolean";
  }
  if (ts.isArrayLiteralExpression(initializer)) {
    return "array";
  }
  if (ts.isObjectLiteralExpression(initializer)) {
    return "object";
  }
  return "unknown";
}

function inferredTypeFromBindingElement(element: ts.BindingElement): string {
  if (ts.isObjectBindingPattern(element.name)) {
    return "object";
  }
  if (ts.isArrayBindingPattern(element.name)) {
    return "array";
  }
  return inferredTypeFromInitializer(element.initializer);
}

function paramsStartFromMatch(match: IndexedMatch, groupIndex: number): number {
  const value = match[groupIndex];
  return value ? match.index + match[0].indexOf(value) : match.index;
}

function analyzeDeclarationBody(
  source: ReactSource,
  declaration: ReactDeclaration,
  declarationsByName: Map<string, ReactDeclaration[]>,
  membersByParentId: Map<string, ReactMember[]>,
  importsByFile: Map<string, ImportBinding[]>,
  reExportsByFile: Map<string, ImportBinding[]>,
  typeParameterIdsByName: Map<string, string>,
  result: WebAnalyzerResult
): void {
  if (declaration.propsType) {
    const propsDeclaration = resolvePropsDeclaration(declaration.propsType, declaration.file, declarationsByName, importsByFile, reExportsByFile);
    if (propsDeclaration) {
      result.relationships.push(relationship(declaration.id, propsDeclaration.id, "DECLARES_PROPS", declaration.file, declaration.range, declaration.declaration, 0.82));
      for (const member of membersForPropsDeclaration(propsDeclaration, declarationsByName, membersByParentId, importsByFile, reExportsByFile)) {
        result.relationships.push(relationship(declaration.id, member.id, "DECLARES_PROP", member.file, member.range, member.declaration, 0.78));
      }
    }
  }

  analyzeHookUsage(source, declaration, declarationsByName, importsByFile, reExportsByFile, result);
  analyzeContextUsage(source, declaration, declarationsByName, result, { relationship });
  analyzeComponentComposition(source, declaration, declarationsByName, membersByParentId, importsByFile, reExportsByFile, typeParameterIdsByName, result, emitJsxTypeArgumentEdges, { reference, relationship });
  analyzeKnownFunctionCalls(source, declaration, declarationsByName, importsByFile, reExportsByFile, result);
  analyzeApiCalls(source, declaration, result);
}

function analyzeHookUsage(
  source: ReactSource,
  declaration: ReactDeclaration,
  declarationsByName: Map<string, ReactDeclaration[]>,
  importsByFile: Map<string, ImportBinding[]>,
  reExportsByFile: Map<string, ImportBinding[]>,
  result: WebAnalyzerResult
): void {
  for (const match of matchAll(declaration.body, /\b(?:([A-Za-z_$][\w$]*)\.)?(use[A-Z][A-Za-z0-9_]*)\s*\(/g)) {
    const qualifier = match[1];
    const hookName = match[2];
    if (hookName === declaration.name) {
      continue;
    }
    const range = rangeFromIndex(source.text, declaration.bodyStart + match.index, match[0].length);
    const importedHook = resolveImportedDeclaration(source.file.path, hookName, qualifier, importsByFile, reExportsByFile, declarationsByName);
    const customStore = importedHook?.kind === "store" ? importedHook : declarationsByName.get(hookName)?.find((candidate) => candidate.kind === "store");
    if (customStore) {
      result.references.push(reference(qualifier ? `${qualifier}.${hookName}` : hookName, customStore.id, declaration.file, range, importedHook ? "react-imported-store-call" : "react-store-call", match[0], importedHook ? 0.9 : 0.88));
      result.relationships.push(relationship(declaration.id, customStore.id, "USES_STORE", declaration.file, range, match[0], importedHook ? 0.9 : 0.88));
      continue;
    }

    const customHook = importedHook?.kind === "hook" ? importedHook : declarationsByName.get(hookName)?.find((candidate) => candidate.kind === "hook");
    const target = customHook?.id ?? `react-hook:${hookName}`;
    const hookEvidence = importedHook ? `${match[0]} (import resolved)` : match[0];
    result.references.push(reference(qualifier ? `${qualifier}.${hookName}` : hookName, target, declaration.file, range, importedHook ? "react-imported-hook-call" : "react-hook-call", match[0], customHook ? 0.86 : 0.7));
    result.relationships.push(relationship(declaration.id, target, "USES_HOOK", declaration.file, range, hookEvidence, customHook ? 0.86 : 0.72));
  }
}

function analyzeKnownFunctionCalls(
  source: ReactSource,
  declaration: ReactDeclaration,
  declarationsByName: Map<string, ReactDeclaration[]>,
  importsByFile: Map<string, ImportBinding[]>,
  reExportsByFile: Map<string, ImportBinding[]>,
  result: WebAnalyzerResult
): void {
  for (const match of matchAll(declaration.body, /\b(?:([A-Za-z_$][\w$]*)\.)?([A-Za-z_$][\w$]*)\s*(?:<[^>\n]+>)?\s*\(/g)) {
    const qualifier = match[1];
    const callName = match[2];
    if (callName === declaration.name || ignoredCallNames.has(callName) || /^use[A-Z]/u.test(callName)) {
      continue;
    }
    const importedTarget = resolveImportedDeclaration(source.file.path, callName, qualifier, importsByFile, reExportsByFile, declarationsByName);
    const candidates = (declarationsByName.get(callName) ?? []).filter((candidate) => candidate.kind === "function" || candidate.kind === "hook" || candidate.kind === "component");
    const sameFileCandidates = candidates.filter((candidate) => candidate.file === declaration.file);
    const target = importedTarget ?? (qualifier ? undefined : sameFileCandidates.length === 1 ? sameFileCandidates[0] : candidates.length === 1 ? candidates[0] : undefined);
    if (!target || target.id === declaration.id) {
      continue;
    }

    const range = rangeFromIndex(source.text, declaration.bodyStart + match.index, match[0].length);
    if (importedTarget) {
      result.references.push(reference(qualifier ? `${qualifier}.${callName}` : callName, target.id, declaration.file, range, "react-imported-call", match[0], 0.84));
    }
    result.relationships.push(relationship(declaration.id, target.id, "CALLS", declaration.file, range, importedTarget ? `${match[0]} (import resolved)` : match[0], importedTarget ? 0.84 : 0.78));
  }
}

function resolveImportedDeclaration(
  filePath: string,
  name: string,
  qualifier: string | undefined,
  importsByFile: Map<string, ImportBinding[]>,
  reExportsByFile: Map<string, ImportBinding[]>,
  declarationsByName: Map<string, ReactDeclaration[]>
): ReactDeclaration | undefined {
  const importBinding = importsByFile.get(filePath)?.find((binding) =>
    !binding.typeOnly &&
    (qualifier ? binding.name === qualifier && binding.importStyle === "namespace" : binding.name === name)
  );
  if (!importBinding?.resolvedFile) {
    return undefined;
  }

  const lookupBinding = qualifier ? { ...importBinding, name, importedName: name } : importBinding;
  const barrelTarget = resolveReExportedFile(lookupBinding, reExportsByFile);
  const targetFile = barrelTarget ?? importBinding.resolvedFile;
  for (const declarationName of declarationNamesForImport(name, lookupBinding)) {
    const target = (declarationsByName.get(declarationName) ?? [])
      .filter((candidate) => candidate.kind === "function" || candidate.kind === "hook" || candidate.kind === "component")
      .find((candidate) => candidate.file === targetFile);
    if (target) {
      return target;
    }
  }
  return undefined;
}

function emitTypeReferenceEdges(
  fromId: string,
  typeText: string | undefined,
  file: string,
  range: SourceRange,
  declarationsByName: Map<string, ReactDeclaration[]>,
  typeParameterIdsByName: Map<string, string>,
  result: WebAnalyzerResult,
  referenceContext: string
): void {
  if (!typeText) {
    return;
  }

  for (const identifier of typeIdentifiers(typeText)) {
    const declarationTarget = declarationsByName.get(identifier)?.find((candidate) =>
      candidate.kind === "props" ||
      candidate.kind === "interface" ||
      candidate.kind === "type" ||
      candidate.kind === "enum"
    );
    const parentId = parentDeclarationId(fromId);
    const targetId = declarationTarget?.id ?? typeParameterIdsByName.get(`${parentId}:${identifier}`);
    if (!targetId || targetId === fromId) {
      continue;
    }

    result.references.push(reference(identifier, targetId, file, range, referenceContext, typeText, declarationTarget ? 0.78 : 0.72));
    result.relationships.push(relationship(fromId, targetId, "REFERENCES_TYPE", file, range, typeText, declarationTarget ? 0.78 : 0.72));
  }
}

function emitGenericTypeArgumentEdges(
  fromId: string,
  typeText: string | undefined,
  file: string,
  range: SourceRange,
  declarationsByName: Map<string, ReactDeclaration[]>,
  typeParameterIdsByName: Map<string, string>,
  result: WebAnalyzerResult
): void {
  if (!typeText) {
    return;
  }

  const parentId = parentDeclarationId(fromId);
  for (const match of matchAll(typeText, /\b([A-Z_$][A-Za-z0-9_$]*)\s*<([^<>]+)>/g)) {
    const genericName = match[1];
    const genericTarget = declarationsByName.get(genericName)?.find((candidate) =>
      candidate.kind === "props" ||
      candidate.kind === "interface" ||
      candidate.kind === "type" ||
      candidate.kind === "enum"
    );
    if (genericTarget && genericTarget.id !== fromId) {
      result.relationships.push(relationship(fromId, genericTarget.id, "USES_GENERIC_TYPE", file, range, match[0], 0.74));
    }

    for (const argument of splitTopLevelGenericArgs(match[2])) {
      for (const identifier of typeIdentifiers(argument)) {
        const argumentTarget = declarationsByName.get(identifier)?.find((candidate) =>
          candidate.kind === "props" ||
          candidate.kind === "interface" ||
          candidate.kind === "type" ||
          candidate.kind === "enum"
        );
        const targetId = argumentTarget?.id ?? typeParameterIdsByName.get(`${parentId}:${identifier}`);
        if (!targetId || targetId === fromId) {
          continue;
        }
        result.references.push(reference(identifier, targetId, file, range, "typescript-generic-argument", match[0], argumentTarget ? 0.76 : 0.72));
        result.relationships.push(relationship(fromId, targetId, "USES_TYPE_ARGUMENT", file, range, match[0], argumentTarget ? 0.76 : 0.72));
      }
    }
  }
}

function emitJsxTypeArgumentEdges(
  fromId: string,
  typeArguments: string | undefined,
  file: string,
  range: SourceRange,
  declarationsByName: Map<string, ReactDeclaration[]>,
  typeParameterIdsByName: Map<string, string>,
  result: WebAnalyzerResult
): void {
  if (!typeArguments) {
    return;
  }

  const parentId = parentDeclarationId(fromId);
  for (const argument of splitTopLevelGenericArgs(typeArguments)) {
    for (const identifier of typeIdentifiers(argument)) {
      const argumentTarget = declarationsByName.get(identifier)?.find((candidate) =>
        candidate.kind === "props" ||
        candidate.kind === "interface" ||
        candidate.kind === "type" ||
        candidate.kind === "enum"
      );
      const targetId = argumentTarget?.id ?? typeParameterIdsByName.get(`${parentId}:${identifier}`);
      if (!targetId || targetId === fromId) {
        continue;
      }
      result.references.push(reference(identifier, targetId, file, range, "jsx-type-argument", typeArguments, argumentTarget ? 0.76 : 0.72));
      result.relationships.push(relationship(fromId, targetId, "USES_TYPE_ARGUMENT", file, range, `<${typeArguments}>`, argumentTarget ? 0.76 : 0.72));
    }
  }
}

function parentDeclarationId(fromId: string): string {
  if (fromId.includes(":type-parameter:")) {
    return fromId.slice(0, fromId.lastIndexOf(":type-parameter:"));
  }
  if (isReactDeclarationId(fromId)) {
    return fromId;
  }
  if (fromId.includes(".")) {
    return fromId.slice(0, fromId.lastIndexOf("."));
  }
  return fromId;
}

function isReactDeclarationId(value: string): boolean {
  const markers = [
    ":component:",
    ":hook:",
    ":store:",
    ":context:",
    ":function:",
    ":props:",
    ":interface:",
    ":type:",
    ":enum:",
    ":route:"
  ];
  for (const marker of markers) {
    const index = value.lastIndexOf(marker);
    if (index < 0) {
      continue;
    }
    const tail = value.slice(index + marker.length);
    return !tail.includes(".") && !tail.includes(":");
  }
  return false;
}

function typeIdentifiers(typeText: string): string[] {
  const ignored = new Set([
    "Array",
    "Date",
    "Promise",
    "Record",
    "Readonly",
    "Partial",
    "Pick",
    "Omit",
    "string",
    "number",
    "boolean",
    "undefined",
    "null",
    "void",
    "extends",
    "typeof"
  ]);
  const names = matchAll(typeText, /\b[A-Z_$][A-Za-z0-9_$]*\b/g)
    .map((match) => match[0])
    .filter((name) => !ignored.has(name));
  return [...new Set(names)];
}

function analyzeApiCalls(source: ReactSource, declaration: ReactDeclaration, result: WebAnalyzerResult): void {
  const routeVariables = new Map<string, string>();
  for (const match of matchAll(declaration.body, /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'`])(\/api\/[^"'`]+)\2/g)) {
    routeVariables.set(match[1], match[3].replace(/\$\{[^}]+\}/gu, ":param"));
  }

  for (const match of matchAll(declaration.body, /\b(?:fetch|[A-Za-z_$][\w$]*)\s*(?:<[^>\n]+>)?\s*\(\s*(["'`])(\/api\/[^"'`]+)\1/g)) {
    const route = match[2].replace(/\$\{[^}]+\}/gu, ":param");
    const range = rangeFromIndex(source.text, declaration.bodyStart + match.index, match[0].length);
    result.relationships.push(relationship(declaration.id, routeTargetId(route), "CALLS_API_ROUTE", declaration.file, range, match[0], 0.82));
  }

  for (const [variable, route] of routeVariables) {
    const pattern = new RegExp(`\\b(?:fetch|[A-Za-z_$][\\w$]*)\\s*(?:<[^>\\n]+>)?\\s*\\(\\s*${escapeRegExp(variable)}\\b`, "g");
    for (const match of matchAll(declaration.body, pattern)) {
      const range = rangeFromIndex(source.text, declaration.bodyStart + match.index, match[0].length);
      result.relationships.push(relationship(declaration.id, routeTargetId(route), "CALLS_API_ROUTE", declaration.file, range, match[0], 0.78));
    }
  }
}

function confidenceForDeclaration(declaration: ReactDeclaration): number {
  switch (declaration.kind) {
    case "component":
    case "hook":
    case "store":
    case "context":
      return 0.9;
    case "route":
      return 0.86;
    case "function":
      return declaration.file.toLowerCase().includes("/services/") ? 0.86 : 0.78;
    default:
      return 0.76;
  }
}

function patternsForDeclaration(declaration: ReactDeclaration): string[] {
  const patterns: string[] = [];
  switch (declaration.kind) {
    case "component":
      patterns.push("react-component");
      break;
    case "hook":
      patterns.push("react-hook");
      break;
    case "store":
      patterns.push("react-state-store", "react-hook");
      break;
    case "context":
      patterns.push("react-context");
      break;
    case "props":
      patterns.push("react-props");
      break;
    case "interface":
      patterns.push("typescript-interface", "typescript-semantic-type");
      break;
    case "type":
      patterns.push("typescript-type-alias", "typescript-semantic-type");
      if (declaration.unionVariants?.length) {
        patterns.push("typescript-discriminated-union");
      }
      break;
    case "enum":
      patterns.push("typescript-enum", "typescript-semantic-type");
      break;
    case "route":
      patterns.push("react-route");
      break;
    case "function":
      patterns.push(declaration.file.toLowerCase().includes("/services/") ? "client-service" : "react-function");
      break;
    default:
      patterns.push("typescript-symbol");
  }

  if (declaration.runtime === "client") {
    patterns.push(declaration.kind === "component" ? "react-client-component" : "react-client-code");
  } else if (declaration.runtime === "server-action") {
    patterns.push("react-server-action");
  } else if (declaration.runtime === "server-component") {
    patterns.push("react-server-component");
  }

  if (declaration.exported && isTypeContractDeclaration(declaration)) {
    patterns.push("typescript-exported-contract");
    if (isApiContractFile(declaration.file)) {
      patterns.push("typescript-api-contract");
    }
  }

  return patterns;
}

function isTypeContractDeclaration(declaration: ReactDeclaration): boolean {
  return declaration.kind === "props" || declaration.kind === "interface" || declaration.kind === "type" || declaration.kind === "enum";
}

function isApiContractFile(filePath: string): boolean {
  return /(^|\/)(api|services?|types)(\/|$)/iu.test(filePath.replace(/\\/g, "/"));
}

function patternsForMember(member: ReactMember): string[] {
  if (member.kind === "enum-member") {
    return ["typescript-enum-member"];
  }
  if (member.parentId.includes(":props:")) {
    return member.indexSignature
      ? ["react-prop-member", "typescript-property", "typescript-index-signature"]
      : ["react-prop-member", "typescript-property"];
  }
  return member.indexSignature ? ["typescript-member", "typescript-index-signature"] : ["typescript-member"];
}

function symbol(
  id: string,
  name: string,
  fullyQualifiedName: string,
  language: string,
  kind: string,
  file: string,
  range: SourceRange,
  confidence: number,
  patterns: string[] = [],
  summary?: string
): SymbolRecord {
  const record: SymbolRecord = { recordType: "symbol", id, name, fullyQualifiedName, kind, language, file, range, patterns, confidence };
  if (summary) {
    record.summary = summary;
  }
  return record;
}

function reference(symbolName: string, resolvedSymbolId: string, file: string, range: SourceRange, context: string, snippet: string, confidence: number): ReferenceRecord {
  return {
    recordType: "reference",
    id: `reference:react:${file}:${range.startLine}:${slug(symbolName)}:${slug(context)}`,
    symbolName,
    resolvedSymbolId,
    file,
    range,
    context,
    snippet,
    confidence
  };
}

function relationship(from: string, to: string, type: string, file: string, range: SourceRange, evidence: string, confidence: number): RelationshipRecord {
  return {
    recordType: "relationship",
    id: `relationship:${type.toLowerCase()}:react:${slug(from)}->${slug(to)}:${range.startLine}:${range.startColumn}`,
    from,
    to,
    type,
    file,
    range,
    evidence,
    confidence
  };
}

function memberSummary(member: ReactMember): string {
  return [
    `type: ${member.typeName ?? "unknown"}`,
    member.optional ? "optional" : "required",
    member.readonly ? "readonly" : undefined,
    member.rest ? "rest" : undefined,
    member.indexSignature ? `index: ${member.keyType ?? "unknown"}` : undefined
  ].filter(Boolean).join("; ");
}
