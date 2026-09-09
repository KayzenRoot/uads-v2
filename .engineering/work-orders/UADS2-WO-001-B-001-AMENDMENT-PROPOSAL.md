# Work Order Amendment — UADS2-WO-001 / B-001

Status: `OWNER_APPROVED — FINAL_HEDS_PENDING`

HEDS conditionally recommended this amendment on reviewed head
`50b811bcad1435ce65e682d6fb46fda8e3857897`. The owner subsequently provided
explicit assent in chat on 2026-09-09, recorded verbatim in
`.engineering/evidence/UADS2-WO-001/blocker-resolution/owner-amendment-decision.json`.
This amendment is therefore owner-approved but does not by itself promote the
checkpoint, merge PR #17, or authorize M01/S00/runtime work before final HEDS.

## Original proof obligation

The active Work Order required Duplicate Analysis Rate to be measured with a
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
event artifact exists. V1 adapters prepare/detect/handoff/record host state and
do not invoke providers. The frozen-V1 rate therefore remains `UNAVAILABLE`
with denominator zero.

## Why the original proof is impossible on frozen V1

The frozen V1 contract persists routing assignments, execution state, evidence
records, review findings/verdicts, model/cost snapshots, and host receipts. It
does not persist a structured analysis event containing the fields needed by
the approved rule. A review verdict is not an analysis event, and planned
specialist assignments are not evidence that an analysis occurred. Adding a
V1 event emitter would modify the frozen source and manufacture a non-historical
baseline.

## Approved contract change

1. retain the approved duplicate rule unchanged;
2. accept `analysisEventSource=ABSENT_ON_FROZEN_V1_SUPPORTED_PATHS` and
   `Duplicate Analysis Rate=UNAVAILABLE` as the frozen-V1 baseline limitation;
3. require V2 to emit a privacy-safe, identity-bound structured analysis-event
   stream sufficient to produce a deterministic non-zero-denominator duplicate
   rate on the same bounded workloads;
4. require the relevant V2 comparison gate to fail closed until that stream
   produces deterministic numerator, denominator, rate, and raw-event hashes;
5. preserve the V1 side as explicitly non-comparable numerically for this
   metric rather than inventing a historical denominator.

## Information lost

This substitute cannot quantify V1 semantic duplicate analyses, cannot identify
which review analyses were repeated, and cannot compare V1 and V2 duplicate
rates numerically. It preserves the fact that frozen V1 has no authoritative
analysis-event source, plus the structural routing/review evidence already
captured.

## Why this still supports the V2 comparison goal

It prevents an invented V1 denominator, documents the exact observability gap,
and converts that gap into a testable V2 obligation using the unchanged
canonical duplicate rule.

## Decision record

Owner decision: `APPROVE_AMENDMENT`.

Verbatim owner assent is retained in:
`.engineering/evidence/UADS2-WO-001/blocker-resolution/owner-amendment-decision.json`.

Final HEDS approval and exact-head mandatory checks remain required before
checkpoint promotion or merge. No runtime implementation is authorized by this
amendment alone.
