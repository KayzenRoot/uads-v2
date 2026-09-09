# UADS V2 — Requirements

Status: CANONICAL OVERLAY IN REVIEW

## R-UADS2-001 Sequential specialist execution
The default runtime MUST permit at most one active specialist worker in addition to the coordinator.

## R-UADS2-002 No uncontrolled review fan-out
Review MUST NOT spawn parallel specialist swarms by default. Parallelism requires a future explicit policy and proof; it is not part of the current V2 baseline.

## R-UADS2-003 Single visible primary session
Workers MUST execute headless/background/in-process when the host proves that capability. The user-facing flow SHOULD remain in one primary conversation. Unsupported hosts MUST fail safely or use an explicit bounded fallback.

## R-UADS2-004 Spawn gate
Before spawning a worker, UADS MUST determine whether the coordinator can safely complete the task within policy and budget. A worker is created only when justified.

## R-UADS2-005 Automatic model routing
UADS MUST select from runtime-proven model profiles using task type, risk, complexity, context needs, tool requirements, cost/quota and historical evidence.

## R-UADS2-006 Automatic reasoning effort
When the host exposes a controllable reasoning/effort surface, UADS MUST select the lowest level that preserves required assurance and escalate only with evidence. Simple deterministic work MUST NOT default to EXTRA_HIGH.

## R-UADS2-007 Host capability negotiation
Cursor, Codex and other adapters MUST distinguish proven, unknown and unsupported capabilities. Unknown MUST NOT be treated as true.

## R-UADS2-008 Cursor target profiles
The Cursor adapter SHOULD support GPT Luna when actually available plus Composer 2.5 and Grok 4.6 through capability-aware registry entries. Availability and exact host controls are runtime facts, not hard-coded assumptions.

## R-UADS2-009 Codex/OpenAI target profile
The Codex/OpenAI adapter SHOULD prefer GPT Luna for normal work when actually available and policy-compatible. Effort selection MUST remain automatic when host controls permit it.

## R-UADS2-010 Evidence-validity cache
UADS MUST bind reusable evidence to immutable validity inputs. Reuse MUST fail closed on relevant drift. Aggressive proof reuse remains experimental until benchmarked and approved.

## R-UADS2-011 Retry discipline
A retry MUST introduce a new hypothesis, new evidence or justified escalation. Identical blind retries MUST be prevented.

## R-UADS2-012 Fault resolution
Bug workflows MUST capture symptom, classification, localization, known-failure lookup, bounded hypotheses, targeted test, correction and verification.

## R-UADS2-013 Token/quota governance
UADS MUST expose budgets and telemetry for context, workers, retries, model/effort escalation and review.

## R-UADS2-014 Hive compatibility
UADS MUST exchange bounded task identity and quality evidence with Hive V2 without becoming the authority for Hive Scope, DoD, Architecture, ADRs, macro planning or canonical checkpoint promotion.

## R-UADS2-015 Evidence-first delivery
Every implementation/correction increment MUST use Work Order identity, Context Lock, selected verification, Evidence Bundle, explicit verdict and Checkpoint Delta.

## R-UADS2-016 Learning safety
Experience/Policy learning MUST NOT train model weights or silently alter canonical project governance. Learned policies require evidence, versioning, confidence, audit trail and rollback.

## R-UADS2-017 Backward safety
The UADS V1 repository MUST remain untouched by UADS V2 bootstrap and development unless a separate explicit Work Order authorizes a V1 change.
