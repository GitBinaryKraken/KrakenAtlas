import { FileRecord, ReferenceRecord, RelationshipRecord, SourceRange, SymbolRecord } from "../model/records";

export interface WebAnalyzerResult {
  symbols: SymbolRecord[];
  references: ReferenceRecord[];
  relationships: RelationshipRecord[];
}

export interface HtmlElementSummary {
  id: string;
  selectorKeys: string[];
  name?: string;
  modelBindingTarget?: string;
  file: string;
  range: SourceRange;
}

export interface JavaScriptSource {
  file: FileRecord;
  text: string;
  scriptId: string;
}
