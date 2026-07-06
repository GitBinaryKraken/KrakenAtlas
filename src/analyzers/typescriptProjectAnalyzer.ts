import * as fs from "fs/promises";
import * as path from "path";
import * as ts from "typescript";
import { FileRecord, RelationshipRecord, SourceRange, SymbolRecord } from "../model/records";
import { rangeFromIndex } from "./textLocation";
import { WebAnalyzerResult } from "./webAnalyzerTypes";

interface TypeScriptProjectFile {
  file: FileRecord;
  text: string;
  config: TsConfigJson;
}

interface TypeScriptPackageFile {
  file: FileRecord;
  text: string;
  packageJson: PackageJson;
}

export interface TypeScriptProjectContext {
  configPath: string;
  workspaceRoot: string;
  projectRoot: string;
  baseUrl?: string;
  compilerOptions: ts.CompilerOptions;
  paths: Array<{
    alias: string;
    targets: string[];
  }>;
  packages: TypeScriptPackageContext[];
}

export interface TypeScriptPackageContext {
  name: string;
  packageRoot: string;
  exports: PackageExportEntry[];
}

interface TsConfigJson {
  compilerOptions?: {
    baseUrl?: string;
    jsx?: string;
    module?: string;
    moduleResolution?: string;
    paths?: Record<string, string[]>;
    strict?: boolean;
    target?: string;
  };
  extends?: string;
  files?: string[];
  include?: string[];
  references?: Array<{ path?: string }>;
}

interface PackageJson {
  name?: string;
  private?: boolean;
  exports?: unknown;
  main?: string;
  module?: string;
  types?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
}

export interface PackageExportEntry {
  name: string;
  target: string;
  condition?: string;
}

export async function analyzeTypeScriptProjects(workspaceRoot: string, files: FileRecord[], result: WebAnalyzerResult): Promise<TypeScriptProjectContext[]> {
  const tsconfigFiles = files.filter((file) => path.posix.basename(file.path).toLowerCase() === "tsconfig.json");
  const packageFiles = files.filter((file) => path.posix.basename(file.path).toLowerCase() === "package.json");
  const projects: TypeScriptProjectFile[] = [];
  const packages: TypeScriptPackageFile[] = [];
  const availableFiles = new Set(files.map((file) => file.path.replace(/\\/g, "/")));

  for (const file of tsconfigFiles) {
    const text = await readWorkspaceFile(workspaceRoot, file.path);
    const config = parseJsonLike<TsConfigJson>(text);
    if (!config) {
      continue;
    }
    projects.push({ file, text, config });
    emitTypeScriptProject(file, text, config, result);
  }

  for (const file of packageFiles) {
    const text = await readWorkspaceFile(workspaceRoot, file.path);
    const packageJson = parseJsonLike<PackageJson>(text);
    if (!packageJson) {
      continue;
    }
    packages.push({ file, text, packageJson });
    emitPackage(file, text, packageJson, projects, availableFiles, result);
  }

  return projects.map((project) => typeScriptProjectContext(workspaceRoot, project.file, project.config, packages));
}

function emitTypeScriptProject(file: FileRecord, text: string, config: TsConfigJson, result: WebAnalyzerResult): void {
  const projectId = tsProjectId(file.path);
  const options = config.compilerOptions ?? {};
  const patterns = [
    "typescript-project",
    options.jsx ? "typescript-jsx" : undefined,
    options.paths ? "typescript-path-aliases" : undefined,
    config.references?.length ? "typescript-project-references" : undefined
  ].filter((item): item is string => Boolean(item));
  result.symbols.push(symbol(
    projectId,
    path.posix.dirname(file.path) === "." ? "tsconfig" : path.posix.dirname(file.path),
    file.path,
    "typescript",
    "typescript-project",
    file.path,
    fullRange(text),
    0.9,
    patterns,
    tsconfigSummary(config)
  ));

  for (const [alias, targets] of Object.entries(options.paths ?? {})) {
    const range = rangeForText(text, alias);
    const aliasId = `${projectId}:path-alias:${slug(alias)}`;
    result.symbols.push(symbol(aliasId, alias, `${file.path}:${alias}`, "typescript", "path-alias", file.path, range, 0.86, ["typescript-path-alias"], `targets: ${targets.join(", ")}`));
    result.relationships.push(relationship(projectId, aliasId, "HAS_PATH_ALIAS", file.path, range, `"${alias}": ${JSON.stringify(targets)}`, 0.86));
  }

  for (const reference of config.references ?? []) {
    if (!reference.path) {
      continue;
    }
    const targetPath = normalizeReferencedTsConfig(file.path, reference.path);
    const range = rangeForText(text, reference.path);
    result.relationships.push(relationship(projectId, tsProjectId(targetPath), "PROJECT_REFERENCES", file.path, range, reference.path, 0.82));
  }
}

