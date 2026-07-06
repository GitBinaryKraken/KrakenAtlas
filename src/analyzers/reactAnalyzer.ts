import * as path from "path";
import * as ts from "typescript";
import { FileRecord, ReferenceRecord, RelationshipRecord, SourceRange, SymbolRecord } from "../model/records";
import { rangeFromIndex } from "./textLocation";
import { resolveTypeScriptModuleFile, TypeScriptProjectContext } from "./typescriptProjectAnalyzer";
import { WebAnalyzerResult } from "./webAnalyzerTypes";

export interface ReactSource {
  file: FileRecord;
  text: string;
}

interface ReactDeclaration {
  id: string;
  name: string;
  kind: "component" | "hook" | "store" | "context" | "function" | "props" | "interface" | "type" | "enum" | "route";
  file: string;
  language: string;
  range: SourceRange;
  start: number;
  bodyStart: number;
  end: number;
  declaration: string;
  body: string;
  propsType?: string;
  runtime?: "client" | "server-action" | "server-component";
  exported?: boolean;
  typeParameters?: TypeScriptTypeParameter[];
  unionVariants?: TypeScriptUnionVariant[];
  componentPropsType?: string;
  extendsTypes?: string[];
  propUtilities?: TypeScriptPropUtility[];
  inferredProps?: TypeScriptInferredProp[];
}

interface TypeScriptPropUtility {
  utility: "Pick" | "Omit" | "Partial" | "Required" | "Readonly" | "Record" | "Mapped";
  targetType?: string;
  keys?: string[];
  keyType?: string;
  valueType?: string;
  optional?: boolean;
}

interface TypeScriptInferredProp {
  name: string;
  typeName: string;
  optional: boolean;
  readonly: boolean;
  rest?: boolean;
  range: SourceRange;
  declaration: string;
}

interface TypeScriptTypeParameter {
  name: string;
  summary: string;
  range: SourceRange;
  declaration: string;
}

interface TypeScriptUnionVariant {
  name: string;
  discriminator: string;
  range: SourceRange;
  declaration: string;
  variantKind: "discriminated-object" | "literal";
}

interface ImportBinding {
  name: string;
  importedName?: string;
  source: string;
  resolvedFile?: string;
  resolution?: "typescript" | "convention";
  range: SourceRange;
  snippet: string;
  kind: "import" | "re-export";
  importStyle: "default" | "named" | "namespace";
  typeOnly: boolean;
}

interface ImportSpecifier {
  name: string;
  importedName?: string;
  importStyle: ImportBinding["importStyle"];
  typeOnly: boolean;
}

interface ReactMember {
  id: string;
  parentId: string;
  parentName: string;
  name: string;
  kind: "property" | "enum-member";
  file: string;
  language: string;
  range: SourceRange;
  declaration: string;
  typeName?: string;
  optional: boolean;
  readonly: boolean;
  rest?: boolean;
}

const reactExtensions = new Set([".jsx", ".tsx", ".ts"]);
const ignoredJsxAttributes = new Set(["key", "className", "aria-label", "aria-current", "role", "type", "title"]);
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
      analyzeDeclarationBody(source, declaration, declarationsByName, membersByParentId, importsByFile, reExportsByFile, result);
    }
    analyzeRoutes(source, fileDeclarations, declarationsByName, result);
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

function resolveReExportedFile(
  importBinding: ImportBinding,
  reExportsByFile: Map<string, ImportBinding[]>,
  visited = new Set<string>()
): string | undefined {
  if (!importBinding.resolvedFile || visited.has(importBinding.resolvedFile)) {
    return undefined;
  }

  visited.add(importBinding.resolvedFile);
  const reExports = reExportsByFile.get(importBinding.resolvedFile) ?? [];
  const requestedName = importBinding.importedName ?? importBinding.name;
  const match = reExports.find((reExport) =>
    reExport.name === importBinding.name ||
    reExport.name === requestedName ||
    reExport.name === "*" ||
    (importBinding.importStyle === "default" && reExport.name === "default")
  );
  if (!match?.resolvedFile) {
    return undefined;
  }

  return resolveReExportedFile(match, reExportsByFile, visited) ?? match.resolvedFile;
}

