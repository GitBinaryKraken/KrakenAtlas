import { declarationNamesForImport, resolveReExportedFile } from "./reactImportResolution";
import { ImportBinding, ReactDeclaration, ReactMember, TypeScriptTypeParameter } from "./reactAnalyzerTypes";
import { escapeRegExp, splitTopLevelGenericArgs } from "./reactTypeText";

export function genericSubstitutionsForJsx(component: ReactDeclaration | undefined, typeArguments: string | undefined): Map<string, string> {
  const substitutions = new Map<string, string>();
  if (!component?.typeParameters?.length) {
    return substitutions;
  }

  const typeArgs = typeArguments ? splitTopLevelGenericArgs(typeArguments) : [];
  component.typeParameters.forEach((parameter, index) => {
    const typeArg = typeArgs[index] ?? defaultTypeFromTypeParameter(parameter);
    if (typeArg) {
      substitutions.set(parameter.name, typeArg);
    }
  });
  return substitutions;
}

export function genericSubstitutionsForProp(
  component: ReactDeclaration | undefined,
  propMember: ReactMember,
  componentSubstitutions: Map<string, string>,
  declarationsByName: Map<string, ReactDeclaration[]>
): Map<string, string> {
  const propsDeclaration = declarationsByName.get(propMember.parentName)?.find((candidate) => candidate.id === propMember.parentId);
  if (!component?.propsTypeArguments?.length || !propsDeclaration?.typeParameters?.length) {
    return componentSubstitutions;
  }

  const substitutions = new Map<string, string>();
  propsDeclaration.typeParameters.forEach((parameter, index) => {
    const typeArg = component.propsTypeArguments?.[index];
    if (typeArg) {
      substitutions.set(parameter.name, substituteTypeText(typeArg, componentSubstitutions));
    }
  });
  return substitutions.size ? substitutions : componentSubstitutions;
}

export function jsxPropEvidence(
  jsxName: string,
  attr: string,
  propMember: ReactMember,
  substitutions: Map<string, string>,
  declarationsByName: Map<string, ReactDeclaration[]>,
  importsByFile: Map<string, ImportBinding[]>,
  reExportsByFile: Map<string, ImportBinding[]>
): string {
  const base = `<${jsxName} ${attr}=... -> ${propMember.parentName}.${propMember.name}`;
  const details = [
    genericSubstitutionSummary(substitutions),
    substitutedTypeName(propMember.typeName, substitutions, propMember.file, declarationsByName, importsByFile, reExportsByFile)
  ].filter((detail): detail is string => Boolean(detail));
  return details.length ? `${base} (${details.join("; ")})` : base;
}

function genericSubstitutionSummary(substitutions: Map<string, string>): string | undefined {
  if (!substitutions.size) {
    return undefined;
  }
  return [...substitutions.entries()].map(([name, typeArg]) => `${name}=${typeArg}`).join(", ");
}

function defaultTypeFromTypeParameter(parameter: TypeScriptTypeParameter): string | undefined {
  return /^default: ([^;]+)$/u.exec(parameter.summary)?.[1]
    ?? /;\s*default: ([^;]+)$/u.exec(parameter.summary)?.[1]
    ?? /\s=\s*([\s\S]+)$/u.exec(parameter.declaration)?.[1]?.trim();
}

function substitutedTypeName(
  typeName: string | undefined,
  substitutions: Map<string, string>,
  filePath: string,
  declarationsByName: Map<string, ReactDeclaration[]>,
  importsByFile: Map<string, ImportBinding[]>,
  reExportsByFile: Map<string, ImportBinding[]>
): string | undefined {
  if (!typeName) {
    return undefined;
  }

  const substituted = substituteTypeText(typeName, substitutions);
  const expanded = expandGenericTypeAliases(substituted, filePath, declarationsByName, importsByFile, reExportsByFile);
  return expanded === typeName ? undefined : `type: ${expanded}`;
}

function substituteTypeText(typeText: string, substitutions: Map<string, string>): string {
  let substituted = typeText;
  for (const [name, typeArg] of substitutions) {
    substituted = substituted.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gu"), typeArg);
  }
  return substituted;
}

function expandGenericTypeAliases(
  typeText: string,
  filePath: string,
  declarationsByName: Map<string, ReactDeclaration[]>,
  importsByFile: Map<string, ImportBinding[]>,
  reExportsByFile: Map<string, ImportBinding[]>,
  depth = 0
): string {
  if (depth >= 5) {
    return typeText;
  }

  let expanded = typeText;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = expanded.replace(/\b([A-Z_$][A-Za-z0-9_$]*)\s*<([^<>\n]+)>/g, (match, aliasName: string, argsText: string) => {
      const aliasDeclaration = genericTypeAliasDeclaration(aliasName, filePath, declarationsByName, importsByFile, reExportsByFile);
      const aliasExpression = aliasDeclaration ? typeAliasExpression(aliasDeclaration) : undefined;
      if (!aliasDeclaration?.typeParameters?.length || !aliasExpression) {
        return match;
      }

      const args = splitTopLevelGenericArgs(argsText);
      if (args.length !== aliasDeclaration.typeParameters.length) {
        return match;
      }

      const aliasSubstitutions = new Map<string, string>();
      aliasDeclaration.typeParameters.forEach((parameter, index) => {
        aliasSubstitutions.set(parameter.name, args[index]);
      });
      return expandGenericTypeAliases(substituteTypeText(aliasExpression, aliasSubstitutions), aliasDeclaration.file, declarationsByName, importsByFile, reExportsByFile, depth + 1);
    });
    if (next === expanded) {
      return expanded;
    }
    expanded = next;
  }
  return expanded;
}

function genericTypeAliasDeclaration(
  name: string,
  filePath: string,
  declarationsByName: Map<string, ReactDeclaration[]>,
  importsByFile: Map<string, ImportBinding[]>,
  reExportsByFile: Map<string, ImportBinding[]>
): ReactDeclaration | undefined {
  const candidates = (declarationsByName.get(name) ?? []).filter((candidate) => candidate.kind === "type");
  const localDeclaration = candidates.find((candidate) => candidate.file === filePath);
  if (localDeclaration) {
    return localDeclaration;
  }

  const importBinding = importsByFile.get(filePath)?.find((binding) => binding.name === name);
  if (importBinding?.resolvedFile) {
    const targetFile = resolveReExportedFile(importBinding, reExportsByFile) ?? importBinding.resolvedFile;
    for (const declarationName of declarationNamesForImport(name, importBinding)) {
      const importedDeclaration = declarationsByName.get(declarationName)
        ?.find((candidate) => candidate.kind === "type" && candidate.file === targetFile);
      if (importedDeclaration) {
        return importedDeclaration;
      }
    }
  }

  return candidates.length === 1 ? candidates[0] : undefined;
}

function typeAliasExpression(declaration: ReactDeclaration): string | undefined {
  const summaryExpression = /^compiler: type-alias; type: ([\s\S]+)$/u.exec(declaration.propsType ?? "")?.[1]?.trim();
  if (summaryExpression) {
    return summaryExpression;
  }

  const equalsIndex = declaration.body.indexOf("=");
  if (equalsIndex < 0) {
    return undefined;
  }
  return declaration.body.slice(equalsIndex + 1).replace(/;\s*$/u, "").trim() || undefined;
}
