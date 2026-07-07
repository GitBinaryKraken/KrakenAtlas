import { ReferenceRecord, RelationshipRecord, SourceRange } from "../model/records";
import { genericSubstitutionsForJsx, genericSubstitutionsForProp, jsxPropEvidence } from "./reactGenericProps";
import { declarationNamesForImport, resolveReExportedFile } from "./reactImportResolution";
import { filterMembersForPropUtility, indexSignatureAcceptsPropName, syntheticMembersForPropUtility } from "./reactPropUtilities";
import { matchAll } from "./reactSourceText";
import { ImportBinding, ReactDeclaration, ReactMember, ReactSource } from "./reactAnalyzerTypes";
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

type JsxTypeArgumentEdgeEmitter = (
  fromId: string,
  typeArguments: string | undefined,
  file: string,
  range: SourceRange,
  declarationsByName: Map<string, ReactDeclaration[]>,
  typeParameterIdsByName: Map<string, string>,
  result: WebAnalyzerResult
) => void;

export interface ReactRecordBuilders {
  reference: ReferenceBuilder;
  relationship: RelationshipBuilder;
}

const ignoredJsxAttributes = new Set(["key", "className", "aria-label", "aria-current", "role", "type", "title"]);

export function analyzeComponentComposition(
  source: ReactSource,
  declaration: ReactDeclaration,
  declarationsByName: Map<string, ReactDeclaration[]>,
  membersByParentId: Map<string, ReactMember[]>,
  importsByFile: Map<string, ImportBinding[]>,
  reExportsByFile: Map<string, ImportBinding[]>,
  typeParameterIdsByName: Map<string, string>,
  result: WebAnalyzerResult,
  emitJsxTypeArgumentEdges: JsxTypeArgumentEdgeEmitter,
  records: ReactRecordBuilders
): void {
  if (declaration.kind !== "component" && declaration.kind !== "hook") {
    return;
  }

  for (const match of matchAll(declaration.body, /<([A-Z][A-Za-z0-9_]*)(?:\.([A-Z][A-Za-z0-9_]*))?(?:<([^>\n]+)>)?\s*([^>]*)>/g)) {
    const tagName = match[1];
    const memberName = match[2];
    const typeArguments = match[3];
    const componentName = memberName ?? tagName;
    const jsxName = memberName ? `${tagName}.${memberName}` : tagName;
    if (tagName.endsWith("Context")) {
      continue;
    }

    const component = resolveJsxComponent(source.file.path, tagName, memberName, declarationsByName, importsByFile, reExportsByFile);
    const range = rangeFromIndex(source.text, declaration.bodyStart + match.index, match[0].length);
    const target = component?.id ?? `symbol:react-component:${jsxName}`;
    result.references.push(records.reference(jsxName, target, declaration.file, range, memberName ? "jsx-namespace-component" : "jsx-component", match[0], component ? 0.88 : 0.62));
    result.relationships.push(records.relationship(declaration.id, target, "RENDERS_COMPONENT", declaration.file, range, match[0], component ? 0.88 : 0.65));
    emitJsxTypeArgumentEdges(declaration.id, typeArguments, declaration.file, range, declarationsByName, typeParameterIdsByName, result);
    const componentSubstitutions = genericSubstitutionsForJsx(component, typeArguments);

    for (const attr of jsxAttributeNames(match[4])) {
      if (ignoredJsxAttributes.has(attr)) {
        continue;
      }
      const propMember = component ? resolveComponentPropMember(component, attr, declarationsByName, membersByParentId, importsByFile, reExportsByFile) : undefined;
      const propTarget = propMember?.id ?? `prop:react:${componentName}.${attr}`;
      const propSubstitutions = propMember ? genericSubstitutionsForProp(component, propMember, componentSubstitutions, declarationsByName) : componentSubstitutions;
      const propEvidence = propMember ? jsxPropEvidence(jsxName, attr, propMember, propSubstitutions, declarationsByName, importsByFile, reExportsByFile) : `<${jsxName} ${attr}=...`;
      const propConfidence = propMember ? 0.84 : 0.68;
      if (propMember) {
        result.references.push(records.reference(attr, propMember.id, declaration.file, range, "jsx-prop", match[0], propConfidence));
      }
      result.relationships.push(records.relationship(declaration.id, propTarget, "PASSES_PROP", declaration.file, range, propEvidence, propConfidence));
      if (/^on[A-Z]/u.test(attr)) {
        result.relationships.push(records.relationship(declaration.id, `event:react:${attr}`, "HANDLES_EVENT", declaration.file, range, `<${tagName} ${attr}=...`, 0.74));
      }
    }
  }

  for (const match of matchAll(declaration.body, /\b(on[A-Z][A-Za-z0-9_]*)\s*=/g)) {
    const range = rangeFromIndex(source.text, declaration.bodyStart + match.index, match[0].length);
    result.relationships.push(records.relationship(declaration.id, `event:react:${match[1]}`, "HANDLES_EVENT", declaration.file, range, match[0], 0.68));
  }
}

export function membersForPropsDeclaration(
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

export function resolvePropsDeclaration(
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

  const members = membersForPropsDeclaration(propsDeclaration, declarationsByName, membersByParentId, importsByFile, reExportsByFile);
  return members.find((member) => member.name === propName)
    ?? members.find((member) => indexSignatureAcceptsPropName(member, propName));
}

function jsxAttributeNames(attributeText: string): string[] {
  const names: string[] = [];
  for (const match of matchAll(attributeText, /(?:^|\s)([A-Za-z_$][\w$:-]*)\s*=/g)) {
    names.push(match[1]);
  }
  return [...new Set(names)];
}
