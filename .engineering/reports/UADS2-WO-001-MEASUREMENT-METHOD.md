# UADS2-WO-001 — Measurement Method

## Scope and source boundary

The baseline uses the frozen V1 commit
`312e32946798eb3abbb49a79af08e13efb7719dc` and tree
`b2a6763045fc1dbb81b6ba2880bf1f77167d7133`. V1 was built and exercised from
detached exact-source clones. The canonical V1 checkout remained unchanged.
The V2 worktree contains reports, evidence, and one standalone recomputation
utility only; no V2 runtime behavior was implemented.

## Sample protocol

Each primary risk class has one bounded workload:

1. LOW: orchestrator E5 documentation typo;
2. STANDARD: orchestrator E2 authenticated billing endpoint;
3. ELEVATED: orchestrator E7 financial ledger rounding.

The execution E6 correction-loop fixture is included as a supplemental LOW
sample because it provides reproducible retry/correction evidence. It uses its
own synthetic fixture repository and is not treated as a second source-tree
baseline.

For each sample, collection captured `inspect`, `plan`, and either the bounded
completion path (LOW-E5) or dispatch refusal (STANDARD/ELEVATED). The X6
sample additionally captured the complete execution evaluation sidecar. Raw
JSON was copied without host-specific profile files; files containing absolute
repository roots were intentionally excluded.

## Identity and fingerprints

The input fingerprint is SHA-256 of the exact UTF-8 request string with no
newline. The V1 source fingerprint is SHA-256 of the canonical string
`KayzenRoot/uads@<commit>:tree:<tree>`. Every raw sidecar is referenced by
repository-relative path and SHA-256 in the machine-readable dataset.

## Routing and concurrency

Planned specialists and assurance reviewers are counted from the persisted
selection plan. They are not worker-spawn counts. The execution packet’s
`parallel=false` and `role-cycling` are reported as configured V1 policy, not as
host observation. A worker spawn is counted only when a provider/worker event
or host execution receipt exists. No such event exists in these V1 sidecars,
so the observable UADS-path count is zero and actual host concurrency is
`UNAVAILABLE`.

Likewise, zero sidecar worker conversations means that no conversation record
was persisted. It does not mean that the host UI had zero conversations;
host-visible conversations are `UNAVAILABLE`.

## Timing and TTTM

The data records persisted UTC sidecar timestamps. For completed samples:

- `planToDispatchMs = dispatch.createdAt - workOrder.createdAt`;
- `dispatchToFinalReviewMs = finalReview.createdAt - dispatch.createdAt`;
- `finalReviewToCompletionMs = completion.updatedAt - finalReview.createdAt`;
- `totalObservedMs = completion.updatedAt - workOrder.createdAt`.

The dataset keeps the compatibility field `reviewDurationMs`, whose basis is
the same dispatch-to-final-review interval. These are observed orchestration
intervals across separate foreground commands, not provider-only latency or a
single-process stopwatch. Blocked samples have no review interval.

## Reliability metrics

- `retries = max(attempt - 1, 0)` from the execution run;
- `correctionDepth` is the number of persisted `CORRECTION_NEEDED` review
  verdicts;
- first-pass approval is `APPROVED` with zero correction verdicts;
- first-pass approval rate divides first-pass approvals by samples reaching a
  final review verdict, explicitly excluding pre-review blocked samples;
- escaped defects require post-merge or production evidence and are
  `UNAVAILABLE` here.

## Duplicate-analysis rule

Rule ID: `normalized-structured-analysis-signature-v1`.

Before counting a duplicate, canonicalize one structured analysis event as:
`eventType | gate | normalizedSubjectPath | normalizedFindingCode |
evidenceDigest`. Exact repeated signatures count as duplicates. Semantic
similarity, reviewer assignment, specialist role, or shared input text never
counts as a duplicate. The current V1 sidecar exposes none of these analysis
events, so numerator and denominator are zero and rate is `UNAVAILABLE`.

## Telemetry policy

Provider input/output tokens, quota, billing, selected concrete model, and
reasoning effort are reported only when present in the authoritative sidecar
or host receipt. Byte-heuristic context estimates are labeled as such and are
not substituted for provider tokens. `agentCallsReported: null` remains null;
no hidden host value is inferred.

## Reproduction

From the repository root, with Node.js 24.18.0 and the checked-in raw evidence:

```text
node --check scripts/baseline/recompute-wo001.mjs
node scripts/baseline/recompute-wo001.mjs --write
```

The second command writes
`.engineering/reports/UADS2-WO-001-BASELINE-DATA.json` and also emits the same
JSON to stdout. The output contains no absolute host paths or secrets.
