import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const evidenceRoot = path.join(root, ".engineering", "evidence", "UADS2-WO-001");
const sourceRef = "312e32946798eb3abbb49a79af08e13efb7719dc";
const sourceTree = "b2a6763045fc1dbb81b6ba2880bf1f77167d7133";
const sourceFingerprint = sha256(`KayzenRoot/uads@${sourceRef}:tree:${sourceTree}`);

const definitions = [
  {
    sampleId: "UADS2-WO-001-LOW-E5",
    directory: "LOW-E5",
    riskClass: "LOW",
    fixture: "evals/orchestrator/e5-docs-typo.json",
    input: "Fix a typo in the README.",
    inputFingerprint: "8ab815007fb307eb72ad73513b6882f38076ad7edaa7cf1ec55bf1867bd6825a",
    collection: "direct CLI plan/dispatch/verify/evidence/assurance/finalize run",
  },
  {
    sampleId: "UADS2-WO-001-STANDARD-E2",
    directory: "STANDARD-E2",
    riskClass: "STANDARD",
    internalRisk: "HIGH",
    fixture: "evals/orchestrator/e2-auth-billing.json",
    input: "Add an authenticated API endpoint that exposes a user billing profile.",
    inputFingerprint: "a354b5dbf8442cde23d2c0ee88e01b09b508bd082395e1a7ce58f13ce2b1d209",
    collection: "direct CLI plan followed by dispatch refusal capture",
  },
  {
    sampleId: "UADS2-WO-001-ELEVATED-E7",
    directory: "ELEVATED-E7",
    riskClass: "ELEVATED",
    internalRisk: "HIGH",
    fixture: "evals/orchestrator/e7-financial-ledger.json",
    input: "Change fee accrual and rounding for a financial ledger.",
    inputFingerprint: "3412c9bfbbef4c822616b9630e94483458c2f8ebb579de73994323b870a5db86",
    collection: "direct CLI plan followed by dispatch refusal capture",
  },
  {
    sampleId: "UADS2-WO-001-LOW-X6-CORRECTION",
    directory: "LOW-X6-CORRECTION",
    riskClass: "LOW",
    fixture: "evals/execution/x6-correction-loop.json",
    input: "Change the primary button color.",
    inputFingerprint: "6570adc0ec6d55710b4782ea36f988a35cf60bc8c02a28aee983724d3ae788c9",
    collection: "V1 execution eval X6 correction-loop fixture and persisted sidecar snapshot",
  },
];

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(evidenceRoot, relative), "utf8"));
}

function optionalJson(relative) {
  const target = path.join(evidenceRoot, relative);
  return fs.existsSync(target) ? readJson(relative) : null;
}

function listJson(relative) {
  const directory = path.join(evidenceRoot, relative);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")));
}

function checkpoint(definition) {
  return optionalJson(`samples/${definition.directory}/dispatch/checkpoint.json`)
    ?? readJson(`samples/${definition.directory}/state/checkpoint.json`);
}

function executionRun(definition) {
  return optionalJson(`samples/${definition.directory}/dispatch/execution-run.json`);
}

function modelPlan(definition) {
  return readJson(`samples/${definition.directory}/plan/model-plan.json`);
}

function costLedger(definition) {
  return readJson(`samples/${definition.directory}/cost/ledger.json`);
}

function selectionPlan(definition) {
  return readJson(`samples/${definition.directory}/plan/specialist-selection-plan.json`);
}

function workOrder(definition) {
  return readJson(`samples/${definition.directory}/plan/work-order.json`);
}

function latestReview(reviews) {
  return reviews
    .filter((review) => review.verdict === "APPROVED" || review.verdict === "CORRECTION_NEEDED")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .at(-1) ?? null;
}

function metric(value, status, reason = null) {
  return { value, status, ...(reason ? { reason } : {}) };
}