function declarationNamesForImport(name: string, importBinding: ImportBinding | undefined): string[] {
  const names = [importBinding?.importedName, name].filter((candidate): candidate is string => Boolean(candidate) && candidate !== "*" && candidate !== "default");
  return [...new Set(names)];
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

function discoverTypeScriptDeclarations(source: ReactSource): ReactDeclaration[] {
  if (source.file.extension === ".jsx") {
    return [];
  }

  const sourceFile = ts.createSourceFile(source.file.path, source.text, ts.ScriptTarget.Latest, true, source.file.extension === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const declarations: ReactDeclaration[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement)) {
      const name = statement.name.text;
      const openBrace = source.text.indexOf("{", statement.name.end);
      const closeBrace = findMatchingBrace(source.text, openBrace);
      if (openBrace < 0 || closeBrace < 0) {
        continue;
      }
      declarations.push(typeScriptDeclaration(source, sourceFile, name, name.endsWith("Props") ? "props" : "interface", statement, openBrace, closeBrace, "compiler: interface"));
    } else if (ts.isTypeAliasDeclaration(statement)) {
      const name = statement.name.text;
      if (ts.isTypeLiteralNode(statement.type)) {
        const openBrace = source.text.indexOf("{", statement.name.end);
        const closeBrace = findMatchingBrace(source.text, openBrace);
        if (openBrace < 0 || closeBrace < 0) {
          continue;
        }
        declarations.push(typeScriptDeclaration(source, sourceFile, name, name.endsWith("Props") ? "props" : "interface", statement, openBrace, closeBrace, "compiler: type-literal"));
      } else {
        const typeLiteral = firstTypeLiteralNode(statement.type);
        if (name.endsWith("Props") && typeLiteral) {
          const openBrace = source.text.indexOf("{", typeLiteral.getStart(sourceFile));
          const closeBrace = findMatchingBrace(source.text, openBrace);
          if (openBrace >= 0 && closeBrace >= 0) {
            declarations.push(typeScriptDeclaration(source, sourceFile, name, "props", statement, openBrace, closeBrace, `compiler: type-literal intersection; type: ${statement.type.getText(sourceFile)}`));
            continue;
          }
        }
        if (name.endsWith("Props") && propUtilitiesFromTypeNode(sourceFile, statement.type).length) {
          declarations.push(typeScriptDeclaration(source, sourceFile, name, "props", statement, statement.getStart(sourceFile), statement.end - 1, `compiler: utility props; type: ${statement.type.getText(sourceFile)}`));
          continue;
        }
        declarations.push(typeScriptDeclaration(source, sourceFile, name, "type", statement, statement.getStart(sourceFile), statement.end, `compiler: type-alias; type: ${statement.type.getText(sourceFile)}`));
      }
    } else if (ts.isEnumDeclaration(statement)) {
      const name = statement.name.text;
      const openBrace = source.text.indexOf("{", statement.name.end);
      const closeBrace = findMatchingBrace(source.text, openBrace);
      if (openBrace < 0 || closeBrace < 0) {
        continue;
      }
      declarations.push(typeScriptDeclaration(source, sourceFile, name, "enum", statement, openBrace, closeBrace, "compiler: enum"));
    }
  }

  return declarations;
}

function firstTypeLiteralNode(node: ts.TypeNode): ts.TypeLiteralNode | undefined {
  if (ts.isTypeLiteralNode(node)) {
    if (node.members.some((member) => ts.isMappedTypeNode(member))) {
      return undefined;
    }
    return node;
  }
  if (ts.isIntersectionTypeNode(node) || ts.isUnionTypeNode(node)) {
    for (const child of node.types) {
      const literal = firstTypeLiteralNode(child);
      if (literal) {
        return literal;
      }
    }
  }
  if (ts.isParenthesizedTypeNode(node)) {
    return firstTypeLiteralNode(node.type);
  }
  return undefined;
}

function typeScriptDeclaration(
  source: ReactSource,
  sourceFile: ts.SourceFile,
  name: string,
  kind: ReactDeclaration["kind"],
  node: ts.Node,
  bodyStartToken: number,
  bodyEndToken: number,
  summary: string
): ReactDeclaration {
  const start = node.getStart();
  const end = kind === "type" ? node.end : bodyEndToken + 1;
  const bodyStart = kind === "type" ? node.getStart() : bodyStartToken + 1;
  const declarationText = kind === "type"
    ? source.text.slice(start, end).trim()
    : source.text.slice(start, Math.min(end, bodyStartToken + 1)).trim();
  return {
    id: reactDeclarationId(source.file.path, kind, name),
    name,
    kind,
    file: source.file.path,
    language: source.file.language,
    range: rangeFromIndex(source.text, start, end - start),
    start,
    bodyStart,
    end,
    declaration: declarationText,
    body: kind === "type" ? source.text.slice(start, end) : source.text.slice(bodyStartToken + 1, bodyEndToken),
    propsType: summary,
    exported: isExportedNode(node),
    typeParameters: typeParametersFromNode(source, sourceFile, node),
    unionVariants: ts.isTypeAliasDeclaration(node) ? discriminatedUnionVariants(source, sourceFile, node.type) : []
    ,
    componentPropsType: ts.isTypeAliasDeclaration(node) ? componentPropsTypeFromTypeNode(sourceFile, node.type) : undefined,
    extendsTypes: inheritedTypesFromNode(sourceFile, node),
    propUtilities: ts.isTypeAliasDeclaration(node) ? propUtilitiesFromTypeNode(sourceFile, node.type) : []
  };
}

