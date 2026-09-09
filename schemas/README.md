# schemas

JSON Schema documents for Architecture Freeze v0.2 data types, Prompt 003 execution schemas at 0.3.0 (`execution-run`, `execution-packet`, `evidence-record`, `review-record`, `review-packet`), Prompt 004 intelligence schemas at 0.4.0 (`index-state`, `dependency-graph`, `test-map`, `interface-map`, `impact-report`, `context-pack`), Prompt 005 failure schemas at 0.5.0 (`failure-record`, `diagnosis-report`, `failure-memory`), Prompt 006 cache/cost schemas at 0.6.0 (`evidence-cache-record`, `cache-decision`, `cost-ledger`, `qpt-snapshot`), Prompt 008 model-routing schemas at 0.8.0 (`model-profile`, `model-profile-registry`, `runtime-capability-snapshot`, `model-execution-plan`), and Prompt 009 specialist-routing schemas at 0.9.0 (`specialist-profile`, `specialist-registry`, `specialist-registry-state`, `specialist-selection-plan`). Prompt 011 adds bounded compatibility evidence at 0.1.0 and corrected release security proofs at the 0.9.0 Direct Review/review-index contract. Prompt 011 Correction 01 adds deterministic required, covered, and unmet obligation records to the selection plan and minimum semantic binding identities to Work Orders/Routing Decisions. Evidence records may optionally carry `source=cache-reuse` provenance. Context Packs may optionally carry layer digests. Model and specialist schemas are provider-neutral and contain no credential, command, hook, or provider invocation contract. Index state records completeness (`complete`, `truncated`, `truncationReason`); unresolved graph entries bind `sourceDigest`. Diagnosis ranking is heuristic and is not a verified root-cause claim. QPT is a documented byte-heuristic ratio, not financial cost.

Prompt 010 / v0.10.0 adds `host-adapter-state.schema.json` and
`host-dispatch-bundle.schema.json`. They carry only fixed adapter IDs,
relative ownership resources, conservative capability provenance, bounded role
assignments, and identity digests; raw host paths, credentials, full prompts,
and arbitrary commands are not part of the contracts.

Prompt 012 adds `host-execution-receipt.schema.json` v0.1.0. It is a closed,
provider-neutral receipt for one current Host Dispatch Bundle handoff. It binds
the bundle, project, Work Order, routing, specialist, model/runtime, execution
run, target-root, change, adapter, and receipt identities. Its only states are
`ACCEPTED`, `STARTED`, `COMPLETED`, `FAILED`, and `BLOCKED`; reason codes are
schema-enumerated. The receipt contains no provider call, credential, command,
prompt, output, or absolute host path, and it is not gate evidence or approval.
The current receipt is stored in the global sidecar with a fixed 32-entry
history retention bound.

Correction 01 additionally requires current-authority revalidation before a
mutating transition. Correction 02 distinguishes the non-empty Work Order
`requiresApproval` policy catalog from the schema-closed,
planner-derived `autonomyBoundary.activeApprovalGatedActions` projection of
the current requested work. Correction 03 defines that canonical signal set as
objective, included scope, requested artifacts, constraints, acceptance
criteria, and domain/risk/destructive signals. The active projection is bound
into the Work Order routing digest and Host Dispatch Bundle identity; only a
non-empty active list fails closed with `APPROVAL_AUTHORIZATION_MISSING` when
no exact durable authorization proof exists. Newly planned Work Orders persist
`constraints`; legacy sidecars missing it fail closed for explicit migration
instead of being treated as safe. The schemas remain closed, old sidecars
remain readable conservatively, and receipt state is never an approval
authority.
Sensitive but unclassifiable current work also sets the schema-closed
`activeApprovalIntentAmbiguous` identity field and is blocked only for that
task.

UADS by NexLabs. See `docs/` for Architecture Freeze v0.2.

The `ci-gate-receipt.schema.json` contract is the Stage A exact-SHA CI receipt. The `github-direct-review-evidence.schema.json` contract is the Stage B strict, versioned canonical evidence; it binds source CI run/attempt provenance, the Direct Review workflow, bounded test/evaluation/audit summaries, security and Linux/Windows compatibility status, release identity, artifact provenance, and explicit PASS/FAIL/INCOMPLETE verdicts. Corrected-release security proofs also persist the observed GitHub event/ref fields and, for Dependency Review same-tree mode, the exact merged-PR base/source identity. Unavailable counts remain `null` with an uppercase `COUNT_PARSE_UNAVAILABLE:*` reason code. `github-review-index.schema.json` is the small release table of contents containing only independently verifiable canonical pointers and identities; it is not evidence by itself.

M30 adds `operational-event.schema.json` v1.0.0. It is a closed, privacy-safe
event transport contract for the global sidecar. Records are one-per-file,
immutable, hash-bound and bounded; `review.analysis` requires the four B-001
bridge fields while leaving semantic HEDS analysis to M08.
