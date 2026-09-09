# UADS V2 — Source Hierarchy

Status: CANONICAL OVERLAY IN REVIEW

## Authority

When sources disagree, resolve truth in this order:

1. current V2 checkpoint;
2. V2 Decisions Ledger / accepted ADRs;
3. approved V2 Scope;
4. approved V2 Definition of Done;
5. approved V2 Architecture;
6. approved V2 Requirements;
7. inherited UADS V1 canonical documentation;
8. active Work Order / Context Lock / evidence for the current bounded increment;
9. planning and research material.

No chat memory, prompt prose or model assumption overrides repository evidence.

## Inherited baseline

Source repository: `KayzenRoot/uads`  
Source SHA: `312e32946798eb3abbb49a79af08e13efb7719dc`  
Source tree: `b2a6763045fc1dbb81b6ba2880bf1f77167d7133`

The bootstrap reconciliation proved 489/489 tracked source files present in UADS V2 with identical Git blob SHA. The V1 repository remains unchanged.

## V2 overlay rule

V2 documents add or explicitly supersede requirements. They do not silently rewrite V1 history. A changed architectural rule requires an accepted ADR and the affected canonical documents must be updated together.

## External canonical dependency

Hive V2 integration decisions must be reconciled against the current `KayzenRoot/hive-v2` repository, not conversational memory. At bootstrap the inspected Hive V2 main was `ead0c8d92c9e84739e5c24913329e329f36ec251`.

Hive V2 remains independently governed. UADS V2 may implement compatibility contracts but cannot promote Hive truth.