function buildSample(definition) {
  if (sha256(definition.input) !== definition.inputFingerprint) {
    throw new Error(`${definition.sampleId}: input fingerprint mismatch`);
  }
  const wo = workOrder(definition);
  const cp = checkpoint(definition);
  const run = executionRun(definition);
  const model = modelPlan(definition);
  const cost = costLedger(definition);
  const selection = selectionPlan(definition);
  const reviews = listJson(`samples/${definition.directory}/review`);
  const correctionReviews = reviews.filter((review) => review.verdict === "CORRECTION_NEEDED");
  const finalReview = latestReview(reviews);
  const startAt = wo.createdAt;
  const endAt = run?.updatedAt ?? cp.updatedAt;
  const runStartAt = run?.createdAt ?? null;
  const reviewAt = finalReview?.createdAt ?? null;
  const totalMs = Date.parse(endAt) - Date.parse(startAt);
  const reviewDurationMs = runStartAt && reviewAt ? Date.parse(reviewAt) - Date.parse(runStartAt) : null;
  const plannedParallelGroups = selection.dispatch?.parallelEligibleGroups ?? [];
  const strategy = run?.modelExecutionStrategy ?? model.execution ?? null;
  const completed = cp.status === "completed" || run?.status === "completed";
  const finalVerdict = completed
    ? (finalReview?.verdict === "APPROVED" ? "APPROVED" : "COMPLETED_WITHOUT_REVIEW_VERDICT")
    : cp.status === "blocked" || model.status === "BLOCKED" ? "BLOCKED" : "IN_PROGRESS";
  const firstPassApproved = finalVerdict === "APPROVED" && correctionReviews.length === 0 ? true : finalVerdict === "APPROVED" ? false : null;
  const planToDispatchMs = runStartAt ? Date.parse(runStartAt) - Date.parse(startAt) : null;
  const dispatchToReviewMs = runStartAt && reviewAt ? Date.parse(reviewAt) - Date.parse(runStartAt) : null;
  const reviewToCompletionMs = reviewAt ? Date.parse(endAt) - Date.parse(reviewAt) : null;
  const hostTelemetryUnavailable = "V1 sidecar has no provider/host event stream; agentCallsReported is null and no host UI is observable from this executor.";

  return {
    sampleId: definition.sampleId,
    fixture: definition.fixture,
    collection: definition.collection,
    riskClass: definition.riskClass,
    internalRiskLevel: definition.internalRisk ?? wo.riskLevel,
    input: { kind: "request-text", value: definition.input, fingerprint: definition.inputFingerprint },
    v1Source: {
      repository: "KayzenRoot/uads",
      ref: sourceRef,
      tree: sourceTree,
      fingerprint: sourceFingerprint,
    },
    identity: {
      projectId: wo.projectId,
      workOrderId: wo.workOrderId,
      executionRunId: run?.executionRunId ?? null,
      workOrderDigest: model.workOrderDigest,
      selectionPlanId: selection.selectionPlanId,
      selectionDigest: selection.selectionDigest,
    },
    timestamps: {
      startAt,
      endAt,
      dispatchAt: runStartAt,
      finalReviewAt: reviewAt,
      reviewDurationMs,
      totalObservedMs: totalMs,
    },
    verdict: finalVerdict,
    workflow: {
      checkpointStatus: cp.status,
      checkpointPhase: cp.phase,
      executionStatus: run?.status ?? null,
      attempt: run?.attempt ?? 0,
      retries: Math.max(0, (run?.attempt ?? 1) - 1),
      correctionDepth: correctionReviews.length,
      reviewVerdicts: reviews.map((review) => review.verdict),
    },
    routing: {
      plannedSpecialists: selection.selected.length,
      plannedAssuranceReviewers: selection.assurance.length,
      plannedSpecialistTotal: selection.selected.length + selection.assurance.length,
      plannedParallelEligibleGroups: plannedParallelGroups,
      plannedParallelEligibleSpecialists: plannedParallelGroups.reduce((sum, group) => sum + group.length, 0),
      modelStatus: model.status,
      modelSelectionMode: model.selectionMode,
      requiredCapabilityClass: model.requiredCapabilityClass,
      selectedModel: metric(model.selectedModelId, model.selectedModelId ? "OBSERVED" : "UNAVAILABLE", model.selectedModelId ? null : "host-managed compatibility or no eligible profile"),
      reasoningEffort: metric(null, "UNAVAILABLE", "V1 model plan exposes no provider reasoning-effort selection"),
      executionStrategy: strategy,
    },
    concurrency: {
      configuredMaxConcurrentSpecialistWorkers: metric(strategy?.parallel === false ? 1 : null, strategy?.parallel === false ? "OBSERVED_POLICY" : "UNAVAILABLE", strategy?.parallel === false ? "parallel=false with role-cycling" : "no execution strategy persisted"),
      workerSpawnCountObserved: metric(0, "OBSERVED_NO_PROVIDER_INVOCATION", "No provider/worker spawn event or host execution receipt exists in the V1 sample evidence"),
      maxObservedConcurrentWorkersInUadsPath: metric(0, "OBSERVED_NO_PROVIDER_INVOCATION", "No worker spawn event exists in the bounded V1 CLI path"),
      hostActualMaxConcurrentWorkers: metric(null, "UNAVAILABLE", hostTelemetryUnavailable),
      visibleWorkerConversationsInSidecar: metric(0, "OBSERVED_NO_VISIBLE_WORKER_RECORD", "Only sidecar execution/session identifiers exist; no worker conversation record exists"),
      hostVisibleWorkerConversations: metric(null, "UNAVAILABLE", "Host UI/conversation telemetry is outside the V1 sidecar and was not observable"),
    },
    telemetry: {
      agentCallsReported: metric(cost.agentCallsReported, "UNAVAILABLE", hostTelemetryUnavailable),
      observedProviderTokens: metric(null, "UNAVAILABLE", "No provider token input/output telemetry"),
      quotaAmplification: metric(null, "UNAVAILABLE", "Cannot calculate without source token/quota denominator"),
      estimatedContextTokens: metric(model.budget?.estimatedInputTokens ?? cost.estimatedContextTokens, "OBSERVED_BYTE_HEURISTIC", "This is a byte-heuristic estimate, not provider tokens"),
      contextRadius: wo.contextRadius,
      cacheReuse: {
        gateCacheHits: cost.gateCacheHits,
        evidenceReuseCount: cost.evidenceReuseCount,
        status: "OBSERVED",
      },
    },
    tttm: {
      planToDispatchMs,
      dispatchToFinalReviewMs: dispatchToReviewMs,
      finalReviewToCompletionMs: reviewToCompletionMs,
      blockedAfterPlanMs: runStartAt ? null : totalMs,
      totalObservedMs: totalMs,
      status: runStartAt ? "PARTIAL_COMPONENTS_OBSERVED" : "NOT_REACHED_REVIEW",
    },
    duplicateAnalysis: {
      ruleId: "normalized-structured-analysis-signature-v1",
      numerator: 0,
      denominator: 0,
      rate: null,
      status: "UNAVAILABLE",
      reason: "The V1 sidecar contains routing assignments but no review-analysis event/output signatures; assignments are not treated as semantic review analyses.",
    },
    quality: {
      firstPassApproved,
      defectsCaughtBeforeMerge: correctionReviews.length > 0 ? metric(correctionReviews.length, "OBSERVED_FROM_CORRECTION_VERDICTS") : finalVerdict === "APPROVED" ? metric(0, "OBSERVED_NO_REVIEW_FINDINGS") : metric(null, "UNAVAILABLE", "No independent review reached this sample"),
      escapedDefects: metric(null, "UNAVAILABLE", "No post-merge or production evidence was included in the sampled run"),
    },
    rawEvidence: rawEvidenceFor(definition, reviews),
  };
}

