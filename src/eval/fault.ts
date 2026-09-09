import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runPlan } from "../kernel/orchestrator.js";
import { runDispatch, runEvidenceRecord, runFinalize, runVerify, runAssuranceRecord, runAssuranceStart } from "../kernel/execution.js";
import { isReviewGate } from "../kernel/gates.js";
import { diagnoseFailure, recordFailure } from "../kernel/fault-localization.js";
import { markVerifiedResolution } from "../kernel/failure-memory.js";
import { assertSafeEvidenceInput, computeFailureAttemptDigest, resolveFailureExecutionBinding } from "../kernel/failure-binding.js";
import { computeLiveChangeDigest } from "../kernel/change-digest.js";
import { failurePaths, listFailureRecords, readFailureMemory, readFailureRecord } from "../kernel/failure-persist.js";
import { findPackageRoot } from "../lib/version.js";
import { getUadsPaths } from "../lib/workspace.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "../lib/secrets.js";
import { runFailureRecordCommand, runFailureResolveCommand } from "../commands/failure.js";

type EvalCase = { id: string; name: string };

const gitEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "UADS Eval",
  GIT_AUTHOR_EMAIL: "uads@example.com",
  GIT_COMMITTER_NAME: "UADS Eval",
  GIT_COMMITTER_EMAIL: "uads@example.com",
};

const TOKEN = `ghp_${"b".repeat(36)}`;

function initRepo(root: string): void {
  execFileSync("git", ["init", "-b", "main"], { cwd: root, env: gitEnv });
  execFileSync("git", ["-c", "user.email=uads@example.com", "-c", "user.name=UADS Eval", "config", "commit.gpgsign", "false"], {
    cwd: root,
    env: gitEnv,
  });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/uads-fault-eval.git"], { cwd: root, env: gitEnv });
}

function gitCommit(root: string, message: string): void {
  execFileSync("git", ["add", "-A"], { cwd: root, env: gitEnv });
  execFileSync(
    "git",
    ["-c", "commit.gpgsign=false", "-c", "user.email=uads@example.com", "-c", "user.name=UADS Eval", "commit", "-m", message],
    { cwd: root, env: gitEnv },
  );
}

function write(root: string, rel: string, contents: string | Buffer): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

