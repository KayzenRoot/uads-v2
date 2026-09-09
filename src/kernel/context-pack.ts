import { sha256Hex } from "../lib/hash.js";
import type { ContextRadius } from "./types.js";
import { newPrefixedId } from "./ids.js";
import type {
  ContextLayer,
  ContextPack,
  ContextPackItem,
  ContextRole,
  ImpactItem,
  ImpactRelation,
  ImpactReport,
  IndexBundle,
} from "./intelligence-types.js";

export function estimateTokensFromBytes(bytes: number): number {
  return Math.max(0, Math.ceil(bytes / 4));
}

function roleFor(relation: ImpactRelation, pathName: string): ContextRole {
  if (relation === "test" || pathName.includes(".test.") || pathName.includes("/tests/")) return "test";
  if (relation === "interface" || pathName.includes("/schemas/")) return "contract";
  if (relation === "documentation" || pathName.endsWith(".md")) return "docs";
  if (relation === "config" || pathName.endsWith(".json") || pathName.endsWith(".yml")) return "config";
  if (pathName.toLowerCase().includes("security")) return "security";
  if (relation === "dependent") return "review";
  return "implementation";
}

function layerFor(item: ImpactItem, pathName: string): ContextLayer {
  if (pathName.startsWith("docs/") || pathName === "README.md") return "static";
  if (item.relation === "interface" || item.relation === "config" || pathName.includes("/schemas/")) return "semi-stable";
  return "dynamic";
}

const LAYER_ORDER: Record<ContextLayer, number> = { static: 0, "semi-stable": 1, dynamic: 2 };

export function computeLayerDigest(items: ContextPackItem[], layer: ContextLayer): string {
  const parts = items
    .filter((item) => item.layer === layer)
    .map((item) => `${item.path}:${item.contentDigest}`)
    .sort((a, b) => a.localeCompare(b));
  return sha256Hex(parts.join("|") || layer);
}

export function itemsForRole(pack: ContextPack, role: ContextRole): ContextPackItem[] {
  return pack.items.filter((item) => item.role === role);
}

export function buildContextPack(input: {
  bundle: IndexBundle;
  report: ImpactReport;
  projectId: string;
  workOrderId: string | null;
  executionRunId: string | null;
  radius: ContextRadius;
  objective: string | null;
  expansionHistory: Array<{ from: string; to: string; reason: string; at: string }>;
}): ContextPack {
  if (input.report.projectId !== input.projectId || input.bundle.state.projectId !== input.projectId) {
    throw new Error("cross-project Context Pack rejected");
  }
  if (input.workOrderId && input.report.workOrderId && input.report.workOrderId !== input.workOrderId) {
    throw new Error("cross-work-order Context Pack rejected");
  }
  if (input.report.indexDigest !== input.bundle.state.indexDigest) {
    throw new Error("stale impact report rejected");
  }

  const digestByPath = new Map(input.bundle.state.files.map((file) => [file.path, file]));
  const combined: ImpactItem[] = [
    ...input.report.inScopeCandidates,
    ...input.report.supportingContext,
    ...input.report.possibleImpact,
  ];
  const items: ContextPackItem[] = [];
  for (const item of combined) {
    const file = digestByPath.get(item.path);
    if (!file) continue;
    items.push({
      path: item.path,
      role: roleFor(item.relation, item.path),
      relation: item.relation,
      reason: item.reason,
      confidence: item.confidence,
      contentDigest: file.contentDigest,
      estimatedTokens: estimateTokensFromBytes(file.bytes),
      layer: layerFor(item, item.path),
    });
  }
  items.sort((a, b) => {
    const layer = LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer];
    if (layer !== 0) return layer;
    return a.path.localeCompare(b.path);
  });

  const focusedTests = [...new Set(items.filter((item) => item.role === "test").map((item) => item.path))];
  const contracts = [...new Set(items.filter((item) => item.role === "contract").map((item) => item.path))];
  const docs = [...new Set(items.filter((item) => item.role === "docs").map((item) => item.path))];
  const estimatedTokens = items.reduce((sum, item) => sum + item.estimatedTokens, 0);
  const contextPackId = newPrefixedId(
    "cpk",
    `${input.projectId}:${input.workOrderId ?? ""}:${input.report.impactReportId}:${input.radius}`,
  );

  return {
    schema: "uads.context-pack",
    schemaVersion: "0.4.0",
    contextPackId,
    projectId: input.projectId,
    workOrderId: input.workOrderId,
    executionRunId: input.executionRunId,
    impactReportId: input.report.impactReportId,
    indexDigest: input.bundle.state.indexDigest,
    gitHead: input.bundle.state.gitHead,
    dirtyDigest: input.bundle.state.dirtyDigest,
    generatedAt: new Date().toISOString(),
    contextRadius: input.radius,
    objective: input.objective,
    tokenEstimateMethod: "byte-heuristic",
    estimatedTokens,
    items,
    focusedTests,
    contracts,
    docs,
    unresolved: input.report.unresolved,
    excludedSummary: input.report.excluded,
    expansionHistory: input.expansionHistory,
    staticLayerDigest: computeLayerDigest(items, "static"),
    semiStableLayerDigest: computeLayerDigest(items, "semi-stable"),
    dynamicLayerDigest: computeLayerDigest(items, "dynamic"),
  };
}
