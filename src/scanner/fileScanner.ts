import * as crypto from "crypto";
import { Dirent, Stats } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import {
  defaultIgnoreFileName,
  defaultIgnoredExtensions,
  defaultIgnoredFileNames,
  defaultIgnoredGlobs,
  defaultIgnoredDirectories,
  defaultSensitiveExtensions,
  defaultSensitiveFileNames,
  defaultMaxFileSizeBytes
} from "../config/defaults";
import { FileRecord } from "../model/records";
import { isGeneratedFile } from "./generated";
import { guessLanguage } from "./language";

export interface ScanOptions {
  maxFileSizeBytes?: number;
  outputFolder?: string;
  excludeDirectories?: string[];
  excludeGlobs?: string[];
  excludeExtensions?: string[];
  excludeFiles?: string[];
  includeGlobs?: string[];
  ignoreFile?: string;
}

export interface ScanSummary {
  indexedFiles: number;
  excludedFiles: number;
  excludedByReason: Record<string, number>;
  excludedByTopLevel: Record<string, number>;
}

export interface ScanResult {
  files: FileRecord[];
  summary: ScanSummary;
}

export async function scanWorkspaceFiles(workspaceRoot: string, options: ScanOptions = {}): Promise<FileRecord[]> {
  return (await scanWorkspace(workspaceRoot, options)).files;
}

export async function scanWorkspace(workspaceRoot: string, options: ScanOptions = {}): Promise<ScanResult> {
  const records: FileRecord[] = [];
  const maxFileSizeBytes = options.maxFileSizeBytes ?? defaultMaxFileSizeBytes;
  const policy = await buildScanPolicy(workspaceRoot, options);
  const summary: ScanSummary = {
    indexedFiles: 0,
    excludedFiles: 0,
    excludedByReason: {},
    excludedByTopLevel: {}
  };

  if (options.outputFolder) {
    policy.ignoredDirectories.add(path.basename(options.outputFolder).toLowerCase());
  }

  await walkDirectory(workspaceRoot, workspaceRoot, records, policy, summary, maxFileSizeBytes);
  records.sort((left, right) => left.path.localeCompare(right.path));
  summary.indexedFiles = records.length;
  return { files: records, summary };
}

interface ScanPolicy {
  ignoredDirectories: Set<string>;
  ignoredFileNames: Set<string>;
  ignoredExtensions: Set<string>;
  excludePatterns: IgnorePattern[];
  includePatterns: IgnorePattern[];
}

interface IgnorePattern {
  raw: string;
  regex: RegExp;
  directoryOnly: boolean;
}

