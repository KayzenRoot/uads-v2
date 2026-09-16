import { canonicalDigest } from "./upir.js";
import type { ProofRecord, ProofType } from "./proof-record.js";

export const PROOF_DEPENDENCY_PRODUCER = "gef-proof-dependency/1.0.0" as const;

export type ProofDependencyNode = { proofId: string; proofType: ProofType; proofDigest: string; dependsOn: string[] };
export type ProofDependencyEdge = { from: string; to: string };
export type ProofDependencyGraph = {
  producerVersion: string;
  nodes: ProofDependencyNode[];
  edges: ProofDependencyEdge[];
  cycles: string[][];
  collapsed: string[];
  dependencyDigest: string;
};

export type InvalidationReasonCode =
  | "SOURCE_DIGEST_CHANGED"
  | "CONFIG_CHANGED"
  | "TOOLCHAIN_CHANGED"
  | "PLATFORM_CHANGED"
  | "ENV_CLASS_CHANGED"
  | "GRAPH_STALE"
  | "UPSTREAM_PROOF_INVALID"
  | "DEPENDENCY_MISSING"
  | "DEPENDENCY_UNKNOWN"
  | "PROOF_CYCLE_COLLAPSED"
  | "BASIS_MISMATCH"
  | "NO_PRIOR_PROOF";

export type InvalidationOutcome = { proofId: string; reusable: boolean; reasonCode: InvalidationReasonCode; via: string[] };

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

// Iterative Tarjan SCC: a dependency cycle is a real hazard for reuse, and the
// walk is explicit so deep graphs cannot overflow the stack.
function stronglyConnectedComponents(nodeIds: string[], edges: ProofDependencyEdge[]): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const id of nodeIds) adjacency.set(id, []);
  for (const edge of edges) {
    if (!adjacency.has(edge.from) || !adjacency.has(edge.to)) continue;
    (adjacency.get(edge.from) as string[]).push(edge.to);
  }
  for (const bucket of adjacency.values()) bucket.sort();

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  for (const root of [...nodeIds].sort()) {
    if (index.has(root)) continue;
    const work: Array<{ node: string; next: number }> = [{ node: root, next: 0 }];
    index.set(root, counter);
    low.set(root, counter);
    counter += 1;
    stack.push(root);
    onStack.add(root);
    while (work.length > 0) {
      const frame = work[work.length - 1] as { node: string; next: number };
      const neighbours = adjacency.get(frame.node) ?? [];
      if (frame.next < neighbours.length) {
        const target = neighbours[frame.next] as string;
        frame.next += 1;
        if (!index.has(target)) {
          index.set(target, counter);
          low.set(target, counter);
          counter += 1;
          stack.push(target);
          onStack.add(target);
          work.push({ node: target, next: 0 });
        } else if (onStack.has(target)) {
          low.set(frame.node, Math.min(low.get(frame.node) ?? 0, index.get(target) ?? 0));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.node, Math.min(low.get(parent.node) ?? 0, low.get(frame.node) ?? 0));
      if (low.get(frame.node) === index.get(frame.node)) {
        const component: string[] = [];
        while (stack.length > 0) {
          const popped = stack.pop() as string;
          onStack.delete(popped);
          component.push(popped);
          if (popped === frame.node) break;
        }
        components.push(component.sort());
      }
    }
  }
  return components.filter((component) => component.length > 1 || edges.some((edge) => edge.from === component[0] && edge.to === component[0])).sort((left, right) => (left[0]! < right[0]! ? -1 : 1));
}

export function buildProofDependencyGraph(records: ProofRecord[]): ProofDependencyGraph {
  const known = new Set(records.map((record) => record.proofId));
  const nodes: ProofDependencyNode[] = records
    .map((record) => ({
      proofId: record.proofId,
      proofType: record.proofType,
      proofDigest: record.proofDigest,
      // References outside the supplied record set stay in the graph: a missing
      // dependency is knowledge about reuse, not something to drop silently.
      dependsOn: sortedUnique(record.dependsOn),
    }))
    .sort((left, right) => (left.proofId < right.proofId ? -1 : 1));
  const edges: ProofDependencyEdge[] = [];
  for (const node of nodes) {
    for (const dependency of node.dependsOn) edges.push({ from: node.proofId, to: dependency });
  }
  edges.sort((left, right) => (left.from < right.from ? -1 : left.from > right.from ? 1 : left.to < right.to ? -1 : 1));
  const nodeIds = sortedUnique([...nodes.map((node) => node.proofId), ...edges.map((edge) => edge.to)]);
  const cycles = stronglyConnectedComponents(nodeIds, edges);
  const collapsed = sortedUnique(cycles.flat());
  void known;
  const withoutDigest = {
    producerVersion: PROOF_DEPENDENCY_PRODUCER,
    nodes,
    edges,
    cycles,
    collapsed,
  };
  return { ...withoutDigest, dependencyDigest: canonicalDigest(withoutDigest) };
}

