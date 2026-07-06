import { FileRecord, SourceRange } from "../model/records";

export interface ReactSource {
  file: FileRecord;
  text: string;
}

export interface ReactDeclaration {
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
  propsTypeArguments?: string[];
  runtime?: "client" | "server-action" | "server-component";
  exported?: boolean;
  typeParameters?: TypeScriptTypeParameter[];
  unionVariants?: TypeScriptUnionVariant[];
  componentPropsType?: string;
  extendsTypes?: string[];
  propUtilities?: TypeScriptPropUtility[];
  inferredProps?: TypeScriptInferredProp[];
}

export interface TypeScriptPropUtility {
  utility: "Pick" | "Omit" | "Partial" | "Required" | "Readonly" | "Record" | "Mapped";
  targetType?: string;
  keys?: string[];
  keyType?: string;
  valueType?: string;
  optional?: boolean;
}

export interface TypeScriptInferredProp {
  name: string;
  typeName: string;
  optional: boolean;
  readonly: boolean;
  rest?: boolean;
  range: SourceRange;
  declaration: string;
}

export interface TypeScriptTypeParameter {
  name: string;
  summary: string;
  range: SourceRange;
  declaration: string;
}

export interface TypeScriptUnionVariant {
  name: string;
  discriminator: string;
  range: SourceRange;
  declaration: string;
  variantKind: "discriminated-object" | "literal";
}

export interface ImportBinding {
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

export interface ReactMember {
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
  indexSignature?: boolean;
  keyType?: string;
}
