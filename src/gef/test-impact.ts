import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { findPackageRoot } from "../lib/version.js";
import { canonicalDigest } from "./upir.js";
import { listCommandContracts, proofTypeForContract, type CommandProofType } from "./command-contract.js";
import { worktreeBasisKey, type DiffFacts } from "./git-facts.js";
import type { ImpactGraph, ImpactGraphState, ImpactNode } from "./impact-graph.js";

export const IMPACT_RESULT_SCHEMA_VERSION = "0.1.0" as const;
export const IMPACT_RESULT_SCHEMA_FILE = "gef-impact-result.schema.json" as const;
export const IMPACT_RESULT_PRODUCER = "gef-test-impact/1.0.0" as const;
export const IMPACT_MAX_REACH = 64;

export type ImpactReason =
  | "DIRECT_SOURCE_CHANGE"
  | "DIRECT_TEST_CHANGE"
  | "INTERFACE_DEPENDENCY"
  | "SCHEMA_DEPENDENCY"
  | "CONFIG_DEPENDENCY"
  | "LOCKFILE_CHANGE"
  | "PREVIOUS_PATH_DEPENDENCY"
  | "GRAPH_EXPANSION";

export type ImpactSelection = { proofKey: string; commandId: string; proofType: CommandProofType; reason: ImpactReason; via?: string[] };

export type ImpactResult = {
  schemaVersion: typeof IMPACT_RESULT_SCHEMA_VERSION;
  projectFingerprint: string;
  taskId: string;
  candidateDigest: string | null;
  graphDigest: string | null;
  graphState: ImpactGraphState;
  changedPaths: string[];
  impactedNodes: string[];
  selected: ImpactSelection[];
  skipped: Array<{ proofKey: string; reason: string }>;
  uncertainty: string[];
  expansionState: "NONE" | "IMPACT_EXPANSION_REQUIRED";
  minimumAssurance: "A0" | "A1" | "A2";
  limitations: string[];
  impactDigest: string;
};

export type TestImpactInput = {
  taskId: string;
  projectFingerprint: string;
  facts: DiffFacts;
  graph: ImpactGraph | null;
  graphState: ImpactGraphState;
  graphReasons?: string[];
};

type Reach = { depthByNode: Map<string, number>; truncated: boolean };

// Reverse dependency walk over import/schema relations: who is affected by this
// node. The walk is bounded and deterministic; hitting the bound is recorded as
// uncertainty so the caller expands instead of trusting a partial answer.
function reverseReach(graph: ImpactGraph, startIds: string[], maxReach: number): Reach {
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.relation !== "IMPORTS" && edge.relation !== "VALIDATED_BY") continue;
    const bucket = incoming.get(edge.to);
    if (bucket) bucket.push(edge.from);
    else incoming.set(edge.to, [edge.from]);
  }
  for (const bucket of incoming.values()) bucket.sort();
  const depthByNode = new Map<string, number>();
  for (const start of startIds) depthByNode.set(start, 0);
  const queue = [...startIds].sort();
  let truncated = false;
  while (queue.length > 0) {
    if (depthByNode.size > maxReach) {
      truncated = true;
      break;
    }
    const current = queue.shift() as string;
    const depth = depthByNode.get(current) ?? 0;
    for (const dependent of incoming.get(current) ?? []) {
      if (depthByNode.has(dependent)) continue;
      depthByNode.set(dependent, depth + 1);
      queue.push(dependent);
    }
  }
  return { depthByNode, truncated };
}

function testPathFor(node: ImpactNode | undefined): string | null {
  if (!node || (node.kind !== "TEST" && node.kind !== "EVAL")) return null;
  return node.path;
}

