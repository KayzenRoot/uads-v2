import type { ContextRadius } from "./types.js";
import { newPrefixedId } from "./ids.js";
import { assertSafeRelativeProjectPath } from "./safe-path.js";
import type {
  GraphEdge,
  ImpactItem,
  ImpactRelation,
  ImpactReport,
  IndexBundle,
  UnresolvedReference,
} from "./intelligence-types.js";
import { IndexIncompleteError } from "./intelligence-types.js";

const CODE_DEP_TYPES = new Set(["imports", "requires", "dynamic-import"]);
const STRUCTURAL_TYPES = new Set(["documents", "configures", "manifest-reference"]);

function reverseStructuralRelation(type: string): ImpactRelation {
  if (type === "documents") return "documentation";
  return "config";
}

export function hopsForRadius(radius: ContextRadius): { depHops: number; includeLocal: boolean; includeAll: boolean } {
  switch (radius) {
    case "C0":
      return { depHops: -1, includeLocal: false, includeAll: false };
    case "C1":
      return { depHops: 0, includeLocal: false, includeAll: false };
    case "C2":
      return { depHops: 0, includeLocal: true, includeAll: false };
    case "C3":
      return { depHops: 1, includeLocal: true, includeAll: false };
    case "C4":
      return { depHops: 2, includeLocal: true, includeAll: false };
    case "C5":
      return { depHops: 99, includeLocal: true, includeAll: true };
  }
}

export function normalizeSeedPaths(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    try {
      out.push(assertSafeRelativeProjectPath(value));
    } catch {
      throw new Error(`unsafe impact path rejected: ${value}`);
    }
  }
  return [...new Set(out)].sort((a, b) => a.localeCompare(b));
}

export function resolveSeeds(input: {
  requested: string[];
  affectedAreas: string[];
  indexed: Set<string>;
}): { seeds: string[]; excluded: Array<{ path: string; reason: string }> } {
  const excluded: Array<{ path: string; reason: string }> = [];
  const seeds = new Set<string>();
  const prefixes = [...input.requested, ...input.affectedAreas];
  for (const raw of prefixes) {
    let safe: string;
    try {
      safe = assertSafeRelativeProjectPath(raw);
    } catch {
      excluded.push({ path: raw, reason: "unsafe path rejected" });
      continue;
    }
    if (input.indexed.has(safe)) {
      seeds.add(safe);
      continue;
    }
    let matched = false;
    for (const pathName of input.indexed) {
      if (pathName === safe || pathName.startsWith(`${safe}/`)) {
        seeds.add(pathName);
        matched = true;
      }
    }
    if (!matched) {
      excluded.push({ path: safe, reason: "not in current index" });
    }
  }
  return { seeds: [...seeds].sort((a, b) => a.localeCompare(b)), excluded };
}

function neighbors(edges: GraphEdge[], pathName: string, direction: "out" | "in"): GraphEdge[] {
  return edges.filter((edge) => (direction === "out" ? edge.source === pathName : edge.target === pathName));
}

function sameDir(a: string, b: string): boolean {
  const da = a.includes("/") ? a.slice(0, a.lastIndexOf("/")) : "";
  const db = b.includes("/") ? b.slice(0, b.lastIndexOf("/")) : "";
  return da === db;
}

function topFolder(pathName: string): string {
  return pathName.split("/")[0] ?? pathName;
}

