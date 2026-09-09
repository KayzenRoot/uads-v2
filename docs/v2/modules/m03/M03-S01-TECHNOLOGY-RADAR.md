# M03 S01 — Technology Radar

Status: FROZEN CANDIDATE — WO-005 HEDS PENDING

## Decision method

Every candidate is classified exactly once for the initial M03 implementation direction:
`REUSE`, `ADAPT`, `INVENT`, `EXPERIMENT`, or `OUT_OF_SCOPE`.

| Candidate | Class | Decision |
| --- | --- | --- |
| Existing `RuntimeCapabilitySnapshot` tri-state compatibility surface | REUSE | Preserve as downstream compatibility projection during migration. |
| Existing SHA-256 identity digests and sidecar persistence | REUSE | Keep deterministic privacy-safe identity/storage primitives. |
| Existing host root/adapter detection and replay protections | REUSE | Use as host-presence/input evidence, not feature proof. |
| Existing closed JSON Schema / strict key validation | REUSE | Continue schema-closed proof records. |
| M30 operational event spine | REUSE | M03 emits events; M30 transports/projects them. |
| MCP-style explicit identity/version/capability discovery pattern | ADAPT | Use the pattern of explicit capability discovery, not MCP semantics as host truth. |
| Version/feature enumeration where a host exposes a documented local interface | ADAPT | Declaration is evidence input; it does not automatically become enablement proof. |
| Safe active local feature probes | ADAPT | Fixed probe descriptors, `execFile`, no shell by default, timeout/AbortSignal, sanitized environment. |
| Content-addressed evidence cache + validity basis | ADAPT | Bind proof reuse to subject/probe/policy digests and expiry. |
| Proof-Carrying Capability Record (PCCR) | INVENT | Per-capability state carries exact evidence/freshness/identity instead of snapshot-wide trust. |
| Capability Evidence Ladder (CEL) | INVENT | Formalizes evidence strength and which rung may enable each capability. |
| Negative Proof Contract (NPC) | INVENT | Prevents “not observed” from becoming false/unsupported. |
| Capability Lease & Drift Sentinel (CLDS) | INVENT | Deterministically invalidates proof when subject/probe/policy/freshness basis changes. |
| Signed remote-attestation/TPM-backed snapshots | EXPERIMENT | Potential future stronger attacker model, not necessary for local initial slice. |
| Host-specific active probes for Cursor/Codex mutable features | EXPERIMENT | Must be benchmarked/version-bound before promotion; local availability cannot be assumed. |
| Adaptive/learned confidence scoring | OUT_OF_SCOPE | M03 truth must be deterministic; learning belongs to later modules and cannot make truth. |
| Provider API model/catalog probing | OUT_OF_SCOPE | M04/M15/M16/provider boundary, not M03 core. |
| Hive-derived capability truth | OUT_OF_SCOPE | Hive may consume facts, never substitute for local host proof. |
| Arbitrary shell scripts supplied by config/user | OUT_OF_SCOPE | Violates probe safety and deterministic trust boundary. |

## Why not a static capability table?

Current host capabilities change with host version, feature rollout, configuration, account tier and execution environment. A static table can seed candidates but cannot satisfy `SUPPORTED`.

## Why not version checks alone?

Version is part of the subject identity and may rule features in/out, but:
- feature flags/config can differ;
- vendors can backport or gate behavior;
- CLI/editor/cloud variants differ.

Version evidence is necessary for some probes, never universally sufficient.

## Current-host examples

Current Cursor documentation exposes foreground/background subagents and cloud/background execution concepts. This proves these are meaningful capabilities to test for, **not** that the user's current local Cursor exposes each one through a stable machine-readable interface.

The 2026 MCP capability-discovery pattern reinforces explicit identity + capability discovery and version binding as a useful protocol design reference.

Node's current `execFile` supports timeout and AbortSignal, which is preferable to shell parsing for bounded local probes.

## Rejected trust shortcuts

- directory exists ⇒ feature supported;
- adapter installed ⇒ feature supported;
- host name ⇒ known feature matrix;
- previous snapshot valid forever;
- missing response ⇒ unsupported;
- user-configured `true` ⇒ proven;
- model capability ⇒ host capability;
- host capability ⇒ policy permission.
