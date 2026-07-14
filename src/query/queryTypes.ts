export interface QueryResponse {
  query: string;
  answer: string;
  confidence: number;
  evidence: Array<Record<string, unknown>>;
  files: string[];
  symbols: string[];
  relationships: Array<Record<string, unknown>>;
  flow: Array<Record<string, unknown>>;
  nextQueries: string[];
  estimatedContextSavings: string;
}

export interface QueryServiceOptions {
  projectContext?: string;
}

export interface RelationshipQueryOptions {
  edgeTypes?: string[];
  limit?: number;
}

export interface QueryContext {
  input: string;
  name: string;
  filePrefix: string;
  symbolPrefix: string;
  projectSymbolPrefix: string;
}

export interface QueryContextAmbiguity {
  requested: string;
  candidates: QueryContext[];
}