export function analyzeImpact(input: {
  bundle: IndexBundle;
  projectId: string;
  workOrderId: string | null;
  executionRunId: string | null;
  radius: ContextRadius;
  requestedPaths: string[];
  affectedAreas: string[];
  approveC5?: boolean;
}): ImpactReport {
  if (input.bundle.state.projectId !== input.projectId) {
    throw new Error("cross-project index artifact rejected");
  }
  if (input.bundle.state.complete === false || input.bundle.state.truncated) {
    throw new IndexIncompleteError(
      input.bundle.state.truncationReason ?? "index is incomplete and cannot drive impact analysis",
    );
  }
  if (input.radius === "C5" && !input.approveC5) {
    throw new Error("C5 is exceptional and blocked by default");
  }
  const indexed = new Set(input.bundle.graph.nodes.map((node) => node.path));
  const requested = normalizeSeedPaths(input.requestedPaths);
  const { seeds, excluded } = resolveSeeds({
    requested,
    affectedAreas: input.affectedAreas,
    indexed,
  });
  const limits = hopsForRadius(input.radius);
  const items = new Map<string, ImpactItem>();
  const add = (item: ImpactItem): void => {
    const current = items.get(item.path);
    if (!current || item.hops < current.hops) {
      items.set(item.path, item);
    }
  };

  if (limits.depHops >= 0) {
    for (const seed of seeds) {
      add({ path: seed, relation: "direct", reason: "directly named or changed file", confidence: 1, hops: 0 });
    }
  }

  if (limits.includeLocal) {
    for (const seed of seeds) {
      for (const edge of input.bundle.graph.edges) {
        if (edge.type === "test-of" && edge.target === seed) {
          add({
            path: edge.source,
            relation: "test",
            reason: "focused test related to seed (not a sufficiency claim)",
            confidence: edge.confidence,
            hops: 0,
          });
        }
        if (edge.type === "interface-reference" && (edge.source === seed || edge.target === seed)) {
          const pathName = edge.source === seed ? edge.target : edge.source;
          add({
            path: pathName,
            relation: "interface",
            reason: "connected explicit contract",
            confidence: edge.confidence,
            hops: 0,
          });
        }
        if (STRUCTURAL_TYPES.has(edge.type) && edge.target === seed) {
          add({
            path: edge.source,
            relation: reverseStructuralRelation(edge.type),
            reason: `reverse ${edge.type} from ${edge.source} (${edge.method})`,
            confidence: edge.confidence,
            hops: 0,
          });
        }
      }
      for (const node of input.bundle.graph.nodes) {
        if (node.path === seed) continue;
        if (sameDir(node.path, seed) && (node.kind === "source" || node.kind === "test" || node.kind === "schema")) {
          add({
            path: node.path,
            relation: node.kind === "test" ? "test" : node.kind === "schema" ? "interface" : "direct",
            reason: "owning/local module neighbor",
            confidence: 0.45,
            hops: 0,
          });
        }
      }
      for (const contract of input.bundle.interfaces.contracts) {
        if (sameDir(contract.path, seed) || contract.path === seed) {
          add({
            path: contract.path,
            relation: contract.kind === "config" ? "config" : "interface",
            reason: contract.evidence,
            confidence: contract.confidence,
            hops: 0,
          });
        }
      }
    }
  }

  if (limits.depHops > 0) {
    const queue: Array<{ path: string; hops: number }> = seeds.map((pathName) => ({ path: pathName, hops: 0 }));
    const visited = new Set<string>(seeds);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      if (current.hops >= limits.depHops) continue;
      for (const edge of neighbors(input.bundle.graph.edges, current.path, "out")) {
        if (!CODE_DEP_TYPES.has(edge.type) && !STRUCTURAL_TYPES.has(edge.type)) continue;
        if (visited.has(edge.target)) continue;
        visited.add(edge.target);
        const hops = current.hops + 1;
        const relation: ImpactRelation =
          edge.type === "documents"
            ? "documentation"
            : edge.type === "configures" || edge.type === "manifest-reference"
              ? "config"
              : "dependency";
        add({
          path: edge.target,
          relation,
          reason: `${edge.type} from ${edge.source} (${edge.method})`,
          confidence: edge.confidence,
          hops,
        });
        queue.push({ path: edge.target, hops });
      }
      for (const edge of neighbors(input.bundle.graph.edges, current.path, "in")) {
        if (!CODE_DEP_TYPES.has(edge.type) && !STRUCTURAL_TYPES.has(edge.type)) continue;
        if (visited.has(edge.source)) continue;
        visited.add(edge.source);
        const hops = current.hops + 1;
        const relation: ImpactRelation = STRUCTURAL_TYPES.has(edge.type)
          ? reverseStructuralRelation(edge.type)
          : "dependent";
        add({
          path: edge.source,
          relation,
          reason: `reverse ${edge.type} from ${edge.source} (${edge.method})`,
          confidence: edge.confidence,
          hops,
        });
        queue.push({ path: edge.source, hops });
      }
    }
  }

  if (limits.includeAll) {
    for (const node of input.bundle.graph.nodes) {
      if (!items.has(node.path)) {
        add({
          path: node.path,
          relation: "dependent",
          reason: "C5 repository-wide inclusion after explicit approval",
          confidence: 0.3,
          hops: 3,
        });
      }
    }
  } else if (input.radius === "C4") {
    for (const seed of seeds) {
      const folder = topFolder(seed);
      for (const node of input.bundle.graph.nodes) {
        if (topFolder(node.path) === folder && !items.has(node.path)) {
          add({
            path: node.path,
            relation: "dependent",
            reason: "connected subsystem folder at C4",
            confidence: 0.35,
            hops: 2,
          });
        }
      }
    }
  }

  const inScope: ImpactItem[] = [];
  const supporting: ImpactItem[] = [];
  const possible: ImpactItem[] = [];
  for (const item of [...items.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    if (item.relation === "direct") inScope.push(item);
    else if (item.hops >= 2) possible.push(item);
    else supporting.push(item);
  }

  const seedUnresolved: UnresolvedReference[] = input.bundle.graph.unresolved
    .filter((item) => seeds.includes(item.source) || items.has(item.source))
    .sort((a, b) => `${a.source}\0${a.specifier}`.localeCompare(`${b.source}\0${b.specifier}`));

  const impactReportId = newPrefixedId(
    "imp",
    `${input.projectId}:${input.workOrderId ?? ""}:${input.bundle.state.indexDigest}:${input.radius}:${seeds.join(",")}`,
  );

  return {
    schema: "uads.impact-report",
    schemaVersion: "0.4.0",
    impactReportId,
    projectId: input.projectId,
    workOrderId: input.workOrderId,
    executionRunId: input.executionRunId,
    indexDigest: input.bundle.state.indexDigest,
    gitHead: input.bundle.state.gitHead,
    dirtyDigest: input.bundle.state.dirtyDigest,
    generatedAt: new Date().toISOString(),
    contextRadius: input.radius,
    seeds,
    inScopeCandidates: inScope,
    supportingContext: supporting,
    possibleImpact: possible,
    excluded,
    unresolved: seedUnresolved,
    stale: false,
    indexConfidence: input.bundle.state.confidence,
  };
}