function inheritedTypesFromNode(sourceFile: ts.SourceFile, node: ts.Node): string[] {
  if (ts.isInterfaceDeclaration(node)) {
    return (node.heritageClauses ?? [])
      .filter((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
      .flatMap((clause) => clause.types.map((type) => type.expression.getText(sourceFile)))
      .map(cleanHeritageTypeName)
      .filter((name): name is string => Boolean(name));
  }

  if (ts.isTypeAliasDeclaration(node) && ts.isIntersectionTypeNode(node.type)) {
    return node.type.types
      .map((type) => type.getText(sourceFile))
      .map(cleanHeritageTypeName)
      .filter((name): name is string => Boolean(name));
  }

  return [];
}

function cleanHeritageTypeName(value: string): string | undefined {
  const simple = simpleTypeName(value);
  return simple?.endsWith("Props") ? simple : undefined;
}

function propUtilitiesFromTypeNode(sourceFile: ts.SourceFile, node: ts.TypeNode): TypeScriptPropUtility[] {
  if (ts.isIntersectionTypeNode(node) || ts.isUnionTypeNode(node)) {
    return node.types.flatMap((child) => propUtilitiesFromTypeNode(sourceFile, child));
  }
  if (ts.isParenthesizedTypeNode(node)) {
    return propUtilitiesFromTypeNode(sourceFile, node.type);
  }
  if (ts.isMappedTypeNode(node)) {
    const keys = propUtilityKeysFromTypeNode(sourceFile, node.typeParameter.constraint);
    const keyType = propUtilityKeyTypeFromTypeNode(sourceFile, node.typeParameter.constraint);
    return keys?.length || keyType ? [{
      utility: "Mapped",
      keys,
      keyType,
      valueType: node.type?.getText(sourceFile) ?? "unknown",
      optional: Boolean(node.questionToken)
    }] : [];
  }
  if (!ts.isTypeReferenceNode(node)) {
    return [];
  }

  const utility = propUtilityName(node.typeName.getText(sourceFile));
  if (!utility || !node.typeArguments?.length) {
    return [];
  }

  if (utility === "Record") {
    const keys = propUtilityKeysFromTypeNode(sourceFile, node.typeArguments[0]);
    const keyType = propUtilityKeyTypeFromTypeNode(sourceFile, node.typeArguments[0]);
    return keys?.length || keyType ? [{
      utility,
      keys,
      keyType,
      valueType: node.typeArguments[1]?.getText(sourceFile) ?? "unknown",
      optional: false
    }] : [];
  }

  const targetType = cleanHeritageTypeName(node.typeArguments[0].getText(sourceFile));
  if (!targetType) {
    return [];
  }

  return [{
    utility,
    targetType,
    keys: propUtilityKeysFromTypeNode(sourceFile, node.typeArguments[1])
  }];
}

function propUtilityName(typeName: string): TypeScriptPropUtility["utility"] | undefined {
  const simple = typeName.split(".").pop();
  return simple === "Pick" || simple === "Omit" || simple === "Partial" || simple === "Required" || simple === "Readonly" || simple === "Record"
    ? simple
    : undefined;
}

function propUtilityKeysFromTypeNode(sourceFile: ts.SourceFile, node: ts.TypeNode | undefined): string[] | undefined {
  if (!node) {
    return undefined;
  }
  if (ts.isUnionTypeNode(node)) {
    return node.types.flatMap((child) => propUtilityKeysFromTypeNode(sourceFile, child) ?? []);
  }
  if (ts.isLiteralTypeNode(node)) {
    const literal = node.literal;
    if (ts.isStringLiteral(literal) || ts.isNumericLiteral(literal)) {
      return [literal.text];
    }
  }
  return undefined;
}

function propUtilityKeyTypeFromTypeNode(sourceFile: ts.SourceFile, node: ts.TypeNode | undefined): string | undefined {
  return node && ts.isTypeReferenceNode(node) ? simpleTypeName(node.getText(sourceFile)) : undefined;
}

function componentPropsTypeFromTypeNode(sourceFile: ts.SourceFile, node: ts.TypeNode): string | undefined {
  if (ts.isTypeReferenceNode(node)) {
    const typeName = node.typeName.getText(sourceFile);
    if (typeName === "ComponentProps" || typeName === "React.ComponentProps") {
      const arg = node.typeArguments?.[0];
      if (arg && ts.isTypeQueryNode(arg) && ts.isIdentifier(arg.exprName)) {
        return arg.exprName.text;
      }
    }
  }
  if (ts.isIntersectionTypeNode(node) || ts.isUnionTypeNode(node)) {
    return node.types.map((child) => componentPropsTypeFromTypeNode(sourceFile, child)).find(Boolean);
  }
  if (ts.isParenthesizedTypeNode(node)) {
    return componentPropsTypeFromTypeNode(sourceFile, node.type);
  }
  return undefined;
}

function isExportedNode(node: ts.Node): boolean {
  return Boolean(ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export);
}

function typeParametersFromNode(source: ReactSource, sourceFile: ts.SourceFile, node: ts.Node): TypeScriptTypeParameter[] {
  const typeParameters = "typeParameters" in node ? node.typeParameters : undefined;
  if (!typeParameters || !Array.isArray(typeParameters)) {
    return [];
  }

  return typeParameters.map((parameter) => {
    const name = parameter.name.text;
    const constraint = parameter.constraint?.getText(sourceFile);
    const defaultType = parameter.default?.getText(sourceFile);
    const summary = [
      constraint ? `constraint: ${constraint}` : undefined,
      defaultType ? `default: ${defaultType}` : undefined
    ].filter(Boolean).join("; ");
    return {
      name,
      summary,
      range: rangeFromIndex(source.text, parameter.getStart(sourceFile), parameter.end - parameter.getStart(sourceFile)),
      declaration: parameter.getText(sourceFile)
    };
  });
}

function discriminatedUnionVariants(source: ReactSource, sourceFile: ts.SourceFile, node: ts.TypeNode): TypeScriptUnionVariant[] {
  if (!ts.isUnionTypeNode(node)) {
    return [];
  }

  const variants: TypeScriptUnionVariant[] = [];
  for (const unionMember of node.types) {
    const typeLiteral = ts.isTypeLiteralNode(unionMember) ? unionMember : undefined;
    if (!typeLiteral) {
      if (ts.isLiteralTypeNode(unionMember)) {
        const literalValue = unionMember.literal.getText(sourceFile);
        variants.push({
          name: `literal:${literalValue}`,
          discriminator: "literal",
          range: rangeFromIndex(source.text, unionMember.getStart(sourceFile), unionMember.end - unionMember.getStart(sourceFile)),
          declaration: unionMember.getText(sourceFile),
          variantKind: "literal"
        });
      }
      continue;
    }

    const discriminator = discriminantFromTypeLiteral(sourceFile, typeLiteral);
    if (!discriminator) {
      continue;
    }

    variants.push({
      name: `${discriminator.property}:${discriminator.value}`,
      discriminator: discriminator.property,
      range: rangeFromIndex(source.text, typeLiteral.getStart(sourceFile), typeLiteral.end - typeLiteral.getStart(sourceFile)),
      declaration: typeLiteral.getText(sourceFile),
      variantKind: "discriminated-object"
    });
  }
  return variants;
}

function discriminantFromTypeLiteral(sourceFile: ts.SourceFile, node: ts.TypeLiteralNode): { property: string; value: string } | undefined {
  for (const member of node.members) {
    if (!ts.isPropertySignature(member) || !member.type || !ts.isLiteralTypeNode(member.type)) {
      continue;
    }
    const name = ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) ? member.name.text : undefined;
    const literal = member.type.literal;
    const value = ts.isStringLiteral(literal) || ts.isNumericLiteral(literal) ? literal.getText(sourceFile) : undefined;
    if (name && value) {
      return { property: name, value };
    }
  }
  return undefined;
}

function discoverInterfaceMembers(source: ReactSource, declaration: ReactDeclaration): ReactMember[] {
  if (declaration.kind === "enum") {
    return discoverEnumMembers(source, declaration);
  }
  if (declaration.kind !== "props" && declaration.kind !== "interface") {
    return [];
  }
  if (declaration.inferredProps?.length) {
    return declaration.inferredProps.map((prop) => inferredPropMember(declaration, prop));
  }

  const members: ReactMember[] = [];
  const seen = new Set<string>();
  for (const match of matchAll(declaration.body, /(^|[;\n])\s*(readonly\s+)?([A-Za-z_$][\w$]*)(\?)?\s*:\s*([^;\n]+)/g)) {
    const name = match[3];
    const textAfterBoundary = match[0].slice(match[1].length);
    const offsetWithinMatch = textAfterBoundary.search(/\S/u);
    const memberBodyOffset = match.index + match[1].length + Math.max(0, offsetWithinMatch);
    if (braceDepthAt(declaration.body, memberBodyOffset) !== 0) {
      continue;
    }

    if (seen.has(name)) {
      continue;
    }

    const snippet = textAfterBoundary.trim();
    const snippetStart = declaration.bodyStart + memberBodyOffset;
    const typeName = cleanTypeName(match[5]);
    members.push(reactMember(source, declaration, name, snippet, snippetStart, typeName, Boolean(match[4]), Boolean(match[2])));
    members.push(...discoverNestedObjectMembers(source, declaration, name, match, Boolean(match[4]), Boolean(match[2])));
    seen.add(name);
  }

  return members;
}

function inferredPropMember(declaration: ReactDeclaration, prop: TypeScriptInferredProp): ReactMember {
  return {
    id: `${declaration.id}.${slug(prop.name)}`,
    parentId: declaration.id,
    parentName: declaration.name,
    name: prop.name,
    kind: "property",
    file: declaration.file,
    language: declaration.language,
    range: prop.range,
    declaration: prop.declaration,
    typeName: prop.typeName,
    optional: prop.optional,
    readonly: prop.readonly,
    rest: prop.rest
  };
}

function discoverEnumMembers(source: ReactSource, declaration: ReactDeclaration): ReactMember[] {
  const members: ReactMember[] = [];
  const seen = new Set<string>();
  for (const match of matchAll(declaration.body, /(^|[,\n])\s*([A-Za-z_$][\w$]*)(?:\s*=\s*([^,\n]+))?/g)) {
    const name = match[2];
    const textAfterBoundary = match[0].slice(match[1].length);
    const offsetWithinMatch = textAfterBoundary.search(/\S/u);
    const memberBodyOffset = match.index + match[1].length + Math.max(0, offsetWithinMatch);
    if (braceDepthAt(declaration.body, memberBodyOffset) !== 0 || seen.has(name)) {
      continue;
    }

    const snippet = textAfterBoundary.trim().replace(/,$/u, "");
    const snippetStart = declaration.bodyStart + memberBodyOffset;
    const initializer = match[3]?.trim().replace(/,$/u, "");
    members.push(reactMember(source, declaration, name, snippet, snippetStart, initializer, false, true, "enum-member"));
    seen.add(name);
  }
  return members;
}

function discoverNestedObjectMembers(
  source: ReactSource,
  declaration: ReactDeclaration,
  parentName: string,
  parentMatch: IndexedMatch,
  parentOptional: boolean,
  parentReadonly: boolean
): ReactMember[] {
  const nestedMembers: ReactMember[] = [];
  const openBraceInMatch = parentMatch[0].lastIndexOf("{");
  if (openBraceInMatch < 0) {
    return nestedMembers;
  }

  const openBrace = parentMatch.index + openBraceInMatch;
  const closeBrace = findMatchingBrace(declaration.body, openBrace);
  if (closeBrace < 0) {
    return nestedMembers;
  }

  const nestedBody = declaration.body.slice(openBrace + 1, closeBrace);
  const seen = new Set<string>();
  for (const match of matchAll(nestedBody, /(^|[;\n])\s*(readonly\s+)?([A-Za-z_$][\w$]*)(\?)?\s*:\s*([^;\n]+)/g)) {
    const nestedName = match[3];
    const textAfterBoundary = match[0].slice(match[1].length);
    const offsetWithinMatch = textAfterBoundary.search(/\S/u);
    const nestedOffset = match.index + match[1].length + Math.max(0, offsetWithinMatch);
    if (braceDepthAt(nestedBody, nestedOffset) !== 0 || seen.has(nestedName)) {
      continue;
    }

    const fullName = `${parentName}.${nestedName}`;
    const snippet = textAfterBoundary.trim();
    const snippetStart = declaration.bodyStart + openBrace + 1 + nestedOffset;
    const typeName = cleanTypeName(match[5]);
    nestedMembers.push(reactMember(
      source,
      declaration,
      fullName,
      snippet,
      snippetStart,
      typeName,
      parentOptional || Boolean(match[4]),
      parentReadonly || Boolean(match[2])
    ));
    seen.add(nestedName);
  }

  return nestedMembers;
}

function reactMember(
  source: ReactSource,
  declaration: ReactDeclaration,
  name: string,
  snippet: string,
  snippetStart: number,
  typeName: string | undefined,
  optional: boolean,
  readonly: boolean,
  kind: ReactMember["kind"] = "property"
): ReactMember {
  return {
    id: `${declaration.id}.${slug(name)}`,
    parentId: declaration.id,
    parentName: declaration.name,
    name,
    kind,
    file: declaration.file,
    language: declaration.language,
    range: rangeFromIndex(source.text, snippetStart, snippet.length),
    declaration: snippet,
    typeName,
    optional,
    readonly
  };
}

function discoverContexts(source: ReactSource): ReactDeclaration[] {
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

function discoverFunctions(source: ReactSource): ReactDeclaration[] {
  const declarations: ReactDeclaration[] = [];
  const seen = new Set<string>();
  const functionPattern = /\b(?:export\s+default\s+|export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?::\s*(?:[^{}]|\{[^{}]*\})+)?\{/g;
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
    const inferredProps = kind === "component" && !explicitPropsType ? inferredPropsFromParameters(source, match[2], paramsStartFromMatch(match, 2)) : [];
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
      exported: /\bexport\b/u.test(match[0])
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

function discoverRoutes(source: ReactSource): ReactDeclaration[] {
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

function isNextAppSourceFile(filePath: string): boolean {
  return /(?:^|\/)app\/.+\.(?:tsx|jsx|ts|js)$/iu.test(filePath.replace(/\\/g, "/"));
}

function hasUseDirective(text: string, directive: "client" | "server"): boolean {
  const trimmed = text.replace(/^\uFEFF/u, "").trimStart();
  return new RegExp(`^["']use ${directive}["'];?`, "u").test(trimmed);
}

function routePathFromSegments(segments: string[]): string {
  const routeSegments = segments
    .filter((segment) => segment && !segment.startsWith("(") && !segment.startsWith("@"))
    .map((segment) => {
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

function functionKind(filePath: string, name: string, body: string): ReactDeclaration["kind"] {
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

function isReactStoreFunction(filePath: string, name: string, body: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();
  return /(^|\/)(stores?|state)(\/|$)/u.test(normalizedPath) && /^use[A-Z].*Store$/u.test(name)
    || /^use[A-Z].*Store$/u.test(name)
    || /\buseSyncExternalStore\s*\(/u.test(body);
}

function propsTypeFromDeclaration(declaration: string): string | undefined {
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

function propsTypeFromWrapper(wrapperName: string, genericText: string | undefined, declaration: string): string | undefined {
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

function splitTopLevelGenericArgs(value: string): string[] {
  const args: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "<") {
      depth += 1;
    } else if (char === ">") {
      depth = Math.max(0, depth - 1);
    } else if (char === "," && depth === 0) {
      args.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  args.push(value.slice(start).trim());
  return args.filter(Boolean);
}

function simpleTypeName(value: string | undefined): string | undefined {
  return value?.trim().match(/^([A-Za-z_$][\w$]*)\b/u)?.[1];
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

function analyzeDeclarationBody(
  source: ReactSource,
  declaration: ReactDeclaration,
  declarationsByName: Map<string, ReactDeclaration[]>,
  membersByParentId: Map<string, ReactMember[]>,
  importsByFile: Map<string, ImportBinding[]>,
  reExportsByFile: Map<string, ImportBinding[]>,
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
  analyzeContextUsage(source, declaration, declarationsByName, result);
  analyzeComponentComposition(source, declaration, declarationsByName, membersByParentId, importsByFile, reExportsByFile, result);
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

function analyzeContextUsage(
  source: ReactSource,
  declaration: ReactDeclaration,
  declarationsByName: Map<string, ReactDeclaration[]>,
  result: WebAnalyzerResult
): void {
  for (const match of matchAll(declaration.body, /\buseContext\s*\(\s*([A-Z][A-Za-z0-9_]*Context)\b/g)) {
    const context = declarationsByName.get(match[1])?.find((candidate) => candidate.kind === "context");
    if (!context) {
      continue;
    }
    const range = rangeFromIndex(source.text, declaration.bodyStart + match.index, match[0].length);
    result.relationships.push(relationship(declaration.id, context.id, "CONSUMES_CONTEXT", declaration.file, range, match[0], 0.88));
  }

  for (const match of matchAll(declaration.body, /<([A-Z][A-Za-z0-9_]*Context)\.Provider\b/g)) {
    const context = declarationsByName.get(match[1])?.find((candidate) => candidate.kind === "context");
    if (!context) {
      continue;
    }
    const range = rangeFromIndex(source.text, declaration.bodyStart + match.index, match[0].length);
    result.relationships.push(relationship(declaration.id, context.id, "PROVIDES_CONTEXT", declaration.file, range, match[0], 0.9));
  }
}

function analyzeComponentComposition(
  source: ReactSource,
  declaration: ReactDeclaration,
  declarationsByName: Map<string, ReactDeclaration[]>,
  membersByParentId: Map<string, ReactMember[]>,
  importsByFile: Map<string, ImportBinding[]>,
  reExportsByFile: Map<string, ImportBinding[]>,
  result: WebAnalyzerResult
): void {
  if (declaration.kind !== "component" && declaration.kind !== "hook") {
    return;
  }

  for (const match of matchAll(declaration.body, /<([A-Z][A-Za-z0-9_]*)(?:\.([A-Z][A-Za-z0-9_]*))?\b([^>]*)>/g)) {
    const tagName = match[1];
    const memberName = match[2];
    const componentName = memberName ?? tagName;
    const jsxName = memberName ? `${tagName}.${memberName}` : tagName;
    if (tagName.endsWith("Context")) {
      continue;
    }

    const component = resolveJsxComponent(source.file.path, tagName, memberName, declarationsByName, importsByFile, reExportsByFile);
    const range = rangeFromIndex(source.text, declaration.bodyStart + match.index, match[0].length);
    const target = component?.id ?? `symbol:react-component:${jsxName}`;
    result.references.push(reference(jsxName, target, declaration.file, range, memberName ? "jsx-namespace-component" : "jsx-component", match[0], component ? 0.88 : 0.62));
    result.relationships.push(relationship(declaration.id, target, "RENDERS_COMPONENT", declaration.file, range, match[0], component ? 0.88 : 0.65));

    for (const attr of jsxAttributeNames(match[3])) {
      if (ignoredJsxAttributes.has(attr)) {
        continue;
      }
      const propMember = component ? resolveComponentPropMember(component, attr, declarationsByName, membersByParentId, importsByFile, reExportsByFile) : undefined;
      const propTarget = propMember?.id ?? `prop:react:${componentName}.${attr}`;
      const propEvidence = propMember ? `<${jsxName} ${attr}=... -> ${propMember.parentName}.${propMember.name}` : `<${jsxName} ${attr}=...`;
      const propConfidence = propMember ? 0.84 : 0.68;
      if (propMember) {
        result.references.push(reference(attr, propMember.id, declaration.file, range, "jsx-prop", match[0], propConfidence));
      }
      result.relationships.push(relationship(declaration.id, propTarget, "PASSES_PROP", declaration.file, range, propEvidence, propConfidence));
      if (/^on[A-Z]/u.test(attr)) {
        result.relationships.push(relationship(declaration.id, `event:react:${attr}`, "HANDLES_EVENT", declaration.file, range, `<${tagName} ${attr}=...`, 0.74));
      }
    }
  }

  for (const match of matchAll(declaration.body, /\b(on[A-Z][A-Za-z0-9_]*)\s*=/g)) {
    const range = rangeFromIndex(source.text, declaration.bodyStart + match.index, match[0].length);
    result.relationships.push(relationship(declaration.id, `event:react:${match[1]}`, "HANDLES_EVENT", declaration.file, range, match[0], 0.68));
  }
}

function resolveJsxComponent(
  filePath: string,
  tagName: string,
  memberName: string | undefined,
  declarationsByName: Map<string, ReactDeclaration[]>,
  importsByFile: Map<string, ImportBinding[]>,
  reExportsByFile: Map<string, ImportBinding[]>
): ReactDeclaration | undefined {
  if (!memberName) {
    return resolveImportedComponentAlias(filePath, tagName, importsByFile, reExportsByFile, declarationsByName)
      ?? declarationsByName.get(tagName)?.find((candidate) => candidate.kind === "component");
  }

  const namespaceImport = importsByFile.get(filePath)?.find((binding) => binding.name === tagName && binding.importStyle === "namespace" && !binding.typeOnly);
  if (!namespaceImport) {
    return declarationsByName.get(memberName)?.find((candidate) => candidate.kind === "component");
  }

  const namespaceMemberBinding = { ...namespaceImport, name: memberName, importedName: memberName };
  const exportedFile = resolveReExportedFile(namespaceMemberBinding, reExportsByFile);
  const candidates = declarationNamesForImport(memberName, namespaceMemberBinding)
    .flatMap((declarationName) => declarationsByName.get(declarationName) ?? [])
    .filter((candidate) => candidate.kind === "component");
  if (exportedFile) {
    const exportedMatch = candidates.find((candidate) => candidate.file === exportedFile);
    if (exportedMatch) {
      return exportedMatch;
    }
    const fileComponents = componentsInFile(exportedFile, declarationsByName);
    if (fileComponents.length === 1) {
      return fileComponents[0];
    }
  }

  return candidates.length === 1 ? candidates[0] : undefined;
}

function resolveImportedComponentAlias(
  filePath: string,
  localName: string,
  importsByFile: Map<string, ImportBinding[]>,
  reExportsByFile: Map<string, ImportBinding[]>,
  declarationsByName: Map<string, ReactDeclaration[]>
): ReactDeclaration | undefined {
  const importBinding = importsByFile.get(filePath)?.find((binding) => binding.name === localName && !binding.typeOnly);
  if (!importBinding?.resolvedFile) {
    return undefined;
  }

  const targetFile = resolveReExportedFile(importBinding, reExportsByFile) ?? importBinding.resolvedFile;
  for (const declarationName of declarationNamesForImport(localName, importBinding)) {
    const exactNameMatch = declarationsByName.get(declarationName)
      ?.find((candidate) => candidate.kind === "component" && candidate.file === targetFile);
    if (exactNameMatch) {
      return exactNameMatch;
    }
  }

  const candidates = componentsInFile(targetFile, declarationsByName);
  return candidates.length === 1 ? candidates[0] : undefined;
}

function componentsInFile(filePath: string, declarationsByName: Map<string, ReactDeclaration[]>): ReactDeclaration[] {
  const seen = new Set<string>();
  const components: ReactDeclaration[] = [];
  for (const declarations of declarationsByName.values()) {
    for (const declaration of declarations) {
      if (declaration.kind !== "component" || declaration.file !== filePath || seen.has(declaration.id)) {
        continue;
      }
      seen.add(declaration.id);
      components.push(declaration);
    }
  }
  return components;
}

function resolveComponentPropMember(
  component: ReactDeclaration,
  propName: string,
  declarationsByName: Map<string, ReactDeclaration[]>,
  membersByParentId: Map<string, ReactMember[]>,
  importsByFile: Map<string, ImportBinding[]>,
  reExportsByFile: Map<string, ImportBinding[]>
): ReactMember | undefined {
  if (!component.propsType) {
    return undefined;
  }

  const propsDeclaration = resolvePropsDeclaration(component.propsType, component.file, declarationsByName, importsByFile, reExportsByFile);
  if (!propsDeclaration) {
    return undefined;
  }

  return membersForPropsDeclaration(propsDeclaration, declarationsByName, membersByParentId, importsByFile, reExportsByFile)
    .find((member) => member.name === propName);
}

function membersForPropsDeclaration(
  propsDeclaration: ReactDeclaration,
  declarationsByName: Map<string, ReactDeclaration[]>,
  membersByParentId: Map<string, ReactMember[]>,
  importsByFile: Map<string, ImportBinding[]>,
  reExportsByFile: Map<string, ImportBinding[]>,
  visited = new Set<string>()
): ReactMember[] {
  if (visited.has(propsDeclaration.id)) {
    return [];
  }
  visited.add(propsDeclaration.id);

  const members: ReactMember[] = [];
  const seen = new Set<string>();
  for (const member of membersByParentId.get(propsDeclaration.id) ?? []) {
    members.push(member);
    seen.add(member.name);
  }

  for (const inheritedType of propsDeclaration.extendsTypes ?? []) {
    const inheritedDeclaration = resolvePropsDeclaration(inheritedType, propsDeclaration.file, declarationsByName, importsByFile, reExportsByFile);
    if (!inheritedDeclaration) {
      continue;
    }
    for (const member of membersForPropsDeclaration(inheritedDeclaration, declarationsByName, membersByParentId, importsByFile, reExportsByFile, visited)) {
      if (seen.has(member.name)) {
        continue;
      }
      members.push(member);
      seen.add(member.name);
    }
  }

  for (const utility of propsDeclaration.propUtilities ?? []) {
    if (utility.utility === "Record" || utility.utility === "Mapped") {
      for (const member of syntheticMembersForPropUtility(propsDeclaration, utility, declarationsByName)) {
        if (seen.has(member.name)) {
          continue;
        }
        members.push(member);
        seen.add(member.name);
      }
      continue;
    }

    const utilityDeclaration = utility.targetType ? resolvePropsDeclaration(utility.targetType, propsDeclaration.file, declarationsByName, importsByFile, reExportsByFile) : undefined;
    if (!utilityDeclaration) {
      continue;
    }
    const utilityMembers = membersForPropsDeclaration(utilityDeclaration, declarationsByName, membersByParentId, importsByFile, reExportsByFile, new Set(visited));
    for (const member of filterMembersForPropUtility(utilityMembers, utility)) {
      if (seen.has(member.name)) {
        continue;
      }
      members.push(member);
      seen.add(member.name);
    }
  }

  return members;
}

function syntheticMembersForPropUtility(
  propsDeclaration: ReactDeclaration,
  utility: TypeScriptPropUtility,
  declarationsByName: Map<string, ReactDeclaration[]>
): ReactMember[] {
  const keys = utility.keys ?? keysFromLocalLiteralUnion(utility.keyType, declarationsByName);
  return keys.map((key) => ({
    id: `${propsDeclaration.id}.${slug(key)}`,
    parentId: propsDeclaration.id,
    parentName: propsDeclaration.name,
    name: key,
    kind: "property" as const,
    file: propsDeclaration.file,
    language: propsDeclaration.language,
    range: propsDeclaration.range,
    declaration: `${key}: ${utility.valueType ?? "unknown"}`,
    typeName: utility.valueType ?? "unknown",
    optional: Boolean(utility.optional),
    readonly: false
  }));
}

function syntheticMembersForPropUtilities(
  propsDeclaration: ReactDeclaration,
  declarationsByName: Map<string, ReactDeclaration[]>
): ReactMember[] {
  if (propsDeclaration.kind !== "props") {
    return [];
  }

  const members: ReactMember[] = [];
  const seen = new Set<string>();
  for (const utility of propsDeclaration.propUtilities ?? []) {
    if (utility.utility !== "Record" && utility.utility !== "Mapped") {
      continue;
    }
    for (const member of syntheticMembersForPropUtility(propsDeclaration, utility, declarationsByName)) {
      if (seen.has(member.name)) {
        continue;
      }
      members.push(member);
      seen.add(member.name);
    }
  }
  return members;
}

function keysFromLocalLiteralUnion(typeName: string | undefined, declarationsByName: Map<string, ReactDeclaration[]>): string[] {
  if (!typeName) {
    return [];
  }

  const declaration = declarationsByName.get(typeName)?.find((candidate) => candidate.kind === "type");
  return (declaration?.unionVariants ?? [])
    .filter((variant) => variant.variantKind === "literal")
    .map((variant) => literalUnionKeyName(variant));
}

function literalUnionKeyName(variant: TypeScriptUnionVariant): string {
  return variant.declaration.replace(/^["']|["']$/gu, "");
}

function filterMembersForPropUtility(members: ReactMember[], utility: TypeScriptPropUtility): ReactMember[] {
  const keys = new Set(utility.keys ?? []);
  if (utility.utility === "Pick" && keys.size > 0) {
    return members.filter((member) => keys.has(member.name));
  }
  if (utility.utility === "Omit" && keys.size > 0) {
    return members.filter((member) => !keys.has(member.name));
  }
  return members;
}

function resolvePropsDeclaration(
  propsType: string,
  filePath: string,
  declarationsByName: Map<string, ReactDeclaration[]>,
  importsByFile: Map<string, ImportBinding[]>,
  reExportsByFile: Map<string, ImportBinding[]>
): ReactDeclaration | undefined {
  const localDeclaration = declarationsByName.get(propsType)
    ?.find((candidate) => candidate.kind === "props" && candidate.file === filePath);
  if (localDeclaration) {
    return localDeclaration;
  }

  const importBinding = importsByFile.get(filePath)?.find((binding) => binding.name === propsType && binding.typeOnly);
  if (importBinding?.resolvedFile) {
    const targetFile = resolveReExportedFile(importBinding, reExportsByFile) ?? importBinding.resolvedFile;
    for (const declarationName of declarationNamesForImport(propsType, importBinding)) {
      const importedDeclaration = declarationsByName.get(declarationName)
        ?.find((candidate) => candidate.kind === "props" && candidate.file === targetFile);
      if (importedDeclaration) {
        return importedDeclaration;
      }
    }
  }

  const candidates = (declarationsByName.get(propsType) ?? []).filter((candidate) => candidate.kind === "props");
  return candidates.length === 1 ? candidates[0] : undefined;
}

function jsxAttributeNames(attributeText: string): string[] {
  const names: string[] = [];
  for (const match of matchAll(attributeText, /\s([A-Za-z_$][\w$:-]*)\s*=/g)) {
    names.push(match[1]);
  }
  return [...new Set(names)];
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

function analyzeRoutes(
  source: ReactSource,
  fileDeclarations: ReactDeclaration[],
  declarationsByName: Map<string, ReactDeclaration[]>,
  result: WebAnalyzerResult
): void {
  for (const route of fileDeclarations.filter((declaration) => declaration.kind === "route")) {
    const componentName = componentNameFromRouteBody(route.body);
    const handlerName = routeHandlerNameFromRouteBody(route.body);
    const pathValue = routePathFromBody(route.body);
    if (pathValue) {
      const routeReferenceId = pathValue.startsWith("/api/") ? routeTargetId(pathValue) : `route:react:${pathValue}`;
      result.references.push(reference(pathValue, routeReferenceId, route.file, route.range, "react-route", route.declaration, 0.82));
    }
    if (componentName) {
      const targetComponent = declarationsByName.get(componentName)?.find((candidate) => candidate.kind === "component");
      const target = targetComponent?.id ?? `symbol:react-component:${componentName}`;
      result.relationships.push(relationship(route.id, target, "MAPS_ROUTE", route.file, route.range, route.declaration, targetComponent ? 0.86 : 0.62));
    }
    if (handlerName) {
      const targetHandler = declarationsByName.get(handlerName)?.find((candidate) => candidate.kind === "function");
      const target = targetHandler?.id ?? `symbol:react-route-handler:${handlerName}`;
      result.relationships.push(relationship(route.id, target, "MAPS_ROUTE", route.file, route.range, route.declaration, targetHandler ? 0.86 : 0.62));
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
    return ["react-prop-member", "typescript-property"];
  }
  return ["typescript-member"];
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

function reactModuleId(filePath: string): string {
  return `symbol:react:${filePath}`;
}

function reactDeclarationId(filePath: string, kind: ReactDeclaration["kind"], name: string): string {
  return `symbol:react:${filePath}:${kind}:${slug(name)}`;
}

function routeTargetId(route: string): string {
  return `route:web:${route.replace(/:[A-Za-z_$][\w$-]*/gu, ":param")}`;
}

function cleanTypeName(value: string): string {
  const cleaned = value.trim().replace(/[,\r]+$/u, "").trim();
  return cleaned === "{" ? "object" : cleaned;
}

function memberSummary(member: ReactMember): string {
  return [
    `type: ${member.typeName ?? "unknown"}`,
    member.optional ? "optional" : "required",
    member.readonly ? "readonly" : undefined,
    member.rest ? "rest" : undefined
  ].filter(Boolean).join("; ");
}

function findMatchingBrace(text: string, openBrace: number): number {
  return findMatchingPair(text, openBrace, "{", "}");
}

function findMatchingParen(text: string, openParen: number): number {
  return findMatchingPair(text, openParen, "(", ")");
}

function braceDepthAt(text: string, targetIndex: number): number {
  let depth = 0;
  for (let index = 0; index < targetIndex; index += 1) {
    const character = text[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth = Math.max(0, depth - 1);
    }
  }
  return depth;
}

function findMatchingPair(text: string, openIndex: number, openToken: string, closeToken: string): number {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1] ?? "";
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === openToken) depth += 1;
    else if (character === closeToken && --depth === 0) return index;
  }
  return -1;
}

type IndexedMatch = RegExpExecArray & { index: number };
function matchAll(text: string, pattern: RegExp): IndexedMatch[] {
  return [...text.matchAll(pattern)] as IndexedMatch[];
}

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:/-]+/g, "_");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
