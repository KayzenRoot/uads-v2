# UADS V2 Technology Acquisition Radar — Wave 3

Status: CANDIDATE — security deep-dive only
Scope: UADS V2 only. Hive V2 retains authority over deep RAG/context/memory. UGAS V2 retains authority over media/generation/marketing-production.

## 1. Agent & workload identity

### Market signal
SPIFFE/SPIRE demonstrates a mature pattern: workloads obtain short-lived verifiable identities after node/workload attestation rather than relying on long-lived embedded secrets. Workload identity is derived from observable runtime selectors and can be bound to process/container/platform properties.

### UADS decision
**ADAPT** the model into a UADS-native Agent Workload Identity Fabric (AWIF) before considering SPIRE as a mandatory dependency.

### Required invariants
1. Agent identity is not trusted merely because a prompt/config says a name.
2. Every privileged execution resolves a stable agent/workload identity bound to runtime evidence.
3. Identity proof carries issuer/trust-domain, subject, runtime selectors, capability set, issuedAt/expiresAt and evidence refs.
4. Short-lived credentials are preferred over reusable long-lived secrets.
5. Identity changes or attestation drift invalidate stale authorization/capability proofs.
6. Delegated identity is high-risk and explicitly scoped; broad impersonation is never default.
7. Identity issuance/renewal is observable in M30 without exposing secret material.

Candidate inventions:
- Agent Workload Identity Fabric (AWIF)
- Attested Agent Identity Record (AAIR)
- Identity Lease & Rotation Contract (ILRC)
- Delegation Impersonation Fence (DIF)

## 2. MCP zero-trust gateway

### Market signal
MCP 2026-07-28 hardened authorization, issuer binding, client registration direction, routing and tool-schema semantics. Stateless protocol design increases the importance of explicit identity, routing, authorization and catalog integrity at every request.

### UADS decision
**PROMOTE AS DESIGN TARGET**: MCP Policy Gateway (MPG) + Tool Capability Firewall (TCF) + Runtime Compatibility Envelope (RCE) + Tool Catalog Integrity Record (TCIR).

Required controls:
- validate authorization issuer binding before token use;
- bind credentials to expected issuer/server identity;
- validate tool schemas and extension capabilities against approved versions;
- pin/verify tool catalog identity where trust requires it;
- re-authorize on catalog/capability drift;
- apply per-tool least privilege, risk class, effect class, timeout, retry and budget policy;
- forbid silent fallback to another MCP server/tool;
- quarantine servers with schema/capability drift until re-proven;
- log identity/routing/policy decisions without secret/token leakage.

Candidate inventions:
- MCP Trust Envelope (MTE)
- Tool Catalog Integrity Record (TCIR)
- Server Capability Lease (SCL)
- Tool Origin Attestation (TOA)
- MCP Quarantine State Machine (MQSM)

## 3. Prompt/tool poisoning and confused-deputy defense

### UADS decision
Treat external content, tool descriptions, MCP resources and tool output as **untrusted data**, never as authority.

Required invariants:
1. Tool/resource content cannot directly elevate permissions.
2. Retrieved instructions cannot override system/work-order/policy hierarchy.
3. Privileged action must pass policy and capability checks independent of model text.
4. Data-origin metadata must survive context assembly and tool execution.
5. Cross-domain instructions are tagged and cannot silently change execution policy.
6. Suspicious tool/schema/resource drift triggers quarantine/re-review.

Candidate inventions:
- Instruction Authority Lattice (IAL)
- Untrusted Instruction Taint (UIT)
- Confused Deputy Prevention Gate (CDPG)
- Data-to-Authority Barrier (DAB)
- Tool Poisoning Sentinel (TPS)

## 4. Secrets engineering

### UADS decision
Move toward **secretless-first** execution where feasible and strictly bounded secret access otherwise.

Required properties:
- no raw secrets in prompts, logs, AFR, telemetry or graph edges;
- tools receive only minimum secret material required for the action;
- credentials scoped by subject/action/resource/time;
- short TTL and rotation where provider permits;
- secret handle/reference preferred over secret value;
- downstream model never receives secret simply because a tool can access it;
- revocation/expiry reflected as authoritative state;
- dump/debug/export paths redact by default.

