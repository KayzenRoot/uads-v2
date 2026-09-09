import { buildImpactAndPack, refreshIndex } from "../kernel/intelligence.js";
import { resolveProjectContext } from "../kernel/project-context.js";
import { readCurrentCheckpoint, readWorkOrder } from "../kernel/persist.js";
import { findPackageRoot } from "../lib/version.js";
import { safeErrorMessage } from "../lib/safe-persist.js";
import { assertSafeRelativeProjectPath } from "../kernel/safe-path.js";
import type { ContextRadius } from "../kernel/types.js";

export function runIndexCommand(input: { cwd?: string; uadsHome?: string; json?: boolean; force?: boolean } = {}): string {
  try {
    const cwd = input.cwd ?? process.cwd();
    const ctx = resolveProjectContext(cwd, input.uadsHome);
    const bundle = refreshIndex({
      repoRoot: ctx.repoRoot,
      projectId: ctx.projectId,
      paths: ctx.paths,
      schemaRoot: findPackageRoot(),
      forceFull: input.force,
    });
    const payload = {
      projectId: ctx.projectId,
      indexDigest: bundle.state.indexDigest,
      mode: bundle.state.mode,
      filesParsed: bundle.state.filesParsed,
      filesReused: bundle.state.filesReused,
      filesRemoved: bundle.state.filesRemoved,
      filesConsidered: bundle.state.filesConsidered,
      nodeCount: bundle.state.nodeCount,
      edgeCount: bundle.state.edgeCount,
      complete: bundle.state.complete,
      truncated: bundle.state.truncated,
      truncationReason: bundle.state.truncationReason,
      unresolvedCount: bundle.state.unresolvedCount,
      confidence: bundle.state.confidence,
    };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return [
      "UADS index",
      `projectId: ${payload.projectId}`,
      `indexDigest: ${payload.indexDigest}`,
      `mode: ${payload.mode}`,
      `filesParsed: ${payload.filesParsed}`,
      `filesReused: ${payload.filesReused}`,
      `filesRemoved: ${payload.filesRemoved}`,
      `nodes: ${payload.nodeCount}`,
      `edges: ${payload.edgeCount}`,
      `complete: ${payload.complete}`,
      `truncated: ${payload.truncated}`,
      `unresolved: ${payload.unresolvedCount}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runImpactCommand(input: {
  cwd?: string;
  uadsHome?: string;
  json?: boolean;
  paths?: string[];
  radius?: string;
} = {}): string {
  try {
    const cwd = input.cwd ?? process.cwd();
    const ctx = resolveProjectContext(cwd, input.uadsHome);
    const schemaRoot = findPackageRoot();
    const checkpoint = readCurrentCheckpoint(ctx.paths, schemaRoot);
    const workOrder = checkpoint?.workOrderId ? readWorkOrder(ctx.paths, checkpoint.workOrderId, schemaRoot) : null;
    for (const rel of input.paths ?? []) {
      assertSafeRelativeProjectPath(rel);
    }
    const radius = (input.radius as ContextRadius | undefined) ?? workOrder?.contextRadius ?? "C2";
    const result = buildImpactAndPack({
      repoRoot: ctx.repoRoot,
      projectId: ctx.projectId,
      paths: ctx.paths,
      radius,
      requestedPaths: input.paths,
      workOrder,
      schemaRoot,
    });
    const payload = {
      projectId: ctx.projectId,
      impactReportId: result.report.impactReportId,
      contextPackId: result.pack.contextPackId,
      indexDigest: result.bundle.state.indexDigest,
      contextRadius: result.report.contextRadius,
      seeds: result.report.seeds,
      inScope: result.report.inScopeCandidates.map((item) => item.path),
      supporting: result.report.supportingContext.map((item) => item.path),
      possibleImpact: result.report.possibleImpact.map((item) => item.path),
    };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return [
      "UADS impact",
      `impactReportId: ${payload.impactReportId}`,
      `contextRadius: ${payload.contextRadius}`,
      `seeds: ${payload.seeds.join(", ") || "(none)"}`,
      `inScope: ${payload.inScope.join(", ") || "(none)"}`,
      `supporting: ${payload.supporting.join(", ") || "(none)"}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runContextPackCommand(input: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  try {
    const cwd = input.cwd ?? process.cwd();
    const ctx = resolveProjectContext(cwd, input.uadsHome);
    const schemaRoot = findPackageRoot();
    const checkpoint = readCurrentCheckpoint(ctx.paths, schemaRoot);
    if (!checkpoint?.workOrderId) {
      throw new Error("no active Work Order; run uads plan first");
    }
    const workOrder = readWorkOrder(ctx.paths, checkpoint.workOrderId, schemaRoot);
    if (!workOrder) {
      throw new Error("Work Order missing");
    }
    const result = buildImpactAndPack({
      repoRoot: ctx.repoRoot,
      projectId: ctx.projectId,
      paths: ctx.paths,
      radius: workOrder.contextRadius,
      workOrder,
      schemaRoot,
    });
    const payload = {
      contextPackId: result.pack.contextPackId,
      workOrderId: result.pack.workOrderId,
      indexDigest: result.pack.indexDigest,
      contextRadius: result.pack.contextRadius,
      itemCount: result.pack.items.length,
      estimatedTokens: result.pack.estimatedTokens,
      tokenEstimateMethod: result.pack.tokenEstimateMethod,
      focusedTests: result.pack.focusedTests,
    };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return [
      "UADS context pack",
      `contextPackId: ${payload.contextPackId}`,
      `contextRadius: ${payload.contextRadius}`,
      `items: ${payload.itemCount}`,
      `estimatedTokens: ${payload.estimatedTokens} (${payload.tokenEstimateMethod})`,
      `focusedTests: ${payload.focusedTests.join(", ") || "(none)"}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}
