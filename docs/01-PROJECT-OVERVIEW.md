# 01 — Project overview

UADS (**Universal Autonomous Development Studio**) is an open-source product of **NexLabs**.

UADS orchestrates autonomous software engineering for Web2, Web3, SaaS, AI, finance, quant, math-heavy systems, and games. It emphasizes architecture discipline, quality gates, security verification, performance verification, evidence-based delivery, global installation, zero project footprint where possible, context/token cost optimization, and review bundle generation for external audit.

## What this repository is

Prompt 001 delivers the **foundation**: governance, normative architecture, a portable CLI, global install skeleton, Skill entrypoint, schemas, tests, CI, and a review ZIP generator.

It does **not** yet run a full multi-agent orchestrator.

## Design thesis

Agents fail when they dump unbounded context into a project, scatter hidden state into git, skip verification, and cannot prove what they did. UADS inverts that: state lives globally, context is routed and budgeted, gates are mandatory, and delivery is evidence-backed.
