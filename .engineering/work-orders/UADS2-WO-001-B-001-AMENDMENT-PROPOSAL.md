# Proposed Work Order Amendment — UADS2-WO-001 / B-001

Status: `OWNER-APPROVED / HEDS-CONDITIONAL / FINAL-HEDS-PENDING`

The owner explicitly approved this amendment after HEDS conditional review:
`Aprovo a emenda B-001 do UADS2-WO-001.` The canonical Work Order,
checkpoint, and continuity metadata now record the amendment. It does not
approve the baseline, promote the checkpoint, or authorize M01/S00/runtime
work.

## Original proof obligation

The active Work Order requires Duplicate Analysis Rate to be measured with a
documented deterministic rule and raw evidence. The approved rule is
`normalized-structured-analysis-signature-v1`: canonicalize structured
analysis events as `eventType | gate | normalizedSubjectPath |
normalizedFindingCode | evidenceDigest`, count only exact repeated signatures,
and never infer duplicates from roles, assignments, or semantic similarity.

## Blocker evidence

The exhaustive supported-path inspection is recorded in:

- `.engineering/evidence/UADS2-WO-001/blocker-resolution/authoritative-analysis-event-inspection.json`;
- `.engineering/evidence/UADS2-WO-001/blocker-resolution/authoritative-analysis-event-inspection.txt`.

The frozen V1 tracked source, all three supported adapters, the V1 sidecar
stores, review/assurance records, local supported host homes, and sampled UADS
runs were inspected. No authoritative structured analysis-event stream or
event artifact exists. V1 adapters explicitly prepare/detect/handoff/record
host state and do not invoke providers. The current rate therefore remains
`UNAVAILABLE` with denominator zero.

## Why the original proof is impossible on frozen V1

The frozen V1 contract persists routing assignments, execution state, evidence
records, review findings/verdicts, model/cost snapshots, and host receipts. It
does not persist a structured analysis event containing the fields needed by
the approved rule. A review verdict is not an analysis event, and planned
specialist assignments are not evidence that an analysis occurred. Adding a
V1 event emitter would modify the frozen source and manufacture a non-historical
baseline, which is explicitly forbidden by the active prompt.

## Proposed contract change

If and only if the owner and auditor explicitly approve this amendment:

1. retain the approved duplicate rule unchanged;
2. accept `analysisEventSource=ABSENT_ON_FROZEN_V1` and
   `Duplicate Analysis Rate=UNAVAILABLE` as the V1 baseline limitation;
3. add a mandatory V2 comparison obligation: the V2 executor must emit a
   privacy-safe, identity-bound structured analysis-event stream sufficient to
   produce a non-zero-denominator duplicate rate on the same bounded workloads;
4. require the V2 benchmark gate to fail closed until that stream produces
   deterministic numerator, denominator, rate, and raw-event hashes;
5. keep B-001 open until the explicit amendment decision is recorded by the
   owner/auditor, then close or reject it according to that decision.

## Information lost

This substitute cannot quantify V1 semantic duplicate analyses, cannot identify
which review analyses were repeated, and cannot compare V1 and V2 duplicate
rates numerically. It preserves only the fact that the frozen V1 measurement
surface has no event source, plus the structural routing/review evidence
already captured.

## Why the substitute still supports the V2 comparison goal

It prevents an invented V1 denominator, documents the exact observability gap,
and turns the gap into a testable V2 obligation. V2 can then be compared on
the same workloads using the unchanged canonical rule, while the report keeps
the V1 side explicitly non-comparable for this metric.

## Recorded decision

Owner decision: `APPROVE_AMENDMENT`.

HEDS decision: `CONDITIONAL_APPROVAL_OF_AMENDMENT`.

The remaining required gate is final HEDS approval on the amended exact head,
after all mandatory exact-head CI checks are green. The owner/auditor may
still reject or supersede this amendment if new evidence shows a supported
frozen-V1 event path.

Before the explicit owner decision, the available choices were:

- approve this amendment and its V2 replacement obligation;
- reject it and provide a supported frozen-V1 host path that emits the required
  authoritative events; or
- leave B-001 blocked.

No checkpoint promotion, merge, M01/S00, dashboard runtime, or V2 executor
implementation is authorized by this amendment before final HEDS approval.
