import { FileRecord, RelationshipRecord, SymbolRecord } from "../model/records";

export interface AspNetConventionAnalyzerResult {
  relationships: RelationshipRecord[];
}

export function analyzeAspNetConventions(files: FileRecord[], symbols: SymbolRecord[]): AspNetConventionAnalyzerResult {
  const normalizedFiles = new Map(files.map((file) => [normalizePath(file.path).toLowerCase(), file]));
  const relationships: RelationshipRecord[] = [];

  for (const symbol of symbols) {
    if (symbol.language !== "csharp" || symbol.kind !== "class" || !symbol.name.endsWith("ViewComponent")) {
      continue;
    }

    const componentName = symbol.name.replace(/ViewComponent$/u, "");
    const projectPrefix = projectPrefixFromComponentFile(symbol.file);
    const candidatePaths = [
      `Views/Shared/Components/${componentName}/Default.cshtml`,
      ...(projectPrefix ? [`${projectPrefix}/Views/Shared/Components/${componentName}/Default.cshtml`] : []),
      ...areaComponentViewPaths(files, componentName)
    ];
    for (const candidatePath of candidatePaths) {
      const viewFile = normalizedFiles.get(candidatePath.toLowerCase());
      if (!viewFile) {
        continue;
      }

      relationships.push({
        recordType: "relationship",
        id: `relationship:aspnet:view-component-renders:${slug(symbol.id)}->${slug(viewFile.path)}`,
        from: symbol.id,
        to: `file:${viewFile.path}`,
        type: "RENDERS_VIEW",
        file: symbol.file,
        range: symbol.range,
        evidence: `${symbol.name} conventionally renders ${viewFile.path}`,
        confidence: 0.78
      });
    }
  }

  return { relationships };
}

function areaComponentViewPaths(files: FileRecord[], componentName: string): string[] {
  const paths: string[] = [];
  const suffix = `/Views/Shared/Components/${componentName}/Default.cshtml`.toLowerCase();
  for (const file of files) {
    const normalized = normalizePath(file.path);
    if (normalized.toLowerCase().startsWith("areas/") && normalized.toLowerCase().endsWith(suffix)) {
      paths.push(normalized);
    }
  }
  return paths;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function projectPrefixFromComponentFile(filePath: string): string | undefined {
  const normalized = normalizePath(filePath);
  const marker = "/Components/";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex <= 0) {
    return undefined;
  }

  return normalized.slice(0, markerIndex);
}

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:/-]+/g, "_");
}
