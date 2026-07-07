import * as ts from "typescript";
import { ReactDeclaration, ReactSource, TypeScriptTypeParameter, TypeScriptUnionVariant } from "./reactAnalyzerTypes";
import { reactDeclarationId } from "./reactIds";
import { propUtilitiesFromTypeNode } from "./reactPropUtilities";
import { findMatchingBrace } from "./reactSourceText";
import { simpleTypeName } from "./reactTypeText";
import { rangeFromIndex } from "./textLocation";

export function discoverTypeScriptDeclarations(source: ReactSource): ReactDeclaration[] {
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

export function typeParametersFromGenericText(source: ReactSource, genericText: string | undefined, genericStart: number): TypeScriptTypeParameter[] {
  if (!genericText) {
    return [];
  }

  const sourceFile = ts.createSourceFile("__atlas__.tsx", `function __atlas__${genericText}() {}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const statement = sourceFile.statements[0];
  if (!statement || !ts.isFunctionDeclaration(statement) || !statement.typeParameters) {
    return [];
  }

  const offset = `function __atlas__`.length;
  return statement.typeParameters.map((parameter) => {
    const name = parameter.name.text;
    const constraint = parameter.constraint?.getText(sourceFile);
    const defaultType = parameter.default?.getText(sourceFile);
    const summary = [
      constraint ? `constraint: ${constraint}` : undefined,
      defaultType ? `default: ${defaultType}` : undefined
    ].filter(Boolean).join("; ");
    const start = genericStart + Math.max(0, parameter.getStart(sourceFile) - offset);
    return {
      name,
      summary,
      range: rangeFromIndex(source.text, start, Math.max(1, parameter.end - parameter.getStart(sourceFile))),
      declaration: parameter.getText(sourceFile)
    };
  });
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
    unionVariants: ts.isTypeAliasDeclaration(node) ? discriminatedUnionVariants(source, sourceFile, node.type) : [],
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