async function walkDirectory(
  workspaceRoot: string,
  currentDirectory: string,
  records: FileRecord[],
  policy: ScanPolicy,
  summary: ScanSummary,
  maxFileSizeBytes: number
): Promise<void> {
  let entries: Dirent[];

  try {
    entries = await fs.readdir(currentDirectory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(currentDirectory, entry.name);
    const relativePath = toWorkspacePath(path.relative(workspaceRoot, fullPath));

    if (entry.isDirectory()) {
      const decision = shouldExcludePath(relativePath, entry.name, true, policy);
      if (decision.exclude && policy.includePatterns.length === 0) {
        recordExcluded(summary, relativePath, decision.reason, await countFilesUnderDirectory(fullPath));
      } else {
        await walkDirectory(workspaceRoot, fullPath, records, policy, summary, maxFileSizeBytes);
      }

      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stat = await fs.stat(fullPath);
    if (stat.size > maxFileSizeBytes) {
      recordExcluded(summary, relativePath, "max-file-size");
      continue;
    }

    const decision = shouldExcludePath(relativePath, entry.name, false, policy);
    if (decision.exclude) {
      recordExcluded(summary, relativePath, decision.reason);
      continue;
    }

    records.push(await createFileRecord(workspaceRoot, fullPath, stat));
  }
}

async function buildScanPolicy(workspaceRoot: string, options: ScanOptions): Promise<ScanPolicy> {
  const ignoredDirectories = new Set([...defaultIgnoredDirectories].map((directory) => directory.toLowerCase()));
  for (const directory of options.excludeDirectories ?? []) {
    ignoredDirectories.add(normalizeDirectoryName(directory));
  }

  const ignoredFileNames = new Set([...defaultIgnoredFileNames, ...defaultSensitiveFileNames].map((file) => file.toLowerCase()));
  for (const file of options.excludeFiles ?? []) {
    ignoredFileNames.add(file.replace(/\\/g, "/").toLowerCase());
  }

  const ignoredExtensions = new Set([...defaultIgnoredExtensions, ...defaultSensitiveExtensions].map((extension) => extension.toLowerCase()));
  for (const extension of options.excludeExtensions ?? []) {
    ignoredExtensions.add(extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`);
  }

  const ignoreFileRules = await readIgnoreFileRules(workspaceRoot, options.ignoreFile ?? defaultIgnoreFileName);
  const excludeGlobs = [...defaultIgnoredGlobs, ...(options.excludeGlobs ?? []), ...ignoreFileRules.exclude];
  const includeGlobs = [...(options.includeGlobs ?? []), ...ignoreFileRules.include];

  return {
    ignoredDirectories,
    ignoredFileNames,
    ignoredExtensions,
    excludePatterns: excludeGlobs.map((glob) => compileIgnorePattern(glob)),
    includePatterns: includeGlobs.map((glob) => compileIgnorePattern(glob))
  };
}

async function readIgnoreFileRules(workspaceRoot: string, ignoreFile: string): Promise<{ exclude: string[]; include: string[] }> {
  try {
    const text = await fs.readFile(path.join(workspaceRoot, ignoreFile), "utf8");
    const exclude: string[] = [];
    const include: string[] = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      if (line.startsWith("!")) {
        include.push(line.slice(1).trim());
      } else {
        exclude.push(line);
      }
    }
    return { exclude, include };
  } catch {
    return { exclude: [], include: [] };
  }
}

function shouldExcludePath(relativePath: string, fileName: string, isDirectory: boolean, policy: ScanPolicy): { exclude: boolean; reason: string } {
  const normalizedPath = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const lowerPath = normalizedPath.toLowerCase();

  if (matchesAnyPattern(normalizedPath, isDirectory, policy.includePatterns)) {
    return { exclude: false, reason: "" };
  }

  const ignoredSegment = ignoredPathSegment(lowerPath, policy.ignoredDirectories);
  if (ignoredSegment) {
    return { exclude: true, reason: `directory:${ignoredSegment}` };
  }

  if (!isDirectory && shouldIgnoreFile(lowerPath, fileName, policy)) {
    return { exclude: true, reason: "file-policy" };
  }

  const matchedPattern = policy.excludePatterns.find((pattern) => matchesPattern(normalizedPath, isDirectory, pattern));
  if (matchedPattern) {
    return { exclude: true, reason: `glob:${matchedPattern.raw}` };
  }

  return { exclude: false, reason: "" };
}

function shouldIgnoreFile(relativePath: string, fileName: string, policy: ScanPolicy): boolean {
  const lowerName = fileName.toLowerCase();
  const extension = path.extname(lowerName);
  const lowerPath = relativePath.toLowerCase();

  return (
    policy.ignoredFileNames.has(lowerName) ||
    policy.ignoredFileNames.has(lowerPath) ||
    lowerName.startsWith(".env.") ||
    lowerName === "appsettings.production.json" ||
    /^appsettings\..+\.production\.json$/i.test(lowerName) ||
    policy.ignoredExtensions.has(extension)
  );
}

async function countFilesUnderDirectory(directory: string): Promise<number> {
  let count = 0;
  let entries: Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return 1;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      count += await countFilesUnderDirectory(fullPath);
    } else if (entry.isFile()) {
      count += 1;
    }
  }

  return Math.max(count, 1);
}

function recordExcluded(summary: ScanSummary, relativePath: string, reason: string, count = 1): void {
  summary.excludedFiles += count;
  summary.excludedByReason[reason] = (summary.excludedByReason[reason] ?? 0) + count;
  const topLevel = relativePath.split("/")[0] || relativePath;
  summary.excludedByTopLevel[topLevel] = (summary.excludedByTopLevel[topLevel] ?? 0) + count;
}

function normalizeDirectoryName(directory: string): string {
  return directory.replace(/\\/g, "/").replace(/\/+$/u, "").split("/").filter(Boolean).pop()?.toLowerCase() ?? directory.toLowerCase();
}

function ignoredPathSegment(lowerPath: string, ignoredDirectories: Set<string>): string | undefined {
  return lowerPath.split("/").find((segment) => ignoredDirectories.has(segment) || segment.startsWith(".kraken-"));
}

function matchesAnyPattern(relativePath: string, isDirectory: boolean, patterns: IgnorePattern[]): boolean {
  return patterns.some((pattern) => matchesPattern(relativePath, isDirectory, pattern));
}

function matchesPattern(relativePath: string, isDirectory: boolean, pattern: IgnorePattern): boolean {
  return (!pattern.directoryOnly || isDirectory || relativePath.includes("/")) && pattern.regex.test(relativePath);
}

function compileIgnorePattern(raw: string): IgnorePattern {
  const normalized = raw.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const directoryOnly = normalized.endsWith("/");
  const body = directoryOnly ? normalized.replace(/\/+$/u, "") : normalized;
  const hasSlash = body.includes("/");
  const glob = hasSlash ? body : `**/${body}`;
  const regexSource = globToRegExpSource(glob);
  const suffix = directoryOnly ? "(?:/.*)?$" : "$";
  return {
    raw,
    directoryOnly,
    regex: new RegExp(`^${regexSource}${suffix}`, "i")
  };
}

function globToRegExpSource(glob: string): string {
  if (glob.startsWith("**/")) {
    return `(?:.*/)?${globToRegExpSource(glob.slice(3))}`;
  }

  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }

  return source;
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

async function createFileRecord(
  workspaceRoot: string,
  fullPath: string,
  stat: Stats
): Promise<FileRecord> {
  const relativePath = toWorkspacePath(path.relative(workspaceRoot, fullPath));
  const extension = path.extname(fullPath).toLowerCase();
  const fileBuffer = await fs.readFile(fullPath);

  return {
    recordType: "file",
    id: `file:${relativePath}`,
    path: relativePath,
    extension,
    language: guessLanguage(extension),
    sizeBytes: stat.size,
    sha256: crypto.createHash("sha256").update(fileBuffer).digest("hex"),
    modifiedTimeUtc: stat.mtime.toISOString(),
    isGenerated: isGeneratedFile(fullPath),
    tags: buildTags(extension, fullPath)
  };
}

function buildTags(extension: string, fullPath: string): string[] {
  const tags = new Set<string>();
  const normalizedPath = fullPath.replace(/\\/g, "/").toLowerCase();
  const language = guessLanguage(extension);

  if (language !== "unknown") {
    tags.add(language);
  }

  if ([".cs", ".js", ".cshtml", ".razor", ".html", ".htm"].includes(extension)) {
    tags.add("source");
  }

  if (normalizedPath.includes("/controllers/")) {
    tags.add("controller");
  }

  if (normalizedPath.includes("/views/") || normalizedPath.includes("/pages/")) {
    tags.add("view");
  }

  if (normalizedPath.includes("/wwwroot/")) {
    tags.add("static-asset");
  }

  if (isGeneratedFile(fullPath)) {
    tags.add("generated");
  }

  return [...tags].sort();
}

function toWorkspacePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}