function rawEvidenceFor(definition, reviews) {
  const base = `samples/${definition.directory}`;
  const files = [];
  function walk(relative) {
    const directory = path.join(evidenceRoot, relative);
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) files.push(child.replaceAll("\\", "/"));
    }
  }
  walk(base);
  return files.map((relative) => ({ path: relative, sha256: sha256(fs.readFileSync(path.join(root, ".engineering", "evidence", "UADS2-WO-001", relative), "utf8")) }));
}

function blockerResolutionEvidence() {
  const relativeFiles = [
    "blocker-resolution/authoritative-analysis-event-inspection.json",
    "blocker-resolution/authoritative-analysis-event-inspection.txt",
    "blocker-resolution/owner-amendment-decision.json",
  ];
  const inspection = readJson(relativeFiles[0]);
  const ownerDecision = readJson(relativeFiles[2]);
  return {
    ...inspection,
    ownerDecision,
    rawEvidence: relativeFiles.map((relative) => ({
      path: relative,
      sha256: sha256(fs.readFileSync(path.join(evidenceRoot, relative), "utf8")),
    })),
  };
}

const samples = definitions.map(buildSample);
const blockerResolution = blockerResolutionEvidence();
const completedReviewed = samples.filter((sample) => sample.verdict === "APPROVED" && sample.timestamps.finalReviewAt);
const firstPassDenominator = samples.filter((sample) => sample.verdict === "APPROVED" && sample.timestamps.finalReviewAt).length;
const firstPassNumerator = samples.filter((sample) => sample.quality.firstPassApproved === true).length;
const reviewedDurations = completedReviewed.map((sample) => sample.timestamps.reviewDurationMs).filter((value) => Number.isFinite(value));

