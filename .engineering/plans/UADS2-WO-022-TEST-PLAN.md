# UADS2-WO-022 — Graph + Harness Engineering Test Plan

Status: ACTIVE PLAN
Issue: #68
Risk: HIGH

## Contract proof obligations

### GH-001 Stable identity
Identical canonical inputs produce stable graph node/edge identities and harness fingerprints where declared deterministic inputs are unchanged.

### GH-002 Provenance
Every promoted graph relationship is traceable to source/evidence. Inferred edges cannot masquerade as SOURCE truth.

### GH-003 Incomplete graph safety
Missing/stale graph coverage increases uncertainty or yields UNKNOWN; it cannot reduce impact radius, context or verification requirements by assumption.

### GH-004 Bounded traversal
Depth, nodes, files, tokens and wall time remain within declared GCS/GIR limits even with cycles/dense hubs.

### GH-005 Cycle and forbidden-edge detection
Known cycles and prohibited ownership/dependency edges are detected deterministically.

### GH-006 Graph proof gate
Mandatory proof linked to impacted nodes cannot be bypassed while FAIL/BLOCKED/required-UNKNOWN.

### GH-007 Harness contract admission
Every governed execution resolves context, tools, permissions, model/effort policy, ESE, retry owner, stop condition and evidence contract before model/tool action where policy requires it.

### GH-008 Tool Capability Firewall
Available-but-unauthorized tools are not exposed/used. Host capability does not equal authorization.

### GH-009 Behavioral evaluation
A superficially correct final output fails when the trajectory violates a mandatory harness invariant such as Model Lock, retry ownership, permission or economic admission.

### GH-010 Trajectory integrity
HEP preserves ordered, identity-bound execution evidence sufficient to reconstruct the governed trajectory without inventing missing actions.

### GH-011 Pure replay
Normal replay of recorded HEP/event evidence causes zero paid model calls. Fresh model execution is labeled a new governed execution.

### GH-012 Harness drift
Material model/tool/schema/runtime/policy drift invalidates affected regression evidence and cannot silently reuse prior qualification.

### GH-013 Context provenance
CPL identifies material context sources and digests. Stale/changed sources invalidate affected context proof.

### GH-014 Economic safety
Graph-derived context expansion, critic selection or agent work cannot bypass M07 Economic Safety Envelope or M22 escalation reasons.

### GH-015 Retry ownership
Harness/graph components introduce zero independent retry multiplication outside M21.

### GH-016 Decision-to-proof trace
Consequential decisions expose evidence/proof references or explicit missing/unknown trace.

### GH-017 Entropy budget
High-assurance execution cannot exceed configured nondeterministic branch/fallback/tool-choice budget without governed escalation.

### GH-018 Failure localization humility
GAFL may rank likely impact but cannot emit authoritative causal claims without evidence.

### GH-019 Digital Office live truth
Every live avatar/task/transition displayed maps to authoritative execution/event identity and freshness evidence. Phantom actors/progress count = 0.

### GH-020 Digital Office replay truth
Replay is visually labeled, time-bounded and source-linked. Historical events cannot appear as LIVE.

### GH-021 Visual degradation safety
Disabling animation or shedding optional visual detail preserves P0/P1 operational truth and critical controls/status.

### GH-022 Scale behavior
Large graphs/agent populations use bounded projection, aggregation, LOD/coalescing and measurable saturation behavior. No production capacity claim without M27 representative evidence.

### GH-023 Accessibility equivalence
GRAPH/TABLE modes preserve all critical operational information available through the animated Office.

### GH-024 Exact-head release
Final HEDS and repository gates bind the exact head being merged.

## Benchmark matrix
Compare baseline UADS context/review/execution flow against Graph+Harness-enabled profiles on a versioned corpus.

Measure separately:
- task correctness;
- seeded defect recall / false pass;
- escaped defects;
- context tokens and irrelevant-context ratio;
- model calls;
- tool calls;
- retry count;
- wall time and TTTM;
- graph compilation/query latency;
- graph node/edge cardinality;
- GIR false-negative rate on seeded impacts;
- proof-gate precision/recall;
- harness invariant violations;
- monetary cost where price truth exists;
- cockpit projection latency and dropped/coalesced updates;
- CPU/RAM/storage overhead.

No opaque composite score may hide a quality regression behind cost savings.

## Promotion gates
- all HIGH/CRITICAL safety obligations objectively satisfied or feature disabled;
- no unbounded graph/context/model path;
- no fabricated Digital Office state;
- dependency-light local-first profile works without external graph service;
- exact-head CI, CodeQL, Dependency Review, Cross-Platform and HEDS green;
- runtime claims remain deferred to owning-module implementation proofs.