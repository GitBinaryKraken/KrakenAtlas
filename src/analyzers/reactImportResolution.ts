import { ImportBinding } from "./reactAnalyzerTypes";

export function resolveReExportedFile(
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

export function declarationNamesForImport(name: string, importBinding: ImportBinding | undefined): string[] {
  const names = [importBinding?.importedName, name].filter((candidate): candidate is string => Boolean(candidate) && candidate !== "*" && candidate !== "default");
  return [...new Set(names)];
}