Candidate inventions:
- Secret Capability Handle (SCH)
- Ephemeral Credential Lease (ECL)
- Secret Exposure Budget (SEB)
- Credential Blast Radius Map (CBRM)

## 5. Zero-trust agent-to-agent delegation

### UADS decision
Agent ancestry does not imply inherited privilege.

Child delegation contract must declare:
- parent identity and proof;
- child identity/profile;
- delegated capabilities;
- budget reservation;
- allowed tools/resources;
- max depth/fanout/lifetime;
- forbidden capabilities;
- evidence/return contract.

Children can receive a subset of the parent's authority, never implicit superset authority. Delegated capability expires with the child execution scope.

Candidate inventions:
- Delegation Capability Token (DCT)
- Ancestry Trust Graph (ATG)
- Privilege Non-Amplification Gate (PNAG)
- Delegation Revocation Cascade (DRC)

## 6. Sandbox escape and host-boundary defense

### UADS decision
Combine process controls, tool firewall, filesystem/network policy and risk-selected stronger sandbox profiles.

Defense layers:
1. schema-closed tool contract;
2. allowlisted executable/tool identity;
3. bounded environment/filesystem/network surface;
4. no-shell where possible;
5. least-privilege credentials;
6. OS/container sandbox where supported;
7. HIGH_ASSURANCE profile after M03 capability proof and benchmark;
8. post-execution evidence plus anomaly detection.

Sandbox downgrade MUST be explicit and policy-evaluated. Unsupported HIGH_ASSURANCE never silently falls back to STANDARD.

Candidate inventions:
- Sandbox Assurance Selector (SAS)
- Host Escape Detection Receipt (HEDR)
- Sandbox Downgrade Gate (SDG)
- Runtime Boundary Attestation (RBA)

## 7. Tool and agent supply-chain security

### Market signal
SLSA provenance provides verifiable information about where, when and how artifacts were produced. UADS should extend this notion beyond release binaries to executable agent/tool packages and MCP integrations.

### UADS decision
**ADAPT SLSA-like provenance semantics** to agent/tool assets.

Target lineage:
`source -> review -> build/package -> dependency graph -> artifact digest -> provenance -> registry/install -> runtime identity -> execution evidence`

Required checks:
- tool/plugin/skill/MCP adapter digest and origin;
- immutable/pinned critical dependencies where policy requires;
- SBOM or dependency inventory where supported;
- known provenance chain for production-capable tool packages;
- runtime digest matches approved artifact;
- drift produces BLOCKED/QUARANTINED, never silent trust.

Candidate inventions:
- Agent & Tool Provenance Graph (ATPG)
- Trusted Tool Receipt (TTR)
- Runtime Provenance Match Gate (RPMG)
- Supply-Chain Quarantine Ledger (SCQL)

## 8. Security control-plane integration

M29 remains security/supply-chain owner. M30 renders security state but does not become authority. M03 supplies host/capability proof. M07 economic limits remain active during security incidents. M08/AEG/HEDS consume security evidence. M31 blocks release when required security provenance/gates fail.

The Living Cockpit should expose:
- active agent/workload identity and freshness;
- capability grants and expirations;
- tool/MCP trust/quarantine state;
- secret access counts and exposure budget, never secret values;
- sandbox profile/downgrade state;
- delegation graph and privilege boundaries;
- supply-chain/provenance status;
- security incidents/findings and remediation evidence.

## 9. New cross-cutting proprietary candidates

1. AWIF — Agent Workload Identity Fabric
2. AAIR — Attested Agent Identity Record
3. MTE — MCP Trust Envelope
4. IAL — Instruction Authority Lattice
5. UIT — Untrusted Instruction Taint
6. DAB — Data-to-Authority Barrier
7. SCH — Secret Capability Handle
8. SEB — Secret Exposure Budget
9. DCT — Delegation Capability Token
10. PNAG — Privilege Non-Amplification Gate
11. RBA — Runtime Boundary Attestation
12. ATPG — Agent & Tool Provenance Graph
13. RPMG — Runtime Provenance Match Gate
14. SCQL — Supply-Chain Quarantine Ledger

## 10. Decision
Wave 3 should proceed as UADS-native security architecture/proof targets. SPIRE, external policy engines, external secret managers, and heavyweight sandbox stacks remain optional integrations unless later benchmarks/proofs justify a default dependency.
