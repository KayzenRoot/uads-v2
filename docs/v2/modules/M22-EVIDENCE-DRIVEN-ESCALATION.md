# M22 — Evidence-Driven Escalation
Status: DISCOVERY | Class: NECESSARY

Mission: escalate context, model, effort, tests or specialist depth only from explicit evidence/uncertainty, not habit.

Standalone: local policy. Hive complement: Hive risk obligations can set floors, not require Hive runtime.

Candidate technology radar, UNAPPROVED: escalation reason graph; uncertainty thresholds; monotonic assurance ladder; de-escalation hysteresis.

## Adaptive Evidence Gauntlet requirement

M22 decides whether AEG remains OFF, enters LIGHT/STANDARD/HIGH_ASSURANCE, adds another critic role, expands context, or raises model/effort. Every escalation requires an auditable reason tied to unresolved risk, uncertainty, failed proof or material critic disagreement.

Rules:
- retry alone is never escalation evidence;
- a critic PASS alone is not evidence to lower a mandatory risk floor;
- critic disagreement may trigger a bounded independent tie-break/review path, not unbounded fan-out;
- new critic roles require uncovered risk surface or insufficient proof coverage;
- model/effort escalation must remain inside M07 economic ceilings and active Model Lock policy;
- de-escalation is allowed when uncertainty/risk falls, with hysteresis to prevent oscillation;
- repeated escalation without measurable proof/risk improvement triggers Review Convergence Guard BLOCKED/HARD_STOP semantics.

M22 must emit reason provenance sufficient for the Gauntlet Evidence Trail and M30 cockpit.

Sessions S00–S07 cover signals, ladder design, architecture, escalation abuse, benchmark matrix, implementation, routing integration, freeze.

Mandatory tests: no unexplained escalation, risk floor, quota ceiling, repeated escalation loop blocked, reason provenance, no critic-count escalation without risk evidence, no model/effort escalation from retry alone, and bounded de-escalation hysteresis.