const output = {
  schema: "uads2.wo-001.baseline-data",
  schemaVersion: "1.0.0",
  workOrderId: "UADS2-WO-001",
  repository: "KayzenRoot/uads-v2",
  baseSha: "3eedf833c00b18755ce2b105f4df8c6c13269055",
  v1Source: { repository: "KayzenRoot/uads", ref: sourceRef, tree: sourceTree, fingerprint: sourceFingerprint },
  analysisEventSource: {
    status: "ABSENT_ON_FROZEN_V1_SUPPORTED_PATHS",
    authoritative: false,
    inspectionEvidence: "blocker-resolution/authoritative-analysis-event-inspection.json",
    reason: "Exhaustive supported-path inspection found no structured analysis-event stream or named event artifact.",
  },
  duplicateAnalysisRule: {
    ruleId: "normalized-structured-analysis-signature-v1",
    procedure: "Compare canonicalized structured review-analysis events by event type, gate, normalized subject path, normalized finding code and evidence digest. Exact repeated signatures count as duplicates; semantic similarity is never used.",
    currentV1Limitation: "No V1 provider/analysis event stream was exposed, so the rate is UNAVAILABLE rather than inferred from specialist assignments.",
  },
  blockerResolution,
  samples,
  derivedMetrics: {
    workerSpawnCountPerSample: samples.map((sample) => ({ sampleId: sample.sampleId, value: sample.concurrency.workerSpawnCountObserved.value, status: sample.concurrency.workerSpawnCountObserved.status })),
    maxObservedConcurrentWorkersPerSample: samples.map((sample) => ({ sampleId: sample.sampleId, value: sample.concurrency.maxObservedConcurrentWorkersInUadsPath.value, hostValue: sample.concurrency.hostActualMaxConcurrentWorkers.value, status: sample.concurrency.hostActualMaxConcurrentWorkers.status })),
    visibleWorkerConversationsPerSample: samples.map((sample) => ({ sampleId: sample.sampleId, sidecarValue: sample.concurrency.visibleWorkerConversationsInSidecar.value, hostValue: sample.concurrency.hostVisibleWorkerConversations.value, status: sample.concurrency.hostVisibleWorkerConversations.status })),
    reviewDurationMsPerSample: samples.map((sample) => ({ sampleId: sample.sampleId, value: sample.timestamps.reviewDurationMs, status: sample.timestamps.reviewDurationMs === null ? "UNAVAILABLE" : "OBSERVED" })),
    retryCountPerSample: samples.map((sample) => ({ sampleId: sample.sampleId, value: sample.workflow.retries })),
    correctionDepthPerSample: samples.map((sample) => ({ sampleId: sample.sampleId, value: sample.workflow.correctionDepth })),
    duplicateAnalysisRate: { numerator: 0, denominator: 0, value: null, status: "UNAVAILABLE", reason: "No V1 analysis event stream" },
    firstPassApprovalRate: {
      numerator: firstPassNumerator,
      denominator: firstPassDenominator,
      value: firstPassDenominator === 0 ? null : firstPassNumerator / firstPassDenominator,
      formula: "first-pass APPROVED reviewed samples / samples reaching a final review verdict",
      excluded: samples.filter((sample) => sample.verdict === "BLOCKED").map((sample) => sample.sampleId),
    },
    tokenQuotaAmplification: { numerator: null, denominator: null, value: null, status: "UNAVAILABLE", reason: "agentCallsReported and provider token counts are null" },
    averageObservedReviewDurationMs: reviewedDurations.length ? reviewedDurations.reduce((sum, value) => sum + value, 0) / reviewedDurations.length : null,
    totalSamples: samples.length,
    completedReviewedSamples: completedReviewed.length,
  },
  limitations: [
    "V1 plans and sidecar evidence are deterministic, but provider invocation is host-owned and no host event stream was available.",
    "STANDARD and ELEVATED are risk-class labels for this baseline; V1 internally classified both as HIGH and fail-closed at NO_ELIGIBLE_MODEL.",
    "The LOW-E5 final verdict is from a bounded synthetic independent-reviewer record in the V1 fixture flow, not HEDS approval.",
    "uads review packaging was attempted after LOW-E5 finalization and failed closed because the default inspector required validation artifacts not present in this baseline; it does not alter the execution verdict.",
    "No post-merge or production evidence was available for escaped-defect measurement.",
  ],
};

const serialized = `${JSON.stringify(output, null, 2)}\n`;
if (process.argv.includes("--write")) {
  const reportsDirectory = path.join(root, ".engineering", "reports");
  fs.mkdirSync(reportsDirectory, { recursive: true });
  fs.writeFileSync(path.join(reportsDirectory, "UADS2-WO-001-BASELINE-DATA.json"), serialized, "utf8");
}
process.stdout.write(serialized);
