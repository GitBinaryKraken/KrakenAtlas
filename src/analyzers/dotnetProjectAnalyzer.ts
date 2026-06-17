import * as fs from "fs/promises";
import * as path from "path";
import { FileRecord, RelationshipRecord, SourceRange, SymbolRecord } from "../model/records";

export interface DotnetProjectAnalyzerResult {
  symbols: SymbolRecord[];
  relationships: RelationshipRecord[];
}

export async function analyzeDotnetProjects(workspaceRoot: string, files: FileRecord[]): Promise<DotnetProjectAnalyzerResult> {
  const projectFiles = files.filter((file) => file.extension === ".csproj");
  const projectPaths = new Set(projectFiles.map((file) => normalizePath(file.path)));
  const result: DotnetProjectAnalyzerResult = {
    symbols: [],
    relationships: []
  };

  for (const file of projectFiles) {
    const projectName = path.basename(file.path, ".csproj");
    const projectId = projectSymbolId(file.path);
    result.symbols.push({
      recordType: "symbol",
      id: projectId,
      name: projectName,
      fullyQualifiedName: file.path,
      kind: "project",
      language: "csharp",
      file: file.path,
      range: firstLineRange(),
      patterns: ["dotnet-project"],
      confidence: 0.95
    });

    const text = await fs.readFile(path.join(workspaceRoot, file.path), "utf8");
    for (const reference of readProjectReferences(text, file.path, projectPaths)) {
      result.relationships.push({
        recordType: "relationship",
        id: `relationship:project_references:dotnet:${slug(file.path)}->${slug(reference.targetPath)}`,
        from: projectId,
        to: projectSymbolId(reference.targetPath),
        type: "PROJECT_REFERENCES",
        file: file.path,
        range: reference.range,
        evidence: reference.include,
        confidence: projectPaths.has(reference.targetPath) ? 0.95 : 0.7
      });
    }
  }

  return result;
}

function readProjectReferences(text: string, projectPath: string, knownProjectPaths: Set<string>): Array<{ include: string; targetPath: string; range: SourceRange }> {
  const references: Array<{ include: string; targetPath: string; range: SourceRange }> = [];
  const pattern = /<ProjectReference\b[^>]*\bInclude\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const include = match[1] ?? match[2] ?? "";
    const targetPath = resolveProjectReferencePath(projectPath, include);
    references.push({
      include,
      targetPath: knownProjectPaths.has(targetPath) ? targetPath : normalizePath(targetPath),
      range: rangeFromIndex(text, match.index, match[0].length)
    });
  }

  return references;
}

function resolveProjectReferencePath(projectPath: string, include: string): string {
  const projectDirectory = path.posix.dirname(normalizePath(projectPath));
  return normalizePath(path.posix.normalize(path.posix.join(projectDirectory, include.replace(/\\/g, "/"))));
}

function projectSymbolId(projectPath: string): string {
  return `symbol:dotnet-project:${normalizePath(projectPath)}`;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function firstLineRange(): SourceRange {
  return {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 1
  };
}

function rangeFromIndex(text: string, startIndex: number, length: number): SourceRange {
  const before = text.slice(0, startIndex);
  const line = before.split(/\r?\n/).length;
  const lastLineStart = Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\r"));
  const column = startIndex - lastLineStart;
  return {
    startLine: line,
    startColumn: column,
    endLine: line,
    endColumn: column + length
  };
}

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:/-]+/g, "_");
}