export function computeTestImpact(input: TestImpactInput): ImpactResult {
  const contracts = listCommandContracts(false);
  const registered = new Set(contracts.map((contract) => contract.id));
  const limitations = new Set<string>(["REGISTERED_CONTRACTS_ONLY"]);
  const uncertainty = new Set<string>(input.graphReasons ?? []);
  const selected = new Map<string, ImpactSelection>();
  const impacted = new Set<string>();

  const select = (commandId: string, reason: ImpactReason, via: string[]): void => {
    if (!registered.has(commandId)) {
      uncertainty.add("IMPACTED_PROOF_WITHOUT_REGISTERED_CONTRACT");
      return;
    }
    const existing = selected.get(commandId);
    if (existing && existing.reason !== "GRAPH_EXPANSION") return;
    selected.set(commandId, {
      proofKey: commandId,
      commandId,
      proofType: proofTypeForContract(commandId),
      reason,
      via: [...new Set(via)].sort().slice(0, 16),
    });
  };

  const contractForTestPath = new Map<string, string>();
  for (const contract of contracts) {
    if (proofTypeForContract(contract.id) !== "TEST" && proofTypeForContract(contract.id) !== "EVAL") continue;
    const target = contract.args[contract.args.length - 1] ?? "";
    if (target.length > 0) contractForTestPath.set(target, contract.id);
  }
  const mechanicalContracts = contracts.filter((contract) => {
    const proofType = proofTypeForContract(contract.id);
    return proofType === "TYPECHECK" || proofType === "BUILD";
  });

  const graph = input.graph;

  // Unknown, stale or corrupt graph state: every registered proof is selected.
  // Uncertainty may broaden assurance, never narrow it.
  if (graph === null || input.graphState !== "CURRENT") {
    for (const contract of contracts) select(contract.id, "GRAPH_EXPANSION", [`GRAPH_STATE_${input.graphState}`]);
    uncertainty.add(`GRAPH_STATE_${input.graphState}`);
    return finalize({ input, selected, impacted: [...impacted].sort(), uncertainty: [...uncertainty].sort(), expansionState: "IMPACT_EXPANSION_REQUIRED", limitations: [...limitations].sort() });
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const findByPath = (relative: string): ImpactNode | undefined => graph.nodes.find((node) => node.path === relative);

  const selectDependents = (startNode: ImpactNode, viaPath: string, fallbackReason: ImpactReason, previousIdentity: boolean): void => {
    const reach = reverseReach(graph, [startNode.id], IMPACT_MAX_REACH);
    if (reach.truncated) uncertainty.add("IMPACT_REACH_TRUNCATED");
    const scopedTests = new Map<string, number>();
    for (const [nodeId, depth] of reach.depthByNode) {
      impacted.add(nodeId);
      const path = testPathFor(nodeById.get(nodeId));
      if (path === null) continue;
      const existing = scopedTests.get(path);
      if (existing === undefined || depth < existing) scopedTests.set(path, depth);
    }
    const multiple = scopedTests.size > 1;
    for (const [testPath, depth] of [...scopedTests.entries()].sort(([left], [right]) => (left < right ? -1 : 1))) {
      const commandId = contractForTestPath.get(testPath);
      if (commandId === undefined) {
        uncertainty.add("IMPACTED_TEST_WITHOUT_REGISTERED_CONTRACT");
        limitations.add("UNREGISTERED_IMPACTED_TEST");
        continue;
      }
      const reason: ImpactReason = previousIdentity ? "PREVIOUS_PATH_DEPENDENCY" : depth <= 1 && !multiple ? fallbackReason : fallbackReason === "SCHEMA_DEPENDENCY" ? "SCHEMA_DEPENDENCY" : "INTERFACE_DEPENDENCY";
      select(commandId, reason, [viaPath]);
    }
  };

  for (const file of input.facts.changedFiles) {
    impacted.add(`CHANGED:${file.path}`);
    const node = findByPath(file.path);
    const previousNode = file.previousPath === undefined ? undefined : findByPath(file.previousPath);

    if (node === undefined && previousNode === undefined) {
      uncertainty.add("GRAPH_NODE_MISSING");
      continue;
    }

    const directContract = contractForTestPath.get(file.path);
    if (directContract !== undefined) {
      select(directContract, "DIRECT_TEST_CHANGE", [file.path]);
      if (node) impacted.add(node.id);
    }

    if (node && (node.kind === "SOURCE_FILE" || node.kind === "EVAL")) {
      impacted.add(node.id);
      selectDependents(node, file.path, "DIRECT_SOURCE_CHANGE", false);
      for (const contract of mechanicalContracts) select(contract.id, "DIRECT_SOURCE_CHANGE", [file.path]);
    }

    if (node?.kind === "SCHEMA") {
      impacted.add(node.id);
      selectDependents(node, file.path, "SCHEMA_DEPENDENCY", false);
    }

    if (node?.kind === "CONFIG" || node?.kind === "LOCKFILE") {
      impacted.add(node.id);
      const reason: ImpactReason = node.kind === "LOCKFILE" ? "LOCKFILE_CHANGE" : "CONFIG_DEPENDENCY";
      for (const edge of graph.edges) {
        if (edge.from !== node.id || edge.relation !== "CONFIGURES") continue;
        const target = nodeById.get(edge.to);
        if (!target || target.kind !== "COMMAND_CONTRACT") continue;
        select(target.label, reason, [file.path]);
      }
    }

    // A rename or delete must keep the previous identity: dependents of the old
    // path are impacted even though that path no longer exists.
    if (previousNode) {
      limitations.add("RENAME_RESOLVED_VIA_PREVIOUS_IDENTITY");
      impacted.add(previousNode.id);
      selectDependents(previousNode, file.previousPath ?? file.path, "PREVIOUS_PATH_DEPENDENCY", true);
    }
  }

  const expansionState = uncertainty.has("IMPACT_REACH_TRUNCATED") || uncertainty.has("GRAPH_NODE_MISSING") || uncertainty.has("IMPACTED_TEST_WITHOUT_REGISTERED_CONTRACT")
    ? "IMPACT_EXPANSION_REQUIRED"
    : "NONE";

  return finalize({ input, selected, impacted: [...impacted].sort(), uncertainty: [...uncertainty].sort(), expansionState, limitations: [...limitations].sort() });
}

function finalize(input: {
  input: TestImpactInput;
  selected: Map<string, ImpactSelection>;
  impacted: string[];
  uncertainty: string[];
  expansionState: "NONE" | "IMPACT_EXPANSION_REQUIRED";
  limitations: string[];
}): ImpactResult {
  const selected = [...input.selected.values()].sort((left, right) => (left.proofKey < right.proofKey ? -1 : left.proofKey > right.proofKey ? 1 : 0));
  const skipped = listCommandContracts(false)
    .filter((contract) => !selected.some((entry) => entry.commandId === contract.id))
    .map((contract) => ({ proofKey: contract.id, reason: "NOT_IMPACTED" }))
    .sort((left, right) => (left.proofKey < right.proofKey ? -1 : 1));
  const fanout = selected.some(
    (entry) =>
      entry.reason === "INTERFACE_DEPENDENCY" ||
      entry.reason === "SCHEMA_DEPENDENCY" ||
      entry.reason === "CONFIG_DEPENDENCY" ||
      entry.reason === "LOCKFILE_CHANGE" ||
      entry.reason === "PREVIOUS_PATH_DEPENDENCY",
  );
  const uncertainty = [...new Set(input.uncertainty)].sort();
  const minimumAssurance: "A0" | "A1" | "A2" = selected.length === 0 ? "A0" : fanout || uncertainty.length > 0 ? "A2" : "A1";
  const withoutDigest = {
    schemaVersion: IMPACT_RESULT_SCHEMA_VERSION,
    projectFingerprint: input.input.projectFingerprint,
    taskId: input.input.taskId,
    candidateDigest: worktreeBasisKey(input.input.facts),
    graphDigest: input.input.graph?.graphDigest ?? null,
    graphState: input.input.graphState,
    changedPaths: [...input.input.facts.changedFiles.map((file) => file.path)].sort(),
    impactedNodes: input.impacted,
    selected,
    skipped,
    uncertainty,
    expansionState: input.expansionState,
    minimumAssurance,
    limitations: [...new Set(input.limitations)].sort(),
  };
  const result: ImpactResult = { ...withoutDigest, impactDigest: canonicalDigest(withoutDigest) };
  assertSchema(IMPACT_RESULT_SCHEMA_FILE, result, findPackageRoot());
  return result;
}

export function validateImpactResult(data: unknown, schemaRoot?: string): string[] {
  return validateAgainstSchema(IMPACT_RESULT_SCHEMA_FILE, data, schemaRoot ?? findPackageRoot());
}