function emitPackage(file: FileRecord, text: string, packageJson: PackageJson, projects: TypeScriptProjectFile[], availableFiles: Set<string>, result: WebAnalyzerResult): void {
  const packageId = packageSymbolId(file.path);
  const packageName = packageJson.name ?? (path.posix.basename(path.posix.dirname(file.path)) || "package");
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const dependencyNames = Object.keys(dependencies);
  const patterns = [
    "package-json",
    dependencyNames.includes("typescript") ? "typescript-package" : undefined,
    dependencyNames.includes("react") ? "react-package" : undefined,
    dependencyNames.includes("next") ? "next-package" : undefined,
    packageJson.exports ? "package-exports" : undefined,
    packageJson.workspaces ? "javascript-workspace" : undefined
  ].filter((item): item is string => Boolean(item));

  result.symbols.push(symbol(packageId, packageName, file.path, "json", "package", file.path, fullRange(text), 0.86, patterns, packageSummary(packageJson, dependencyNames)));

  for (const packageExport of packageExports(packageJson)) {
    const range = rangeForText(text, packageExport.target);
    const exportId = `${packageId}:export:${slug(`${packageExport.name}:${packageExport.condition ?? "default"}`)}`;
    const summary = [
      `target: ${packageExport.target}`,
      packageExport.condition ? `condition: ${packageExport.condition}` : undefined
    ].filter(Boolean).join("; ");
    result.symbols.push(symbol(exportId, packageExport.name, `${file.path}:${packageExport.name}`, "json", "package-export", file.path, range, 0.82, ["package-export"], summary));
    result.relationships.push(relationship(packageId, exportId, "DECLARES_PACKAGE_EXPORT", file.path, range, `${packageExport.name} -> ${packageExport.target}`, 0.82));
    const exportedFile = resolvePackageExportTarget(path.posix.dirname(file.path), packageExport.target, availableFiles);
    if (exportedFile) {
      result.relationships.push(relationship(exportId, `file:${exportedFile}`, "EXPORTS_FILE", file.path, range, packageExport.target, 0.82));
    }
  }

  const packageFolder = path.posix.dirname(file.path);
  for (const project of projects) {
    if (path.posix.dirname(project.file.path) !== packageFolder) {
      continue;
    }
    result.relationships.push(relationship(packageId, tsProjectId(project.file.path), "DECLARES_TYPESCRIPT_PROJECT", file.path, fullRange(text), packageName, 0.84));
  }
}

