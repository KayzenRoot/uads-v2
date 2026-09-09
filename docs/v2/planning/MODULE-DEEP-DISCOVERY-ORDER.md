# UADS V2 — Deep Module Discovery Selection Policy

Status: FROZEN CANDIDATE — UADS2-WO-004 HEDS PENDING

## Rule

There is no fixed numeric implementation order.

At each module boundary:
1. compute modules whose HARD predecessors are frozen;
2. remove modules blocked by unresolved canonical/enterprise gaps;
3. score eligible modules by critical-path unlock count, safety/risk reduction, owner roadmap value, existing partial foundation and expected integration-rework reduction;
4. select exactly one active deep-discovery module;
5. run S00 → S01 → S01.5 → S02 → S03 → S04 → S05 vertical slices → S06 → S07;
6. HEDS freeze;
7. recalculate eligibility.

## Initial selection

After UADS2-WO-004 approval, select **M03 Host Capability Detector**.

M03 is preferred over other W1 roots because it directly unlocks four HARD consumers (M01, M04, M06, M23) and reduces unsafe host/provider assumptions.

## S01 classification

Every technology candidate receives exactly one current state:
- REUSE
- ADAPT
- INVENT
- EXPERIMENT
- OUT_OF_SCOPE

## S01.5 Technology Invention Radar

For every INVENT/EXPERIMENT candidate record:
- target problem;
- baseline evidence;
- measurable expected gain;
- existing alternatives;
- why composition/adaptation is insufficient;
- security/reliability/resource risk;
- fallback/rollback;
- falsifiable benchmark;
- owner decision when promotion would materially change architecture.

## S05 vertical slices

Each slice must:
- cross a real module boundary/end-to-end behavior where applicable;
- preserve stable contracts;
- emit objective M30 observability;
- include smallest sufficient tests plus risk-driven regression;
- classify M27-M31;
- produce Evidence Bundle;
- stop for HEDS when its Work Order says so.

A module is frozen only in S07 after all necessary slices and integration obligations pass.
