# UADS V2 — Integration Contracts

Status: DESIGN CONTRACT IN REVIEW

## HiveTaskEnvelope

Hive → UADS bounded execution request SHOULD carry:

- schema/version;
- project identity;
- version/increment identity;
- Work Order ID and digest;
- scope and out-of-scope;
- risk tier;
- proof obligations;
- architecture/decision constraints;
- canonical source fingerprints;
- context limits;
- token/cost budget;
- required gates;
- stop condition;
- envelope digest.

UADS MUST reject stale, cross-project, malformed or unsupported envelopes.

## UADSQualityBundle

UADS → Hive quality result SHOULD carry:

- schema/version;
- Work Order ID/digest;
- source base/head identity;
- selected host/adapter;
- selected model profile;
- selected reasoning/effort;
- selected context radius/packs;
- specialist route and spawn count;
- maximum observed worker concurrency;
- change impact;
- selected gates and rationale;
- test/proof results;
- Evidence Cache receipts;
- Failure Memory references;
- retries/corrections;
- token/cost/QPT when observable;
- risks/uncertainty;
- local verdict;
- proposed Checkpoint Delta;
- promotion candidates;
- bundle digest.

## Promotion boundary

UADS may emit a candidate lesson or checkpoint delta. Hive decides whether it becomes durable/global canonical truth.

## HEDS compatibility

Where Hive already defines a Review Manifest, Change Impact Manifest, Evidence Bundle or proof-validity contract, UADS SHOULD emit compatible data instead of creating a competing schema. Any schema divergence requires an explicit integration ADR.
