import { findPackageRoot } from "../lib/version.js";
import type { UadsPaths } from "../lib/workspace.js";
import type { ContextRadius, WorkOrder } from "./types.js";
import { applyLedgerPatch } from "./cost-governor.js";
import { readCostLedger } from "./cost-persist.js";
import { buildOrRefreshIndex, readRepoIdentity } from "./index-engine.js";
import {
  assertIndexCurrent,
  assertIndexMatchesProject,
  persistContextPack,
  persistImpactReport,
  readCurrentContextPack,
  readImpactReport,
  readIndexBundle,
} from "./intelligence-persist.js";
import { analyzeImpact } from "./impact.js";
import { buildContextPack } from "./context-pack.js";
import type { ContextPack, ImpactReport, IndexBundle } from "./intelligence-types.js";
import { IndexIncompleteError, StaleIndexError } from "./intelligence-types.js";

export function refreshIndex(input: {
  repoRoot: string;
  projectId: string;
  paths: UadsPaths;
  schemaRoot?: string;
  forceFull?: boolean;
}): IndexBundle {
  const bundle = buildOrRefreshIndex({
    repoRoot: input.repoRoot,
    projectId: input.projectId,
    paths: input.paths,
    schemaRoot: input.schemaRoot ?? findPackageRoot(),
    forceFull: input.forceFull,
  });
  if (bundle.state.mode === "fullBuild") {
    try {
      const current = readCostLedger(input.paths, input.projectId);
      applyLedgerPatch(input.paths, input.projectId, {
        fullRepositoryScans: (current?.fullRepositoryScans ?? 0) + 1,
      });
    } catch {
      // Scan accounting must not fail the index build.
    }
  }
  return bundle;
}

export function currentOrRefreshIndex(input: {
  repoRoot: string;
  projectId: string;
  paths: UadsPaths;
  schemaRoot?: string;
}): IndexBundle {
  const schemaRoot = input.schemaRoot ?? findPackageRoot();
  const identity = readRepoIdentity(input.repoRoot);
  const existing = readIndexBundle(input.paths, schemaRoot);
  if (existing) {
    try {
      assertIndexMatchesProject(existing, input.projectId);
      assertIndexCurrent(existing, identity);
      return existing;
    } catch (error) {
      if (error instanceof IndexIncompleteError) {
        return refreshIndex({ ...input, schemaRoot, forceFull: true });
      }
      if (!(error instanceof StaleIndexError)) {
        return refreshIndex({ ...input, schemaRoot, forceFull: true });
      }
    }
  }
  return refreshIndex({ ...input, schemaRoot });
}

export function buildImpactAndPack(input: {
  repoRoot: string;
  projectId: string;
  paths: UadsPaths;
  radius: ContextRadius;
  requestedPaths?: string[];
  workOrder?: WorkOrder | null;
  executionRunId?: string | null;
  expansionHistory?: Array<{ from: string; to: string; reason: string; at: string }>;
  approveC5?: boolean;
  schemaRoot?: string;
  persist?: boolean;
}): { bundle: IndexBundle; report: ImpactReport; pack: ContextPack } {
  const schemaRoot = input.schemaRoot ?? findPackageRoot();
  const bundle = currentOrRefreshIndex({
    repoRoot: input.repoRoot,
    projectId: input.projectId,
    paths: input.paths,
    schemaRoot,
  });
  assertIndexMatchesProject(bundle, input.projectId);
  if (bundle.state.complete === false || bundle.state.truncated) {
    throw new IndexIncompleteError(
      bundle.state.truncationReason ?? bundle.state.staleReason ?? "index is incomplete and cannot drive impact or Context Packs",
    );
  }
  const workOrderId = input.workOrder?.workOrderId ?? null;
  const executionRunId = input.executionRunId ?? null;
  const existingPack = readCurrentContextPack(input.paths, schemaRoot);
  if (
    existingPack &&
    existingPack.projectId === input.projectId &&
    existingPack.workOrderId === workOrderId &&
    existingPack.executionRunId === executionRunId &&
    existingPack.contextRadius === input.radius &&
    existingPack.indexDigest === bundle.state.indexDigest &&
    !input.requestedPaths?.length
  ) {
    const existingReport = readImpactReport(input.paths, existingPack.impactReportId, schemaRoot);
    if (existingReport && existingReport.indexDigest === bundle.state.indexDigest) {
      return { bundle, report: existingReport, pack: existingPack };
    }
  }
  const explicit = (input.requestedPaths ?? []).length > 0;
  const report = analyzeImpact({
    bundle,
    projectId: input.projectId,
    workOrderId,
    executionRunId: input.executionRunId ?? null,
    radius: input.radius,
    requestedPaths: input.requestedPaths ?? [],
    affectedAreas: explicit ? [] : input.workOrder?.affectedAreas ?? input.workOrder?.includedScope ?? [],
    approveC5: input.approveC5,
  });
  persistImpactReport(input.paths, report, schemaRoot);
  const pack = buildContextPack({
    bundle,
    report,
    projectId: input.projectId,
    workOrderId,
    executionRunId: input.executionRunId ?? null,
    radius: input.radius,
    objective: input.workOrder?.objective ?? null,
    expansionHistory: input.expansionHistory ?? [],
  });
  if (input.persist !== false) {
    persistContextPack(input.paths, pack, schemaRoot);
  }
  return { bundle, report, pack };
}

export function publishImpactAndPack(input: {
  paths: UadsPaths;
  report: ImpactReport;
  pack: ContextPack;
  schemaRoot?: string;
}): void {
  const schemaRoot = input.schemaRoot ?? findPackageRoot();
  persistImpactReport(input.paths, input.report, schemaRoot);
  persistContextPack(input.paths, input.pack, schemaRoot);
}
