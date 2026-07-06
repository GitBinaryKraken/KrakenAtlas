import * as ts from "typescript";
import { ReactDeclaration, ReactMember, TypeScriptPropUtility, TypeScriptUnionVariant } from "./reactAnalyzerTypes";
import { simpleTypeName, slug } from "./reactTypeText";

export function propUtilitiesFromTypeNode(sourceFile: ts.SourceFile, node: ts.TypeNode): TypeScriptPropUtility[] {
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

export function indexSignatureAcceptsPropName(member: ReactMember, propName: string): boolean {
  if (!member.indexSignature) {
    return false;
  }
  if (member.keyType === "string") {
    return true;
  }
  if (member.keyType === "number") {
    return /^\d+$/u.test(propName);
  }
  return false;
}

export function syntheticMembersForPropUtilities(
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

export function syntheticMembersForPropUtility(
  propsDeclaration: ReactDeclaration,
  utility: TypeScriptPropUtility,
  declarationsByName: Map<string, ReactDeclaration[]>
): ReactMember[] {
  const keys = utility.keys ?? keysFromLocalLiteralUnion(utility.keyType, declarationsByName);
  if (!keys.length && utility.keyType) {
    const name = `[key: ${utility.keyType}]`;
    return [{
      id: `${propsDeclaration.id}.${slug(name)}`,
      parentId: propsDeclaration.id,
      parentName: propsDeclaration.name,
      name,
      kind: "property" as const,
      file: propsDeclaration.file,
      language: propsDeclaration.language,
      range: propsDeclaration.range,
      declaration: `${name}: ${utility.valueType ?? "unknown"}`,
      typeName: utility.valueType ?? "unknown",
      optional: Boolean(utility.optional),
      readonly: false,
      indexSignature: true,
      keyType: utility.keyType
    }];
  }

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

export function filterMembersForPropUtility(members: ReactMember[], utility: TypeScriptPropUtility): ReactMember[] {
  const keys = new Set(utility.keys ?? []);
  if (utility.utility === "Pick" && keys.size > 0) {
    return members.filter((member) => keys.has(member.name));
  }
  if (utility.utility === "Omit" && keys.size > 0) {
    return members.filter((member) => !keys.has(member.name));
  }
  return members;
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
  if (ts.isTemplateLiteralTypeNode(node)) {
    return templateLiteralKeysFromTypeNode(sourceFile, node);
  }
  return undefined;
}

function templateLiteralKeysFromTypeNode(sourceFile: ts.SourceFile, node: ts.TemplateLiteralTypeNode): string[] | undefined {
  let keys = [node.head.text];
  for (const span of node.templateSpans) {
    const spanKeys = propUtilityKeysFromTypeNode(sourceFile, span.type);
    if (!spanKeys?.length) {
      return undefined;
    }
    keys = keys.flatMap((prefix) => spanKeys.map((key) => `${prefix}${key}${span.literal.text}`));
  }
  return keys;
}

function propUtilityKeyTypeFromTypeNode(sourceFile: ts.SourceFile, node: ts.TypeNode | undefined): string | undefined {
  if (!node) {
    return undefined;
  }
  if (node.kind === ts.SyntaxKind.StringKeyword) {
    return "string";
  }
  if (node.kind === ts.SyntaxKind.NumberKeyword) {
    return "number";
  }
  if (node.kind === ts.SyntaxKind.SymbolKeyword) {
    return "symbol";
  }
  if (ts.isTemplateLiteralTypeNode(node)) {
    return "template-literal";
  }
  return ts.isTypeReferenceNode(node) ? simpleTypeName(node.getText(sourceFile)) : undefined;
}

function cleanHeritageTypeName(value: string): string | undefined {
  const simple = simpleTypeName(value);
  return simple?.endsWith("Props") ? simple : undefined;
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
