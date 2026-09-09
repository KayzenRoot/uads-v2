#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { runNpm } from "../lib/exec.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lockfile = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const versionFile = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();
if (packageJson.version !== versionFile || lockfile.packages?.[""]?.version !== packageJson.version) {
  process.stderr.write("Release version sources disagree.\n");
  process.exit(1);
}

const requiredFiles = [
  "README.md",
  "LICENSE",
  "NOTICE",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  "GOVERNANCE.md",
  "ROADMAP.md",
  "CHANGELOG.md",
  "VERSION",
  ".gitignore",
  ".editorconfig",
  ".github/pull_request_template.md",
  ".github/ISSUE_TEMPLATE/bug.yml",
  ".github/ISSUE_TEMPLATE/feature.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/security_review.md",
  ".github/CODEOWNERS",
  ".github/dependabot.yml",
  ".github/release.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/direct-review.yml",
  ".github/workflows/codeql.yml",
  ".github/workflows/dependency-review.yml",
  ".github/workflows/release.yml",
  ".github/workflows/scorecard.yml",
  "docs/01-PROJECT-OVERVIEW.md",
  "docs/02-REQUIREMENTS.md",
  "docs/03-SCOPE.md",
  "docs/04-ARCHITECTURE.md",
  "docs/05-STATE-AND-CHECKPOINT.md",
  "docs/06-CONTEXT-AND-COST-INTELLIGENCE.md",
  "docs/07-QUALITY-GATES.md",
  "docs/08-SECURITY.md",
  "docs/09-PERFORMANCE.md",
  "docs/10-INSTALLATION.md",
  "docs/11-ADAPTERS.md",
  "docs/12-REVIEW-BUNDLE.md",
  "docs/13-DEFINITION-OF-DONE.md",
  "docs/14-BACKLOG.md",
  "docs/15-GITHUB-DIRECT-REVIEW.md",
  "skills/uads-orchestrator/SKILL.md",
  "schemas/checkpoint.schema.json",
  "schemas/work-order.schema.json",
  "schemas/evidence-manifest.schema.json",
  "schemas/review-manifest.schema.json",
  "schemas/project-profile.schema.json",
  "schemas/repository-map.schema.json",
  "schemas/intake.schema.json",
  "schemas/routing-decision.schema.json",
  "schemas/execution-run.schema.json",
  "schemas/execution-packet.schema.json",
  "schemas/evidence-record.schema.json",
  "schemas/review-record.schema.json",
  "schemas/review-packet.schema.json",
  "schemas/compatibility-evidence.schema.json",
  "schemas/index-state.schema.json",
  "schemas/dependency-graph.schema.json",
  "schemas/test-map.schema.json",
  "schemas/interface-map.schema.json",
  "schemas/impact-report.schema.json",
  "schemas/context-pack.schema.json",
  "schemas/failure-record.schema.json",
  "schemas/diagnosis-report.schema.json",
  "schemas/failure-memory.schema.json",
  "schemas/model-profile.schema.json",
  "schemas/model-profile-registry.schema.json",
  "schemas/runtime-capability-snapshot.schema.json",
  "schemas/model-execution-plan.schema.json",
  "schemas/github-direct-review-evidence.schema.json",
  "schemas/ci-gate-receipt.schema.json",
  "schemas/specialist-profile.schema.json",
  "schemas/specialist-registry.schema.json",
  "schemas/specialist-registry-state.schema.json",
  "schemas/specialist-selection-plan.schema.json",
  "schemas/host-adapter-state.schema.json",
  "schemas/host-dispatch-bundle.schema.json",
  "schemas/host-execution-receipt.schema.json",
  "schemas/github-review-index.schema.json",
  ".engineering/README.md",
  ".engineering/PROTOCOL.md",
  ".engineering/DECISIONS.md",
  ".engineering/schemas/engineering-work-order.schema.json",
  ".engineering/schemas/context-lock.schema.json",
  ".engineering/schemas/evidence-bundle.schema.json",
  ".engineering/schemas/correction-delta.schema.json",
  ".engineering/schemas/checkpoint-delta.schema.json",
  ".engineering/schemas/report.schema.json",
  ".engineering/templates/WORK-ORDER.md",
  ".engineering/templates/CONTEXT-LOCK.md",
  ".engineering/templates/EVIDENCE-BUNDLE.md",
  ".engineering/templates/CORRECTION-DELTA.md",
  ".engineering/templates/CHECKPOINT-DELTA.md",
  ".engineering/templates/REPORT.md",
  ".engineering/work-orders/ENG-PROTOCOL-ADOPTION-001.md",
  ".engineering/context-locks/ENG-PROTOCOL-ADOPTION-001.md",
  ".engineering/baselines/ENG-PROTOCOL-ADOPTION-001.md",
  ".engineering/reports/CLEANUP-INVENTORY.md",
  ".engineering/reports/EVIDENCE-BUNDLE-ENG-PROTOCOL-ADOPTION-001.md",
  ".engineering/checkpoints/CHECKPOINT-DELTA-ENG-PROTOCOL-ADOPTION-001.md",
  ".engineering/work-orders/PROMPT-011-ASSURANCE-STABILIZATION-001.md",
  ".engineering/context-locks/PROMPT-011-ASSURANCE-STABILIZATION-001.md",
  ".engineering/baselines/PROMPT-011-ASSURANCE-STABILIZATION-001.md",
  ".engineering/reports/EVIDENCE-BUNDLE-PROMPT-011-ASSURANCE-STABILIZATION-001.md",
  ".engineering/checkpoints/CHECKPOINT-DELTA-PROMPT-011-ASSURANCE-STABILIZATION-001.md",
  ".engineering/work-orders/PROMPT-012-HOST-EXECUTION-IMPLEMENTATION-001.md",
  ".engineering/context-locks/PROMPT-012-HOST-EXECUTION-IMPLEMENTATION-001.md",
  ".engineering/baselines/PROMPT-012-HOST-EXECUTION-IMPLEMENTATION-001.md",
  ".engineering/reports/EVIDENCE-BUNDLE-PROMPT-012-HOST-EXECUTION-IMPLEMENTATION-001.md",
  ".engineering/checkpoints/CHECKPOINT-DELTA-PROMPT-012-HOST-EXECUTION-IMPLEMENTATION-001.md",
  ".github/ISSUE_TEMPLATE/implementation.yml",
  ".github/workflows/compatibility.yml",
  "scripts/validate/validate-engineering-protocol.mjs",
  "skills/uads-orchestrator/references/ORCHESTRATION-PROTOCOL.md",
  "evals/orchestrator/e1-frontend-style.json",
  "evals/execution/x1-frontend-happy.json",
  "evals/context/cci1-local-frontend.json",
  "src/eval/context.ts",
  "evals/fault/fl1-direct-stack.json",
  "evals/fault/fl11-repeated-diagnose.json",
  "evals/fault/fl16-symlink-binding.json",
  "evals/fault/fl17-stale-active-digest.json",
  "evals/fault/fl18-postfix-live-drift.json",
  "src/eval/fault.ts",
  "evals/assurance/cases.json",
  "src/eval/assurance.ts",
  "evals/fault-injection/cases.json",
  "src/eval/fault-injection.ts",
  "src/eval/model-routing.ts",
  "src/eval/specialist-routing.ts",
  "evals/specialist-routing/cases.json",
  "src/eval/adapters.ts",
  "evals/adapters/cases.json",
  "evals/host-execution/cases.json",
  "src/kernel/specialist-router.ts",
  "src/kernel/specialist-obligations.ts",
  "src/kernel/specialist-registry.ts",
  "src/kernel/specialist-catalog.ts",
  "src/kernel/specialist-persist.ts",
  "src/adapters/host-adapter-types.ts",
  "src/adapters/host-adapter.ts",
  "src/adapters/host-adapter-registry.ts",
  "src/adapters/host-adapter-detect.ts",
  "src/adapters/host-adapter-legacy.ts",
  "src/adapters/host-adapter-root.ts",
  "src/adapters/host-adapter-install.ts",
  "src/adapters/host-dispatch.ts",
  "src/adapters/host-execution.ts",
  "src/adapters/cursor-adapter.ts",
  "src/adapters/codex-adapter.ts",
  "src/adapters/generic-agent-skills-adapter.ts",
  "src/commands/adapters.ts",
  "tests/host-execution.test.ts",
  "src/github/review-index.ts",
  "src/github/security-proof.ts",
  "evals/model-routing/cases.json",
  "src/kernel/fault-localization.ts",
  "agents/uads-repo-inspector.md",
  "agents/uads-requirements-engineer.md",
  "agents/uads-software-architect.md",
  "agents/uads-implementation-planner.md",
  "agents/uads-test-engineer.md",
  "src/kernel/orchestrator.ts",
  "src/kernel/execution.ts",
  "src/kernel/assurance-policy.ts",
  "src/eval/run.ts",
  "src/eval/execution.ts",
  "scripts/install/install.sh",
  "scripts/install/install.ps1",
  "scripts/install/install.mjs",
  "scripts/lib/exec.mjs",
  "scripts/review/create-review-bundle.mjs",
  "scripts/review/inspect-review-bundle.mjs",
  "scripts/validate/validate-action-pins.mjs",
  "scripts/validate/capture-evidence.mjs",
  "scripts/release/verify-release.mjs",
  "scripts/release/run-validation.mjs",
  "scripts/release/build-release.mjs",
  "scripts/release/reconstruct-historical.mjs",
  "scripts/release/publish-release.mjs",
  "scripts/github/configure-repository.mjs",
  "scripts/github/audit-repository.mjs",
  "scripts/github/generate-direct-review-evidence.mjs",
  "scripts/github/validate-direct-review.mjs",
  "scripts/github/finalize-direct-review-evidence.mjs",
  "scripts/github/ci-gate-receipt-runtime.mjs",
  "scripts/github/generate-ci-gate-receipt.mjs",
  "scripts/github/validate-ci-gate-receipt.mjs",
  "scripts/github/publish-direct-review-evidence.mjs",
  "scripts/github/comparison-runtime.mjs",
  "scripts/github/validate-direct-review-standalone.mjs",
  "scripts/github/security-proof.mjs",
  "scripts/github/compatibility-smoke.mjs",
  "scripts/github/generate-compatibility-evidence.mjs",
  "schemas/validation-summary.schema.json",
  "schemas/release-manifest.schema.json",
  "schemas/release-validation-report.schema.json",
  "src/cli.ts",
  "package.json",
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length > 0) {
  process.stderr.write(`Missing required foundation files:\n${missing.map((file) => `- ${file}`).join("\n")}\n`);
  process.exit(1);
}

