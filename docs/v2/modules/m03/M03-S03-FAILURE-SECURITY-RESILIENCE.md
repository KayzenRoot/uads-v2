# M03 S03 — Failure, Security & Resilience Model

Status: FROZEN CANDIDATE — WO-005 HEDS PENDING

## Safety posture

M03 is a truth-producing boundary. False positive capability support is more dangerous than an UNKNOWN result.

Default failure outcome:
**fail closed to UNKNOWN/BLOCKED/STALE, never optimistic TRUE.**

## Threat and failure matrix

| ID | Threat / failure | Required behavior |
| --- | --- | --- |
| F01 | Host directory exists but feature is absent | Presence evidence cannot satisfy capability proof. |
| F02 | Adapter static declaration says feature exists | Remains DECLARED unless minimum CEL rung permits otherwise. |
| F03 | Runtime upgraded/downgraded after proof | Subject drift makes proof STALE before reuse. |
| F04 | Probe parser changed but cached proof remains | Probe-definition digest mismatch makes proof STALE. |
| F05 | Policy/evidence threshold changed | Policy digest mismatch forces re-evaluation. |
| F06 | Sidecar proof edited/tampered | Proof/evidence digest mismatch rejects record. |
| F07 | Proof copied to another host/root | Subject/root identity mismatch rejects replay. |
| F08 | Missing host/executable | Host/capability UNKNOWN or UNAVAILABLE context, never UNSUPPORTED by absence. |
| F09 | Permission denied | BLOCKED or UNKNOWN, never UNSUPPORTED. |
| F10 | Probe timeout/hang | Abort, bounded cleanup, UNKNOWN/BLOCKED with reason. |
| F11 | Probe returns huge output | Truncate/reject at byte limit; no proof from incomplete unsafe parse. |
| F12 | Malicious output injects path/secret/control chars | Normalize/redact/reject before persistence. |
| F13 | PATH shadowing points at foreign executable | Resolved executable identity must be bound; untrusted resolution fails closed. |
| F14 | Symlink/junction root substitution | Reuse current root-binding protections; reject cross-root identity. |
| F15 | Runtime changes between identity read and probe result | Post-probe subject revalidation required before commit. |
| F16 | Concurrent duplicate probes | Single-flight per subject/capability by default; only one proof commit wins. |
| F17 | Process crash during proof write | Atomic sidecar write; partial proof never trusted. |
| F18 | Clock moves backwards | Leased proof fails freshness sanity and becomes STALE/UNKNOWN. |
| F19 | Long sleep/offline period | Lease expiry forces revalidation on next use. |
| F20 | Complete feature enumeration is actually partial | Enumeration cannot yield UNSUPPORTED unless completeness is itself proven/version-bound. |
| F21 | Vendor text/error wording changes | Parser returns UNKNOWN, not guessed result. |
| F22 | Unsupported-result spoof | Only recognized version-bound parser outcome can satisfy NPC. |
| F23 | User/config sets capability=true | Configuration can request/declare, not manufacture PROVEN evidence. |
| F24 | Model supports tool but host does not | Intersection remains false/unknown downstream; M03 owns host side only. |
| F25 | Host supports parallel agents | M03 may prove fact, but ADR-UADS2-002 still prevents UADS fan-out by default. |
| F26 | Active probe would mutate/network/cost money | BLOCKED under initial PBF; explicit future approval/ADR required. |
| F27 | Probe inherits API keys/tokens | Minimal environment allowlist; no general environment inheritance. |
| F28 | Probe command injection | No arbitrary shell/user template; fixed schema-closed descriptors only. |
| F29 | Probe executable spawns uncontrolled descendants | Such probe is not eligible for automatic initial policy; safer isolation required first. |
| F30 | Proof-aware path unavailable after rollout | Conservative rollback projects UNKNOWN through legacy compatibility path. |
| F31 | Old legacy snapshot contains true | Legacy true is not imported as a PCCR proof without revalidation. |
| F32 | M30 unavailable | Capability proof still works; event delivery failure cannot alter truth. |
| F33 | Hive unavailable | SOLO remains complete; Hive absence cannot alter truth. |
| F34 | Local attacker can edit UADS code and recompute hashes | Outside initial integrity guarantee; cryptographic remote attestation remains EXPERIMENT. |

## Probe execution security envelope

Automatic probe requirements:
- descriptor comes from compiled/schema-closed registry;
- executable resolution policy is explicit;
- resolved executable identity is hashed/bound, absolute path is transient only;
- no `shell:true`;
- arguments are fixed or enum-bounded, not arbitrary user strings;
- minimal environment allowlist;
- no credential forwarding;
- `windowsHide` when applicable;
- timeout + AbortSignal;
- stdout/stderr byte ceiling;
- parser is versioned and content-digested;
- post-probe subject identity is rechecked before proof commit;
- automatic per-host probe concurrency = 1 by default.

## Probe side-effect classes

- `READ_ONLY_LOCAL` — eligible for automatic execution.
- `TEMPORARY_LOCAL` — only in isolated temp root with deterministic cleanup and explicit descriptor approval.
- `NETWORK_OBSERVE` — blocked in initial M03 automatic policy.
- `MUTATING` — blocked.
- `COST_BEARING` — blocked.

## Integrity model

PCCR digests provide deterministic integrity and replay/staleness detection. They are not a claim of protection against an attacker who can modify both UADS executable/source and proof store.

Future stronger trust options such as signed attestations/TPM remain experiment-only and require a new threat-model decision.

## Privacy model

Durable M03 evidence MUST NOT contain:
- absolute host paths;
- environment dumps;
- tokens/keys/cookies;
- raw command lines containing user-controlled secrets;
- full stdout/stderr unless explicitly proven privacy-safe and bounded.

Persist:
- privacy-safe bounded version strings when needed;
- digests;
- enum state;
- reason codes;
- bounded sanitized evidence summaries.

## Resilience

- proof writes atomic;
- corrupt/missing record fails closed;
- interrupted probe never creates SUPPORTED;
- M30 outage does not block truth computation;
- stale proof can be re-probed;
- active probe failures do not destroy the last proof record, but expired/invalid prior proof remains non-enabling;
- rollback path retains legacy compatibility with conservative UNKNOWN projection.

## M27-M31 risk classifications

M27: probe storms/resource exhaustion are production risks; single-flight and budgets mandatory.
M28: crash/partial write/timeouts/drift recovery mandatory.
M29: executable spoof, env leakage, command injection and proof tamper are security gates.
M30: missing event telemetry is explicit but never changes proof truth.
M31: schema/projection migration must be additive and reversible.
