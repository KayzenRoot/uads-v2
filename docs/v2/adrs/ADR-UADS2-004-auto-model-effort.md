# ADR-UADS2-004 — Automatic Model and Effort Routing

Status: ACCEPTED  
Date: 2026-09-09

## Decision
UADS V2 automatically selects a policy-compatible model/profile and reasoning effort from runtime-proven options using risk, complexity, context, tools, cost/quota, proof obligations and evidence.

Target integrations include GPT Luna when available, Cursor Composer 2.5 and Grok 4.6. Exact availability and controllable effort levels are runtime capabilities and MUST NOT be fabricated.

## Guardrail
Use the least expensive/slow reasoning level that still satisfies required assurance. Escalation must be recorded and justified.