function runNpmGate(args) {
  const result = runNpm(args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runNpmGate(["run", "lint"]);
runNpmGate(["run", "typecheck"]);
runNpmGate(["run", "build"]);
runNpmGate(["test"]);
runNpmGate(["run", "eval:orchestrator"]);
runNpmGate(["run", "eval:execution"]);
runNpmGate(["run", "eval:context"]);
runNpmGate(["run", "eval:fault"]);
runNpmGate(["run", "eval:cost"]);
runNpmGate(["run", "eval:model-routing"]);
runNpmGate(["run", "eval:specialist-routing"]);
runNpmGate(["run", "eval:adapters"]);
runNpmGate(["run", "eval:host-execution"]);
runNpmGate(["run", "eval:assurance"]);
runNpmGate(["run", "eval:fault-injection"]);
runNpmGate(["run", "validate:skills"]);
runNpmGate(["run", "validate:actions"]);
runNpmGate(["run", "validate:direct-review"]);
runNpmGate(["run", "validate:ci-receipt"]);
runNpmGate(["run", "validate:engineering"]);

const cli = path.join(root, "dist", "cli.js");
for (const args of [["--help"], ["doctor"], ["status"], ["inspect", "--json"]]) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }
  if (!result.stdout || result.stdout.trim().length === 0) {
    process.stderr.write(`CLI produced no output for: uads ${args.join(" ")}\n`);
    process.exit(1);
  }
  if (args[0] === "--help") {
    for (const command of ["inspect", "plan", "dispatch", "verify", "finalize", "evidence", "assurance", "index", "impact", "context", "failure", "diagnose", "failures", "cache", "cost", "models", "capabilities", "specialists", "adapters", "status", "resume", "review", "doctor"]) {
      if (!result.stdout.includes(command)) {
        process.stderr.write(`CLI help missing command: ${command}\n`);
        process.exit(1);
      }
    }
  }
}

process.stdout.write("UADS foundation validation passed.\n");