export function detectProofCycles(records: ProofRecord[]): string[][] {
  return buildProofDependencyGraph(records).cycles;
}

// Transitive invalidation: a proof whose upstream dependency is not reusable is
// itself not reusable. Cycles are collapsed into one conservative invalid set,
// and unknown or absent dependencies always fail closed.
export function transitiveInvalidation(input: {
  records: ProofRecord[];
  directlyInvalidated: Map<string, { reasonCode: InvalidationReasonCode; via: string[] }>;
}): { outcomes: InvalidationOutcome[]; dependencyDigest: string } {
  const graph = buildProofDependencyGraph(input.records);
  const byId = new Map(input.records.map((record) => [record.proofId, record]));
  const invalidated = new Map<string, { reasonCode: InvalidationReasonCode; via: string[] }>();
  for (const [proofId, detail] of input.directlyInvalidated) invalidated.set(proofId, detail);
  for (const proofId of graph.collapsed) {
    if (byId.has(proofId)) invalidated.set(proofId, { reasonCode: "PROOF_CYCLE_COLLAPSED", via: [] });
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const node of graph.nodes) {
      if (invalidated.has(node.proofId)) continue;
      for (const dependency of node.dependsOn) {
        if (!byId.has(dependency)) {
          invalidated.set(node.proofId, { reasonCode: "DEPENDENCY_MISSING", via: [dependency] });
          changed = true;
          break;
        }
        const upstream = invalidated.get(dependency);
        if (upstream) {
          invalidated.set(node.proofId, { reasonCode: "UPSTREAM_PROOF_INVALID", via: [dependency] });
          changed = true;
          break;
        }
      }
    }
    if (graph.collapsed.length > 0) {
      for (const proofId of graph.collapsed) {
        for (const node of graph.nodes) {
          if (node.proofId === proofId) continue;
          if (node.dependsOn.includes(proofId) && !invalidated.has(node.proofId)) {
            invalidated.set(node.proofId, { reasonCode: "UPSTREAM_PROOF_INVALID", via: [proofId] });
            changed = true;
          }
        }
      }
    }
  }

  const outcomes: InvalidationOutcome[] = graph.nodes.map((node) => {
    const detail = invalidated.get(node.proofId);
    return detail
      ? { proofId: node.proofId, reusable: false, reasonCode: detail.reasonCode, via: sortedUnique(detail.via) }
      : { proofId: node.proofId, reusable: true, reasonCode: "NO_PRIOR_PROOF", via: [] };
  });
  return { outcomes, dependencyDigest: graph.dependencyDigest };
}

// Reason selection for a proof whose exact basis is no longer present: compare
// only bounded, non-secret class digests, and fall back to a generic mismatch
// rather than inventing a precise-sounding cause.
export function invalidationReasonFor(input: {
  expected: { sourceBasis: string; configBasis: string; toolchain: string; platform: string; envClass: string; graphVersion: string };
  prior: { sourceBasis: string; configBasis: string; toolchain: string; platform: string; envClass: string; graphVersion: string };
}): InvalidationReasonCode {
  if (input.expected.sourceBasis !== input.prior.sourceBasis) return "SOURCE_DIGEST_CHANGED";
  if (input.expected.configBasis !== input.prior.configBasis) return "CONFIG_CHANGED";
  if (input.expected.toolchain !== input.prior.toolchain) return "TOOLCHAIN_CHANGED";
  if (input.expected.platform !== input.prior.platform) return "PLATFORM_CHANGED";
  if (input.expected.envClass !== input.prior.envClass) return "ENV_CLASS_CHANGED";
  if (input.expected.graphVersion !== input.prior.graphVersion) return "GRAPH_STALE";
  return "BASIS_MISMATCH";
}

export function basisClassDigests(input: {
  sourceDigests: Array<{ path: string; digest: string | null }>;
  configDigests: Array<{ path: string; digest: string | null }>;
}): { sourceBasis: string; configBasis: string } {
  return {
    sourceBasis: canonicalDigest([...input.sourceDigests].sort((left, right) => (left.path < right.path ? -1 : 1))),
    configBasis: canonicalDigest([...input.configDigests].sort((left, right) => (left.path < right.path ? -1 : 1))),
  };
}