function packageExports(packageJson: PackageJson): PackageExportEntry[] {
  const entries: PackageExportEntry[] = [];
  if (typeof packageJson.exports === "string") {
    entries.push({ name: ".", target: packageJson.exports });
  } else if (isRecord(packageJson.exports)) {
    const keys = Object.keys(packageJson.exports);
    const hasSubpathKeys = keys.some((key) => key.startsWith("."));
    if (hasSubpathKeys) {
      for (const [name, value] of Object.entries(packageJson.exports)) {
        if (name.startsWith(".")) {
          entries.push(...packageExportTargets(name, value));
        }
      }
    } else {
      entries.push(...packageExportTargets(".", packageJson.exports));
    }
  }

  if (packageJson.main) {
    entries.push({ name: "main", target: packageJson.main });
  }
  if (packageJson.module) {
    entries.push({ name: "module", target: packageJson.module });
  }
  if (packageJson.types) {
    entries.push({ name: "types", target: packageJson.types });
  }

  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.name}:${entry.condition ?? ""}:${entry.target}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function packageExportTargets(name: string, value: unknown, condition?: string): PackageExportEntry[] {
  if (typeof value === "string") {
    return [{ name, target: value, condition }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => packageExportTargets(name, item, condition));
  }
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nested]) => packageExportTargets(name, nested, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typeScriptProjectContext(workspaceRoot: string, file: FileRecord, config: TsConfigJson, packages: TypeScriptPackageFile[]): TypeScriptProjectContext {
  const projectRoot = path.posix.dirname(file.path);
  const options = config.compilerOptions ?? {};
  return {
    configPath: file.path,
    workspaceRoot,
    projectRoot,
    baseUrl: options.baseUrl,
    compilerOptions: compilerOptionsFromConfig(workspaceRoot, file.path, config),
    paths: Object.entries(options.paths ?? {}).map(([alias, targets]) => ({ alias, targets })),
    packages: packages.map((item) => ({
      name: item.packageJson.name ?? (path.posix.basename(path.posix.dirname(item.file.path)) || "package"),
      packageRoot: path.posix.dirname(item.file.path),
      exports: packageExports(item.packageJson)
    }))
  };
}

export function resolveTypeScriptModuleFile(fromFile: string, importSource: string, typeScriptProjects: TypeScriptProjectContext[], availableFiles: Set<string>): string | undefined {
  const project = bestTypeScriptProjectForFile(fromFile, typeScriptProjects);
  if (!project) {
    return undefined;
  }

  const packageExportResolved = resolvePackageExportImport(importSource, project, availableFiles);
  if (packageExportResolved) {
    return packageExportResolved;
  }

  const containingFile = path.resolve(project.workspaceRoot, fromFile);
  const resolved = ts.resolveModuleName(importSource, containingFile, project.compilerOptions, moduleResolutionHost(project.workspaceRoot)).resolvedModule?.resolvedFileName;
  if (!resolved) {
    return undefined;
  }

  const relativePath = toWorkspaceRelative(project.workspaceRoot, resolved);
  return availableFiles.has(relativePath) ? relativePath : undefined;
}

function resolvePackageExportImport(importSource: string, project: TypeScriptProjectContext, availableFiles: Set<string>): string | undefined {
  for (const packageContext of project.packages) {
    const exportName = packageExportNameForImport(importSource, packageContext.name);
    if (!exportName) {
      continue;
    }

    const candidates = packageContext.exports.filter((entry) => entry.name === exportName);
    const preferred = ["types", "import", "module", "default", undefined];
    for (const condition of preferred) {
      const match = candidates.find((entry) => entry.condition === condition);
      if (!match) {
        continue;
      }
      const resolved = resolvePackageExportTarget(packageContext.packageRoot, match.target, availableFiles);
      if (resolved) {
        return resolved;
      }
    }
  }
  return undefined;
}

function packageExportNameForImport(importSource: string, packageName: string): string | undefined {
  if (importSource === packageName) {
    return ".";
  }
  if (!importSource.startsWith(`${packageName}/`)) {
    return undefined;
  }
  return `.${importSource.slice(packageName.length)}`;
}

function resolvePackageExportTarget(packageRoot: string, target: string, availableFiles: Set<string>): string | undefined {
  const normalizedTarget = target.replace(/\\/g, "/").replace(/^\.\//u, "");
  const basePath = path.posix.normalize(path.posix.join(packageRoot === "." ? "" : packageRoot, normalizedTarget));
  return resolveCandidateFile(basePath, availableFiles);
}

function resolveCandidateFile(basePath: string, availableFiles: Set<string>): string | undefined {
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
  return candidates.find((candidate) => availableFiles.has(candidate));
}

function compilerOptionsFromConfig(workspaceRoot: string, configPath: string, config: TsConfigJson): ts.CompilerOptions {
  const absoluteConfigPath = path.resolve(workspaceRoot, configPath);
  const configDirectory = path.dirname(absoluteConfigPath);
  return ts.convertCompilerOptionsFromJson(config.compilerOptions ?? {}, configDirectory, absoluteConfigPath).options;
}

function moduleResolutionHost(workspaceRoot: string): ts.ModuleResolutionHost {
  return {
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    directoryExists: ts.sys.directoryExists,
    getCurrentDirectory: () => workspaceRoot,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath
  };
}

function bestTypeScriptProjectForFile(fromFile: string, typeScriptProjects: TypeScriptProjectContext[]): TypeScriptProjectContext | undefined {
  const normalized = fromFile.replace(/\\/g, "/");
  return typeScriptProjects
    .filter((project) => project.projectRoot === "." || normalized === project.projectRoot || normalized.startsWith(`${project.projectRoot}/`))
    .sort((left, right) => right.projectRoot.length - left.projectRoot.length)[0];
}

function toWorkspaceRelative(workspaceRoot: string, filePath: string): string {
  return path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
}

function tsconfigSummary(config: TsConfigJson): string {
  const options = config.compilerOptions ?? {};
  return [
    options.jsx ? `jsx: ${options.jsx}` : undefined,
    options.moduleResolution ? `moduleResolution: ${options.moduleResolution}` : undefined,
    options.module ? `module: ${options.module}` : undefined,
    options.target ? `target: ${options.target}` : undefined,
    options.strict !== undefined ? `strict: ${options.strict}` : undefined,
    options.baseUrl ? `baseUrl: ${options.baseUrl}` : undefined,
    config.include?.length ? `include: ${config.include.join(", ")}` : undefined,
    config.references?.length ? `references: ${config.references.length}` : undefined
  ].filter(Boolean).join("; ");
}

function packageSummary(packageJson: PackageJson, dependencyNames: string[]): string {
  return [
    packageJson.private !== undefined ? `private: ${packageJson.private}` : undefined,
    dependencyNames.includes("react") ? "react" : undefined,
    dependencyNames.includes("next") ? "next" : undefined,
    dependencyNames.includes("typescript") ? "typescript" : undefined,
    packageJson.exports ? "exports" : undefined,
    packageJson.workspaces ? "workspaces" : undefined
  ].filter(Boolean).join("; ");
}

async function readWorkspaceFile(workspaceRoot: string, relativePath: string): Promise<string> {
  return fs.readFile(path.join(workspaceRoot, relativePath), "utf8");
}

function parseJsonLike<T>(text: string): T | undefined {
  try {
    return JSON.parse(stripJsonCommentsAndTrailingCommas(text)) as T;
  } catch {
    return undefined;
  }
}

function stripJsonCommentsAndTrailingCommas(text: string): string {
  let output = "";
  let inString = false;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1] ?? "";

    if (lineComment) {
      if (character === "\n") {
        lineComment = false;
        output += character;
      }
      continue;
    }

    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        inString = false;
        quote = "";
      }
      continue;
    }

    if ((character === "\"" || character === "'")) {
      inString = true;
      quote = character;
      output += character;
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

    output += character;
  }

  return output.replace(/,\s*([}\]])/g, "$1");
}

