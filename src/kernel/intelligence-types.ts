export const INTELLIGENCE_SCHEMA_VERSION = "0.4.0";
export const INDEX_ENGINE_VERSION = "0.4.1";
export const JS_TS_EXTRACTOR_ID = "js-ts";
export const JS_TS_EXTRACTOR_VERSION = "0.4.1";

export type IndexMode = "fullBuild" | "incrementalUpdate" | "reused";

export type RepoIdentity = {
  gitAvailable: boolean;
  gitHead: string | null;
  dirtyDigest: string;
};
export type IndexConfidence = "high" | "reduced";
export type FileKind = "source" | "test" | "schema" | "config" | "docs" | "manifest" | "binary";
export type EdgeType =
  | "imports"
  | "requires"
  | "dynamic-import"
  | "test-of"
  | "configures"
  | "documents"
  | "interface-reference"
  | "manifest-reference";
export type ImpactRelation =
  | "direct"
  | "dependency"
  | "dependent"
  | "test"
  | "interface"
  | "documentation"
  | "config";
export type ContextLayer = "static" | "semi-stable" | "dynamic";
export type ContextRole = "implementation" | "test" | "review" | "security" | "docs" | "config" | "contract";

export type IndexedFileRecord = {
  path: string;
  contentDigest: string;
  kind: FileKind;
  language: string | null;
  bytes: number;
  hasExportBoundary: boolean;
};

export type GraphNode = {
  path: string;
  kind: FileKind;
  contentDigest: string;
};

export type GraphEdge = {
  type: EdgeType;
  source: string;
  target: string;
  method: string;
  confidence: number;
  evidence: string;
  line?: number;
  sourceDigest: string;
};

export type UnresolvedReference = {
  source: string;
  specifier: string;
  reason: string;
  method: string;
  confidence: number;
  line?: number;
  sourceDigest: string;
};

export type IndexState = {
  schema: "uads.index-state";
  schemaVersion: "0.4.0";
  projectId: string;
  indexDigest: string;
  extractorVersion: string;
  engineVersion: string;
  generatedAt: string;
  updatedAt: string;
  gitHead: string | null;
  dirtyDigest: string;
  gitAvailable: boolean;
  mode: IndexMode;
  confidence: IndexConfidence;
  stale: boolean;
  staleReason: string | null;
  filesConsidered: number;
  filesParsed: number;
  filesReused: number;
  filesRemoved: number;
  durationMs: number;
  unresolvedCount: number;
  nodeCount: number;
  edgeCount: number;
  complete: boolean;
  truncated: boolean;
  truncationReason: string | null;
  files: IndexedFileRecord[];
};

export type DependencyGraph = {
  schema: "uads.dependency-graph";
  schemaVersion: "0.4.0";
  projectId: string;
  indexDigest: string;
  generatedAt: string;
  extractorVersion: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  unresolved: UnresolvedReference[];
};

export type TestRelation = {
  test: string;
  source: string;
  method: string;
  confidence: number;
  evidence: string;
};

export type TestMap = {
  schema: "uads.test-map";
  schemaVersion: "0.4.0";
  projectId: string;
  indexDigest: string;
  generatedAt: string;
  relations: TestRelation[];
};

export type InterfaceContract = {
  path: string;
  kind: "schema" | "cli" | "export" | "config" | "type";
  evidence: string;
  confidence: number;
};

export type InterfaceMap = {
  schema: "uads.interface-map";
  schemaVersion: "0.4.0";
  projectId: string;
  indexDigest: string;
  generatedAt: string;
  contracts: InterfaceContract[];
};

export type ImpactItem = {
  path: string;
  relation: ImpactRelation;
  reason: string;
  confidence: number;
  hops: number;
};

export type ImpactReport = {
  schema: "uads.impact-report";
  schemaVersion: "0.4.0";
  impactReportId: string;
  projectId: string;
  workOrderId: string | null;
  executionRunId: string | null;
  indexDigest: string;
  gitHead: string | null;
  dirtyDigest: string;
  generatedAt: string;
  contextRadius: "C0" | "C1" | "C2" | "C3" | "C4" | "C5";
  seeds: string[];
  inScopeCandidates: ImpactItem[];
  supportingContext: ImpactItem[];
  possibleImpact: ImpactItem[];
  excluded: Array<{ path: string; reason: string }>;
  unresolved: UnresolvedReference[];
  stale: boolean;
  indexConfidence: IndexConfidence;
};

export type ContextPackItem = {
  path: string;
  role: ContextRole;
  relation: ImpactRelation;
  reason: string;
  confidence: number;
  contentDigest: string;
  estimatedTokens: number;
  layer: ContextLayer;
};

export type ContextPack = {
  schema: "uads.context-pack";
  schemaVersion: "0.4.0";
  contextPackId: string;
  projectId: string;
  workOrderId: string | null;
  executionRunId: string | null;
  impactReportId: string;
  indexDigest: string;
  gitHead: string | null;
  dirtyDigest: string;
  generatedAt: string;
  contextRadius: "C0" | "C1" | "C2" | "C3" | "C4" | "C5";
  objective: string | null;
  tokenEstimateMethod: "byte-heuristic";
  estimatedTokens: number;
  items: ContextPackItem[];
  focusedTests: string[];
  contracts: string[];
  docs: string[];
  unresolved: UnresolvedReference[];
  excludedSummary: Array<{ path: string; reason: string }>;
  expansionHistory: Array<{ from: string; to: string; reason: string; at: string }>;
  staticLayerDigest?: string;
  semiStableLayerDigest?: string;
  dynamicLayerDigest?: string;
};

export type IndexBundle = {
  state: IndexState;
  graph: DependencyGraph;
  tests: TestMap;
  interfaces: InterfaceMap;
};

export type ExtractedReference = {
  specifier: string;
  type: EdgeType;
  method: string;
  confidence: number;
  evidence: string;
  line?: number;
  resolved?: boolean;
};

export type LanguageExtractor = {
  id: string;
  version: string;
  match(relativePath: string): boolean;
  extract(input: { path: string; text: string }): ExtractedReference[];
};

export class StaleIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaleIndexError";
  }
}

export class IntelligenceStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntelligenceStateError";
  }
}

export class IndexIncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndexIncompleteError";
  }
}