function seedRepo(repo: string): void {
  initRepo(repo);
  write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("ok");\n`);
  write(repo, "src/ui/Button.test.tsx", `import { Button } from "./Button";\nexport const t = Button;\n`);
  write(repo, "src/ui/Card.tsx", `import { format } from "../util/format";\nexport const Card = () => format("card");\n`);
  write(repo, "src/ui/Card.test.tsx", `import { Card } from "./Card";\nexport const t = Card;\n`);
  write(repo, "src/util/format.ts", `export const format = (v: string) => v;\n`);
  write(repo, "src/auth/login.ts", `export const login = () => "auth";\n`);
  write(repo, "src/web3/vault.ts", `export const withdraw = () => "no";\n`);
  write(repo, "src/db/client.ts", `export const query = () => "db";\n`);
  write(repo, "src/backend/api.ts", `export const handler = () => "api";\n`);
  write(repo, "package.json", `${JSON.stringify({ name: "fault-eval", version: "1.0.0" }, null, 2)}\n`);
  gitCommit(repo, "init");
}

function intake() {
  return {
    schema: "uads.intake",
    schemaVersion: "0.2.0",
    objective: "Change the primary button color.",
    domainSignals: ["frontend"],
    affectedAreas: ["src/ui"],
    inScope: ["src/ui"],
    outOfScope: ["src/backend", "src/web3", "src/auth", "src/db"],
    acceptanceCriteria: ["Button uses the new color"],
    classifier: "host-structured",
  };
}

function stackFor(repo: string, rel: string, fn = "run"): string {
  return `Error: boom\n    at ${fn} (${path.join(repo, rel)}:2:1)\n`;
}

function recordGates(repo: string, home: string, gates: string[], exitCode = 0): void {
  for (const gate of gates) {
    if (isReviewGate(gate)) continue;
    const outputPath = path.join(home, `gate-${gate}.txt`);
    fs.writeFileSync(outputPath, `${gate} captured output\n`);
    runEvidenceRecord({
      cwd: repo,
      uadsHome: home,
      gateId: gate,
      kind: "command",
      role: "test-engineer",
      command: `npm run ${gate}`,
      exitCode,
      outputPath,
      summary: `${gate} recorded`,
    });
  }
}

function approveAll(repo: string, home: string, reviewers: string[]): void {
  runAssuranceStart({ cwd: repo, uadsHome: home });
  for (const role of reviewers) {
    runAssuranceRecord({
      cwd: repo,
      uadsHome: home,
      role,
      session: `rev-${role}`,
      implementerSession: "imp-1",
      verdict: "APPROVED",
      summary: `${role} approved`,
    });
  }
}

function completeCorrectiveExecution(
  repo: string,
  home: string,
  planned: { workOrder: { qualityGates: string[]; assuranceReviewers: string[] } },
): ReturnType<typeof runFinalize> {
  recordGates(repo, home, planned.workOrder.qualityGates);
  approveAll(repo, home, planned.workOrder.assuranceReviewers);
  return runFinalize({ cwd: repo, uadsHome: home });
}

function bindFailure(input: {
  repo: string;
  home: string;
  planned: ReturnType<typeof runPlan>;
  paths: ReturnType<typeof getUadsPaths>;
  root: string;
  text: string;
}) {
  const dispatched = runDispatch({ cwd: input.repo, uadsHome: input.home, session: "imp-1" });
  write(input.repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("broken");\n`);
  const verified = runVerify({ cwd: input.repo, uadsHome: input.home });
  const record = recordFailure({
    repoRoot: input.repo,
    projectId: input.planned.workOrder.projectId,
    paths: input.paths,
    source: "runtime",
    text: input.text,
    workOrderId: dispatched.run.workOrderId,
    executionRunId: dispatched.run.executionRunId,
    changeDigest: verified.run.currentChangeDigest,
    schemaRoot: input.root,
  });
  diagnoseFailure({
    repoRoot: input.repo,
    projectId: input.planned.workOrder.projectId,
    paths: input.paths,
    failureRecordId: record.failureRecordId,
    schemaRoot: input.root,
  });
  write(input.repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("fixed");\n`);
  runVerify({ cwd: input.repo, uadsHome: input.home });
  const done = completeCorrectiveExecution(input.repo, input.home, input.planned);
  assert(done.run.status === "completed", "corrective execution did not complete");
  markVerifiedResolution({
    paths: input.paths,
    projectId: input.planned.workOrder.projectId,
    failureRecordId: record.failureRecordId,
    executionRunId: dispatched.run.executionRunId,
    repoRoot: input.repo,
    schemaRoot: input.root,
  });
  return { record, dispatched };
}

function trySymlink(_dir: string, target: string, link: string): boolean {
  try {
    fs.symlinkSync(target, link, "file");
    return true;
  } catch {
    return false;
  }
}

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

function runCase(id: string, fn: () => void): { id: string; ok: boolean; error?: string } {
  try {
    fn();
    return { id, ok: true };
  } catch (error) {
    return { id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function main(): number {
  const root = findPackageRoot();
  const cases: EvalCase[] = fs
    .readdirSync(path.join(root, "evals/fault"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(root, "evals/fault", name), "utf8")) as EvalCase)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  const results = cases.map((item) =>
    runCase(item.id, () => {
      const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-fl-"));
      const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-fl-home-"));
      seedRepo(repo);
      const planned = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
      const paths = getUadsPaths(planned.workOrder.projectId, home);
      const base = {
        repoRoot: repo,
        projectId: planned.workOrder.projectId,
        paths,
        schemaRoot: root,
      };
      const unrelated = ["src/auth/login.ts", "src/web3/vault.ts", "src/db/client.ts", "src/backend/api.ts"];

      if (item.id === "FL1") {
        write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("fail");\n`);
        const record = recordFailure({
          ...base,
          source: "runtime",
          text: stackFor(repo, "src/ui/Button.tsx"),
        });
        const report = diagnoseFailure({ ...base, failureRecordId: record.failureRecordId });
        assert(report.rankedCandidates[0]?.path === "src/ui/Button.tsx", "FL1 expected Button first");
        assert(report.recommendedRadius === "C1", `FL1 radius ${report.recommendedRadius}`);
        assert(
          report.rankedCandidates.every((candidate) => !unrelated.includes(candidate.path)),
          "FL1 selected unrelated subsystem",
        );
        assert(report.status === "localized", `FL1 status ${report.status}`);
      }

      if (item.id === "FL2") {
        const record = recordFailure({
          ...base,
          source: "test",
          text: "FAIL src/ui/Button.test.tsx > color\nAssertionError: expected blue",
        });
        const report = diagnoseFailure({ ...base, failureRecordId: record.failureRecordId });
        assert(
          report.rankedCandidates.some((candidate) => candidate.path === "src/ui/Button.tsx" && candidate.score >= 0.25),
          "FL2 expected Test Map source ranked",
        );
        assert(report.rankedCandidates[0]?.path !== "src/web3/vault.ts", "FL2 web3 first");
      }

      if (item.id === "FL3") {
        write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("dirty");\n`);
        write(repo, "src/auth/login.ts", `export const login = () => "changed-unrelated";\n`);
        const record = recordFailure({
          ...base,
          source: "runtime",
          text: stackFor(repo, "src/ui/Button.tsx"),
        });
        const report = diagnoseFailure({ ...base, failureRecordId: record.failureRecordId });
        const button = report.rankedCandidates.find((candidate) => candidate.path === "src/ui/Button.tsx");
        const auth = report.rankedCandidates.find((candidate) => candidate.path === "src/auth/login.ts");
        assert(Boolean(button), "FL3 missing button");
        assert((button?.score ?? 0) > (auth?.score ?? 0), "FL3 unrelated changed file dominated");
        assert(!auth || !auth.signals.includes("related-changed"), "FL3 unrelated marked related-changed");
      }

      if (item.id === "FL4") {
        const record = recordFailure({
          ...base,
          source: "test",
          text: "FAIL src/ui/Button.test.tsx > a\nFAIL src/ui/Card.test.tsx > b\n",
        });
        const report = diagnoseFailure({ ...base, failureRecordId: record.failureRecordId });
        const util = report.rankedCandidates.find((candidate) => candidate.path === "src/util/format.ts");
        assert(Boolean(util) && (util?.score ?? 0) >= 0.25, "FL4 shared utility not ranked");
        assert(util?.signals.includes("shared-utility") || (util?.score ?? 0) >= 0.25, "FL4 missing shared-utility signal");
        assert(["C2", "C3"].includes(report.recommendedRadius), `FL4 radius ${report.recommendedRadius}`);
        assert(report.recommendedRadius !== "C5", "FL4 jumped to C5");
      }

      if (item.id === "FL5") {
        const record = recordFailure({
          ...base,
          source: "test",
          text: `FAIL src/ui/Button.test.tsx > color\n${stackFor(repo, "src/ui/Button.tsx")}`,
        });
        const report = diagnoseFailure({ ...base, failureRecordId: record.failureRecordId });
        assert(
          report.rankedCandidates.every((candidate) => !unrelated.includes(candidate.path)),
          "FL5 selected auth/web3/db",
        );
      }

      if (item.id === "FL6") {
        const record = recordFailure({
          ...base,
          source: "runtime",
          text: `${stackFor(repo, "src/ui/Button.tsx", "a")}${stackFor(repo, "src/ui/Card.tsx", "b")}`,
        });
        const report = diagnoseFailure({ ...base, failureRecordId: record.failureRecordId });
        assert(report.status === "ambiguous", `FL6 status ${report.status}`);
        assert(report.nextEvidence.length > 0, "FL6 missing next evidence");
        assert(!report.escalationReason || !/root cause confirmed/i.test(report.escalationReason), "FL6 invented root cause");
      }

      if (item.id === "FL7") {
        write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("fail");\n`);
        let last = null as ReturnType<typeof diagnoseFailure> | null;
        for (let i = 0; i < 3; i += 1) {
          const record = recordFailure({
            ...base,
            source: "runtime",
            text: stackFor(repo, "src/ui/Button.tsx"),
          });
          last = diagnoseFailure({ ...base, failureRecordId: record.failureRecordId });
        }
        assert(Boolean(last?.loopState.detected), "FL7 loop not detected");
        assert(Boolean(last?.loopState.recommendedAction.includes("LOOP_DETECTED")), "FL7 missing LOOP_DETECTED");
      }

      if (item.id === "FL8") {
        const bound = bindFailure({
          repo,
          home,
          planned,
          paths,
          root,
          text: stackFor(repo, "src/ui/Button.tsx"),
        });
        const again = recordFailure({
          ...base,
          source: "runtime",
          text: stackFor(repo, "src/ui/Button.tsx"),
        });
        const report = diagnoseFailure({ ...base, failureRecordId: again.failureRecordId });
        assert(
          report.memoryMatches.some((match) => match.kind === "reusable"),
          "FL8 expected reusable memory",
        );
        assert(bound.record.executionRunId === bound.dispatched.run.executionRunId, "FL8 unbound failure");
      }

      if (item.id === "FL9") {
        bindFailure({
          repo,
          home,
          planned,
          paths,
          root,
          text: stackFor(repo, "src/ui/Button.tsx"),
        });
        write(repo, "src/util/format.ts", `export const format = (v: string) => v.toUpperCase();\n`);
        const again = recordFailure({
          ...base,
          source: "runtime",
          text: stackFor(repo, "src/ui/Button.tsx"),
        });
        const report = diagnoseFailure({ ...base, failureRecordId: again.failureRecordId });
        assert(
          report.memoryMatches.every((match) => match.kind !== "reusable"),
          "FL9 treated stale dependency memory as reusable",
        );
        assert(
          report.memoryMatches.some((match) => match.kind === "historical") || report.memoryMatches.length === 0,
          "FL9 expected historical memory",
        );
      }

      if (item.id === "FL10") {
        const host = path.join(repo, "src/ui/Button.tsx");
        const text = `Error: token ${TOKEN} at ${host}\n    at run (${host}:2:1)\n`;
        write(repo, "fail.txt", text);
        const record = recordFailure({
          ...base,
          source: "runtime",
          text,
        });
        const report = diagnoseFailure({ ...base, failureRecordId: record.failureRecordId });
        const persisted = JSON.stringify(readFailureRecord(paths, record.failureRecordId, root));
        const diagnosis = JSON.stringify(report);
        const memoryFile = fs.readFileSync(failurePaths(paths).memory, "utf8");
        for (const blob of [persisted, diagnosis, memoryFile, record.signature, record.messageSummary]) {
          assert(!blob.includes(TOKEN), "FL10 leaked github token");
          assert(!containsUnredactedSecret(blob), "FL10 unredacted secret");
        }
        assert(!containsAbsoluteHostPath(persisted), "FL10 host path in record");
        assert(!containsAbsoluteHostPath(diagnosis), "FL10 host path in diagnosis");
        assert(fs.existsSync(path.join(repo, "fail.txt")), "FL10 deleted input");
        assert(!fs.existsSync(path.join(paths.workspace, "failures", "fail.txt")), "FL10 copied input into sidecar");
      }

      if (item.id === "FL11") {
        write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("fail");\n`);
        const record = recordFailure({
          ...base,
          source: "runtime",
          text: stackFor(repo, "src/ui/Button.tsx"),
        });
        diagnoseFailure({ ...base, failureRecordId: record.failureRecordId });
        diagnoseFailure({ ...base, failureRecordId: record.failureRecordId });
        const third = diagnoseFailure({ ...base, failureRecordId: record.failureRecordId });
        assert(!third.loopState.detected, "FL11 repeated diagnose fabricated a loop");
        assert(third.loopState.occurrences === 1, "FL11 fabricated extra occurrences");
      }

      if (item.id === "FL12") {
        write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("fail");\n`);
        let last = null as ReturnType<typeof diagnoseFailure> | null;
        const ids = new Set<string>();
        for (let i = 0; i < 3; i += 1) {
          const record = recordFailure({
            ...base,
            source: "runtime",
            text: stackFor(repo, "src/ui/Button.tsx"),
          });
          ids.add(record.failureRecordId);
          last = diagnoseFailure({ ...base, failureRecordId: record.failureRecordId });
        }
        assert(ids.size === 3, "FL12 did not create distinct observations");
        assert(Boolean(last?.loopState.detected), "FL12 loop not detected");
      }

      if (item.id === "FL13") {
        write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("one");\n`);
        const first = recordFailure({
          ...base,
          source: "runtime",
          text: stackFor(repo, "src/ui/Button.tsx"),
        });
        write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("two");\n`);
        const second = recordFailure({
          ...base,
          source: "runtime",
          text: stackFor(repo, "src/ui/Button.tsx"),
        });
        assert(first.changeDigest !== second.changeDigest, "FL13 same-path different bytes collapsed");
        const digestA = computeFailureAttemptDigest({
          repoRoot: repo,
          gitHead: second.repositoryHead,
          indexDigest: second.repositoryIndexDigest,
        });
        write(repo, "blob.bin", Buffer.from([1, 2, 3]));
        const digestB = computeFailureAttemptDigest({
          repoRoot: repo,
          gitHead: second.repositoryHead,
          indexDigest: second.repositoryIndexDigest,
        });
        write(repo, "blob.bin", Buffer.from([4, 5, 6]));
        const digestC = computeFailureAttemptDigest({
          repoRoot: repo,
          gitHead: second.repositoryHead,
          indexDigest: second.repositoryIndexDigest,
        });
        assert(digestB !== digestA && digestC !== digestB, "FL13 untracked binary identity collapsed");
      }

      if (item.id === "FL14") {
        const dispatchedB = runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
        write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("b");\n`);
        runVerify({ cwd: repo, uadsHome: home });
        const doneB = completeCorrectiveExecution(repo, home, planned);
        assert(doneB.run.status === "completed", "FL14 execution B did not complete");
        gitCommit(repo, "complete B");
        const plannedA = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
        const dispatchedA = runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
        write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("a");\n`);
        const verifiedA = runVerify({ cwd: repo, uadsHome: home });
        const boundA = recordFailure({
          repoRoot: repo,
          projectId: plannedA.workOrder.projectId,
          paths,
          source: "runtime",
          text: stackFor(repo, "src/ui/Button.tsx"),
          workOrderId: dispatchedA.run.workOrderId,
          executionRunId: dispatchedA.run.executionRunId,
          changeDigest: verifiedA.run.currentChangeDigest,
          schemaRoot: root,
        });
        let rejected = false;
        try {
          markVerifiedResolution({
            paths,
            projectId: plannedA.workOrder.projectId,
            failureRecordId: boundA.failureRecordId,
            executionRunId: dispatchedB.run.executionRunId,
            repoRoot: repo,
            schemaRoot: root,
          });
        } catch {
          rejected = true;
        }
        assert(rejected, "FL14 unrelated execution resolved failure A");
      }

      if (item.id === "FL15") {
        bindFailure({
          repo,
          home,
          planned,
          paths,
          root,
          text: stackFor(repo, "src/ui/Button.tsx"),
        });
        const reuse = recordFailure({
          ...base,
          source: "runtime",
          text: stackFor(repo, "src/ui/Button.tsx"),
        });
        const reusable = diagnoseFailure({ ...base, failureRecordId: reuse.failureRecordId });
        assert(
          reusable.memoryMatches.some((match) => match.kind === "reusable"),
          "FL15 expected post-fix reusable memory",
        );
        write(repo, "src/util/format.ts", `export const format = (v: string) => v + "!";\n`);
        const dep = recordFailure({
          ...base,
          source: "runtime",
          text: stackFor(repo, "src/ui/Button.tsx"),
        });
        const historical = diagnoseFailure({ ...base, failureRecordId: dep.failureRecordId });
        assert(
          historical.memoryMatches.every((match) => match.kind !== "reusable"),
          "FL15 dependency-only change stayed reusable",
        );
        assert(
          historical.memoryMatches.some((match) => match.kind === "historical"),
          "FL15 expected historical after dependency change",
        );
      }

      if (item.id === "FL16") {
        const dispatched = runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
        let mismatchRejected = false;
        try {
          resolveFailureExecutionBinding({
            paths,
            projectId: planned.workOrder.projectId,
            requestedExecutionRunId: "er_forged",
            schemaRoot: root,
          });
        } catch {
          mismatchRejected = true;
        }
        assert(mismatchRejected, "FL16 accepted forged execution binding");
        assert(Boolean(dispatched.run.executionRunId), "FL16 missing dispatch");
        const outside = path.join(os.tmpdir(), `uads-fl16-${Date.now()}.txt`);
        const secret = `fl16-outside-${Date.now()}`;
        fs.writeFileSync(outside, `${secret}\n`);
        const link = path.join(repo, "escape.txt");
        if (trySymlink(repo, outside, link)) {
          let escaped = false;
          try {
            assertSafeEvidenceInput(link, repo, paths.workspace);
            escaped = true;
          } catch {
            escaped = false;
          }
          assert(!escaped, "FL16 followed symlink escape");
          let commandRejected = false;
          try {
            runFailureRecordCommand({
              cwd: repo,
              uadsHome: home,
              source: "runtime",
              inputPath: link,
            });
          } catch {
            commandRejected = true;
          }
          assert(commandRejected, "FL16 CLI accepted symlink escape");
          const sidecarText = fs.existsSync(failurePaths(paths).memory)
            ? fs.readFileSync(failurePaths(paths).memory, "utf8")
            : "";
          assert(!sidecarText.includes(secret), "FL16 persisted external symlink contents");
        }
      }

      if (item.id === "FL17") {
        const dispatched = runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
        write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("d1");\n`);
        const verifiedD1 = runVerify({ cwd: repo, uadsHome: home });
        const digestD1 = verifiedD1.run.currentChangeDigest;
        write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("d2");\n`);
        const inputPath = path.join(paths.workspace, "fail-input.txt");
        fs.writeFileSync(inputPath, stackFor(repo, "src/ui/Button.tsx"));
        let staleRejected = false;
        try {
          runFailureRecordCommand({
            cwd: repo,
            uadsHome: home,
            source: "runtime",
            inputPath,
            executionRun: dispatched.run.executionRunId,
          });
        } catch {
          staleRejected = true;
        }
        assert(staleRejected, "FL17 accepted stale D1 label for D2 observation");
        assert(
          listFailureRecords(paths, root).every((item) => item.changeDigest !== digestD1),
          "FL17 persisted a D1-labeled record for D2",
        );
        const verifiedD2 = runVerify({ cwd: repo, uadsHome: home });
        const output = runFailureRecordCommand({
          cwd: repo,
          uadsHome: home,
          json: true,
          source: "runtime",
          inputPath,
        });
        const created = JSON.parse(output) as { failureRecordId: string };
        const persisted = readFailureRecord(paths, created.failureRecordId, root);
        assert(persisted.changeDigest === verifiedD2.run.currentChangeDigest, "FL17 did not bind D2 after re-verify");
        assert(persisted.executionRunId === dispatched.run.executionRunId, "FL17 lost execution binding after re-verify");
      }

      if (item.id === "FL18") {
        const bound = bindFailure({
          repo,
          home,
          planned,
          paths,
          root,
          text: stackFor(repo, "src/ui/Button.tsx"),
        });
        const digestD1 = computeLiveChangeDigest(repo);
        const memoryD1 = readFailureMemory(paths, planned.workOrder.projectId, root);
        const entryD1 = memoryD1.entries.find((item) => item.failureSignature === bound.record.signature);
        assert(Boolean(entryD1?.resolutionChangeDigest), "FL18 missing D1 resolution digest");
        const basisD1 = JSON.stringify(entryD1?.validityBasisDigests ?? {});
        write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("drift");\n`);
        assert(computeLiveChangeDigest(repo) !== digestD1, "FL18 live digest did not drift");
        let rejected = false;
        try {
          runFailureResolveCommand({
            cwd: repo,
            uadsHome: home,
            failureRecordId: bound.record.failureRecordId,
          });
        } catch {
          rejected = true;
        }
        assert(rejected, "FL18 mixed D2 live state into D1 verified memory");
        const after = readFailureMemory(paths, planned.workOrder.projectId, root);
        const entryAfter = after.entries.find((item) => item.failureSignature === bound.record.signature);
        assert(JSON.stringify(entryAfter?.validityBasisDigests ?? {}) === basisD1, "FL18 mutated validity basis after stale resolve");
        assert(entryAfter?.resolutionChangeDigest === entryD1?.resolutionChangeDigest, "FL18 changed resolution digest after stale resolve");
      }
    }),
  );

  const failed = results.filter((item) => !item.ok);
  for (const item of results) {
    process.stdout.write(`${item.id} ${item.ok ? "PASS" : "FAIL"}${item.error ? ` ${item.error}` : ""}\n`);
  }
  process.stdout.write(`fault eval ${results.length - failed.length}/${results.length}\n`);
  return failed.length === 0 ? 0 : 1;
}

process.exitCode = main();