function normalizeReferencedTsConfig(fromFile: string, referencePath: string): string {
  const base = path.posix.dirname(fromFile);
  const normalized = path.posix.normalize(path.posix.join(base, referencePath));
  return normalized.endsWith(".json") ? normalized : path.posix.join(normalized, "tsconfig.json");
}

function rangeForText(text: string, value: string): SourceRange {
  const index = text.indexOf(value);
  return rangeFromIndex(text, Math.max(index, 0), index >= 0 ? value.length : Math.min(text.length, 1));
}

function fullRange(text: string): SourceRange {
  return rangeFromIndex(text, 0, Math.min(text.length, 1));
}

function symbol(id: string, name: string, fullyQualifiedName: string, language: string, kind: string, file: string, range: SourceRange, confidence: number, patterns: string[], summary?: string): SymbolRecord {
  return {
    recordType: "symbol",
    id,
    name,
    fullyQualifiedName,
    kind,
    language,
    file,
    range,
    confidence,
    patterns,
    summary
  };
}

function relationship(from: string, to: string, type: string, file: string, range: SourceRange, evidence: string, confidence: number): RelationshipRecord {
  return {
    recordType: "relationship",
    id: `relationship:${type.toLowerCase()}:typescript:${slug(from)}->${slug(to)}`,
    from,
    to,
    type,
    file,
    range,
    evidence,
    confidence
  };
}

function tsProjectId(filePath: string): string {
  return `symbol:typescript-project:${filePath}`;
}

function packageSymbolId(filePath: string): string {
  return `symbol:package:${filePath}`;
}

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:/-]+/g, "_");
}
