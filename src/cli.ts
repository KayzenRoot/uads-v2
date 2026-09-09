#!/usr/bin/env node
import { Command } from "commander";
import { runAssuranceRecordCommand, runAssuranceStartCommand } from "./commands/assurance.js";
import { runContextExpandCommand } from "./commands/context.js";
import { runContextPackCommand, runImpactCommand, runIndexCommand } from "./commands/intelligence.js";
import { runDispatchCommand } from "./commands/dispatch.js";
import { runDoctor } from "./commands/doctor.js";
import { runEvidenceRecordCommand } from "./commands/evidence.js";
import { runFinalizeCommand } from "./commands/finalize.js";
import { runInspectCommand } from "./commands/inspect.js";
import { runPlanCommand } from "./commands/plan.js";
import { runResumeCommand } from "./commands/resume.js";
import { runReview } from "./commands/review.js";
import { runStatus } from "./commands/status.js";
import {
  runDashboardEventsCommand,
  runDashboardStartCommand,
  runDashboardStatusCommand,
} from "./commands/dashboard.js";
import { runCacheExplainCommand, runCacheStatusCommand } from "./commands/cache.js";
import { runCostExplainCommand, runCostStatusCommand } from "./commands/cost.js";
import { runVerifyCommand } from "./commands/verify.js";
import {
  runCapabilitiesExplainCommand,
  runCapabilitiesStatusCommand,
  runModelsExplainCommand,
  runModelsListCommand,
  runModelsRegisterCommand,
  runModelsRouteCommand,
  runModelsStatusCommand,
} from "./commands/models.js";
import {
  runDiagnoseCommand,
  runFailureRecordCommand,
  runFailureResolveCommand,
  runFailureShowCommand,
  runFailuresCommand,
} from "./commands/failure.js";
import { readUadsVersion } from "./lib/version.js";
import { runSpecialistsExplainCommand, runSpecialistsListCommand, runSpecialistsSelectCommand, runSpecialistsStatusCommand } from "./commands/specialists.js";
import {
  runAdaptersDetectCommand,
  runAdaptersExplainCommand,
  runAdaptersInstallCommand,
  runAdaptersHandoffCommand,
  runAdaptersListCommand,
  runAdaptersPrepareCommand,
  runAdaptersReceiptCommand,
  runAdaptersStatusCommand,
  runAdaptersUninstallCommand,
} from "./commands/adapters.js";

const program = new Command();

program
  .name("uads")
  .description(
    "UADS - Universal Autonomous Development Studio by NexLabs. Global-first autonomous software engineering orchestration.",
  )
  .version(readUadsVersion());

program
  .command("doctor")
  .description("Check the local environment, git repo, and global UADS installation")
  .action(() => {
    process.stdout.write(runDoctor());
  });

program
  .command("inspect")
  .description("Inspect the current repository and cache a compact map in the sidecar")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => {
    process.stdout.write(runInspectCommand({ json: options.json }));
  });

program
  .command("plan")
  .description("Create a Work Order, routing decision, and checkpoint without editing product code")
  .option("--request <text>", "conservative fallback text intake (not the semantic authority)")
  .option("--intake <path>", "path to schema-valid structured intake JSON")
  .option("--json", "JSON output")
  .action((options: { request?: string; intake?: string; json?: boolean }) => {
    process.stdout.write(
      runPlanCommand({
        request: options.request,
        intakePath: options.intake,
        json: options.json,
      }),
    );
  });

program
  .command("dispatch")
  .description("Create a bounded execution run and packet from the current planned Work Order")
  .option("--json", "JSON output")
  .option("--session <id>", "implementer session id")
  .action((options: { json?: boolean; session?: string }) => {
    process.stdout.write(runDispatchCommand({ json: options.json, session: options.session }));
  });

const models = program.command("models").description("Provider-neutral model profiles and deterministic routing");
models
  .command("list")
  .description("List registered model profiles without contacting providers")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => { process.stdout.write(runModelsListCommand({ json: options.json })); });
models
  .command("status")
  .description("Show model registry, runtime identity, and current routing plan")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => { process.stdout.write(runModelsStatusCommand({ json: options.json })); });
models
  .command("explain")
  .description("Explain a persisted model routing plan")
  .requiredOption("--work-order <id>", "Work Order id")
  .option("--json", "JSON output")
  .action((options: { workOrder: string; json?: boolean }) => { process.stdout.write(runModelsExplainCommand({ workOrderId: options.workOrder, json: options.json })); });
models
  .command("route")
  .description("Route a Work Order using the current global registry and runtime snapshot")
  .requiredOption("--work-order <id>", "Work Order id")
  .option("--json", "JSON output")
  .action((options: { workOrder: string; json?: boolean }) => { process.stdout.write(runModelsRouteCommand({ workOrderId: options.workOrder, json: options.json })); });
models
  .command("register")
  .description("Register safe JSON model profile data; never executes the input")
  .requiredOption("--file <path>", "safe JSON profile or profile array")
  .option("--json", "JSON output")
  .action((options: { file: string; json?: boolean }) => { process.stdout.write(runModelsRegisterCommand({ filePath: options.file, json: options.json })); });

const capabilities = program.command("capabilities").description("Runtime/host capability negotiation");
capabilities
  .command("status")
  .description("Show the persisted conservative runtime capability snapshot")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => { process.stdout.write(runCapabilitiesStatusCommand({ json: options.json })); });
capabilities
  .command("explain")
  .description("Explain effective runtime capability semantics")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => { process.stdout.write(runCapabilitiesExplainCommand({ json: options.json })); });

const adapters = program.command("adapters").description("Provider-neutral host adapters and dispatch preparation");
adapters
  .command("list")
  .description("List the fixed Cursor, Codex, and Generic Agent Skills adapters")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => { process.stdout.write(runAdaptersListCommand({ json: options.json })); });
adapters
  .command("detect")
  .description("Detect a host adapter without creating directories or files")
  .argument("[adapter]", "cursor | codex | generic-agent-skills")
  .option("--host-home <path>", "explicit host home override")
  .option("--json", "JSON output")
  .action((adapter: string | undefined, options: { hostHome?: string; json?: boolean }) => {
    process.stdout.write(runAdaptersDetectCommand({ adapter, hostHome: options.hostHome, json: options.json }));
  });
adapters
  .command("status")
  .description("Show compact adapter support, ownership, and prepared-bundle status")
  .argument("[adapter]", "cursor | codex | generic-agent-skills")
  .option("--host-home <path>", "explicit host home override")
  .option("--json", "JSON output")
  .action((adapter: string | undefined, options: { hostHome?: string; json?: boolean }) => {
    process.stdout.write(runAdaptersStatusCommand({ adapter, hostHome: options.hostHome, json: options.json }));
  });
adapters
  .command("explain")
  .description("Explain one adapter's fixed target and conservative capabilities")
  .argument("<adapter>", "cursor | codex | generic-agent-skills")
  .option("--host-home <path>", "explicit host home override")
  .option("--json", "JSON output")
  .action((adapter: string, options: { hostHome?: string; json?: boolean }) => {
    process.stdout.write(runAdaptersExplainCommand({ adapter, hostHome: options.hostHome, json: options.json }));
  });
adapters
  .command("install")
  .description("Install only UADS-owned resources in a global host location")
  .argument("<adapter>", "cursor | codex | generic-agent-skills")
  .option("--host-home <path>", "explicit host home override")
  .option("--json", "JSON output")
  .action((adapter: string, options: { hostHome?: string; json?: boolean }) => {
    process.stdout.write(runAdaptersInstallCommand({ adapter, hostHome: options.hostHome, json: options.json }));
  });
adapters
  .command("uninstall")
  .description("Remove only unchanged UADS-owned host resources")
  .argument("<adapter>", "cursor | codex | generic-agent-skills")
  .option("--host-home <path>", "explicit host home override")
  .option("--json", "JSON output")
  .action((adapter: string, options: { hostHome?: string; json?: boolean }) => {
    process.stdout.write(runAdaptersUninstallCommand({ adapter, hostHome: options.hostHome, json: options.json }));
  });
adapters
  .command("prepare")
  .description("Prepare an identity-bound host dispatch bundle without invoking a provider")
  .argument("<adapter>", "cursor | codex | generic-agent-skills")
  .option("--host-home <path>", "explicit host home override")
  .option("--json", "JSON output")
  .action((adapter: string, options: { hostHome?: string; json?: boolean }) => {
    process.stdout.write(runAdaptersPrepareCommand({ adapter, hostHome: options.hostHome, json: options.json }));
  });
adapters
  .command("handoff")
  .description("Accept a current identity-bound dispatch bundle for host-owned execution without invoking a provider")
  .argument("<adapter>", "cursor | codex | generic-agent-skills")
  .option("--host-home <path>", "explicit host home override")
  .option("--json", "JSON output")
  .action((adapter: string, options: { hostHome?: string; json?: boolean }) => {
    process.stdout.write(runAdaptersHandoffCommand({ adapter, hostHome: options.hostHome, json: options.json }));
  });
adapters
  .command("receipt")
  .description("Record one schema-defined host execution outcome for the current receipt")
  .argument("<adapter>", "cursor | codex | generic-agent-skills")
  .requiredOption("--state <state>", "ACCEPTED | STARTED | COMPLETED | FAILED | BLOCKED")
  .option("--reason-code <code>", "stable reason code; repeat for bounded additional codes", (value: string, previous: string[] = []) => [...previous, value], [])
  .option("--host-home <path>", "explicit host home override")
  .option("--json", "JSON output")
  .action((adapter: string, options: { state: string; reasonCode?: string[]; hostHome?: string; json?: boolean }) => {
    process.stdout.write(runAdaptersReceiptCommand({ adapter, state: options.state, reasonCodes: options.reasonCode, hostHome: options.hostHome, json: options.json }));
  });

program
  .command("verify")
  .description("Compute the current change digest and enforce execution scope boundaries")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => {
    process.stdout.write(runVerifyCommand({ json: options.json }));
  });

const specialists = program.command("specialists").description("Global-first specialist registry and deterministic routing");
specialists
  .command("list")
  .description("List registered specialist profiles without scanning the repository or contacting providers")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => { process.stdout.write(runSpecialistsListCommand({ json: options.json })); });
specialists
  .command("status")
  .description("Show specialist registry and current selection state")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => { process.stdout.write(runSpecialistsStatusCommand({ json: options.json })); });
specialists
  .command("explain")
  .description("Explain the persisted specialist selection and rejections")
  .option("--work-order <id>", "Work Order id")
  .option("--json", "JSON output")
  .action((options: { workOrder?: string; json?: boolean }) => { process.stdout.write(runSpecialistsExplainCommand({ workOrderId: options.workOrder, json: options.json })); });
specialists
  .command("select")
  .description("Recompute and persist the bounded specialist selection for a Work Order")
  .option("--work-order <id>", "Work Order id")
  .option("--json", "JSON output")
  .action((options: { workOrder?: string; json?: boolean }) => { process.stdout.write(runSpecialistsSelectCommand({ workOrderId: options.workOrder, json: options.json })); });

const evidence = program.command("evidence").description("Execution evidence ledger");
evidence
  .command("record")
  .description("Record gate evidence bound to the current change digest (does not execute the command)")
  .requiredOption("--gate <id>", "selected gate id")
  .requiredOption("--kind <kind>", "command | file | invariant | review")
  .requiredOption("--role <role>", "source role")
  .option("--command <text>", "command text for command evidence")
  .option("--exit-code <n>", "exit code for command evidence")
  .option("--output <path>", "sanitized output file to copy into the sidecar")
  .option("--file <relative-path>", "relative project file for file/invariant evidence")
  .requiredOption("--summary <text>", "concise evidence summary")
  .option("--status <status>", "PASS | FAIL | BLOCKED (derived from exit code for command evidence)")
  .option("--json", "JSON output")
  .action(
    (options: {
      gate: string;
      kind: string;
      role: string;
      command?: string;
      exitCode?: string;
      output?: string;
      file?: string;
      summary: string;
      status?: string;
      json?: boolean;
    }) => {
      process.stdout.write(
        runEvidenceRecordCommand({
          json: options.json,
          gateId: options.gate,
          kind: options.kind,
          role: options.role,
          command: options.command,
          exitCode: options.exitCode,
          output: options.output,
          file: options.file,
          summary: options.summary,
          status: options.status,
        }),
      );
    },
  );

const assurance = program.command("assurance").description("Independent review start/record (not review ZIP)");
assurance
  .command("start")
  .description("Start independent assurance review after selected non-review gates PASS")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => {
    process.stdout.write(runAssuranceStartCommand({ json: options.json }));
  });
assurance
  .command("record")
  .description("Record an independent review verdict bound to the current change digest")
  .requiredOption("--role <role>", "reviewer role")
  .requiredOption("--session <id>", "reviewer session id")
  .requiredOption("--implementer-session <id>", "implementer session id")
  .requiredOption("--verdict <verdict>", "APPROVED | CORRECTION_NEEDED | BLOCKED")
  .requiredOption("--summary <text>", "concise review summary")
  .option("--findings <json>", "JSON array of findings")
  .option("--findings-file <path>", "path to JSON findings array")
  .option("--json", "JSON output")
  .action(
    (options: {
      role: string;
      session: string;
      implementerSession: string;
      verdict: string;
      summary: string;
      findings?: string;
      findingsFile?: string;
      json?: boolean;
    }) => {
      process.stdout.write(
        runAssuranceRecordCommand({
          json: options.json,
          role: options.role,
          session: options.session,
          implementerSession: options.implementerSession,
          verdict: options.verdict,
          summary: options.summary,
          findings: options.findings,
          findingsFile: options.findingsFile,
        }),
      );
    },
  );

program
  .command("finalize")
  .description("Authoritative completion gate for the current execution run")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => {
    process.stdout.write(runFinalizeCommand({ json: options.json }));
  });

program
  .command("index")
  .description("Build or incrementally refresh repository intelligence in the sidecar")
  .option("--json", "JSON output")
  .option("--force", "force a full rebuild")
  .action((options: { json?: boolean; force?: boolean }) => {
    process.stdout.write(runIndexCommand({ json: options.json, force: options.force }));
  });

program
  .command("impact")
  .description("Produce an impact report for the active Work Order or supplied relative paths")
  .option("--json", "JSON output")
  .option("--path <relative>", "repository-relative path (repeatable)", (value: string, previous: string[]) => {
    previous.push(value);
    return previous;
  }, [])
  .option("--radius <radius>", "C0-C5 override")
  .action((options: { json?: boolean; path?: string[]; radius?: string }) => {
    process.stdout.write(
      runImpactCommand({
        json: options.json,
        paths: options.path,
        radius: options.radius,
      }),
    );
  });

const context = program.command("context").description("Controlled execution context radius and Context Packs");
context
  .command("pack")
  .description("Create or refresh the metadata-first Context Pack for the active Work Order")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => {
    process.stdout.write(runContextPackCommand({ json: options.json }));
  });
context
  .command("expand")
  .description("Expand context radius by one step (C5 remains exceptional)")
  .requiredOption("--reason <text>", "concise expansion reason")
  .option("--approve-c5", "explicitly approve exceptional C5 expansion")
  .option("--json", "JSON output")
  .action((options: { reason: string; approveC5?: boolean; json?: boolean }) => {
    process.stdout.write(
      runContextExpandCommand({
        json: options.json,
        reason: options.reason,
        approveC5: options.approveC5,
      }),
    );
  });

const failure = program.command("failure").description("Normalized failure records, diagnosis, and Failure Memory");
failure
  .command("record")
  .description("Normalize and persist a secret-safe failure record (does not copy the input file)")
  .requiredOption("--source <source>", "test | lint | typecheck | build | runtime | gate | manual-evidence")
  .option("--command <text>", "failing command identity")
  .option("--exit-code <n>", "process exit code")
  .requiredOption("--input <file>", "repo- or sidecar-safe file containing failure text")
  .option("--work-order <id>", "bound Work Order id")
  .option("--execution-run <id>", "bound execution run id")
  .option("--json", "JSON output")
  .action(
    (options: {
      source: string;
      command?: string;
      exitCode?: string;
      input: string;
      workOrder?: string;
      executionRun?: string;
      json?: boolean;
    }) => {
      process.stdout.write(
        runFailureRecordCommand({
          json: options.json,
          source: options.source,
          command: options.command,
          exitCode: options.exitCode,
          inputPath: options.input,
          workOrder: options.workOrder,
          executionRun: options.executionRun,
        }),
      );
    },
  );
failure
  .command("show")
  .description("Show a persisted failure record and latest diagnosis")
  .argument("<id>", "failure record id")
  .option("--json", "JSON output")
  .action((id: string, options: { json?: boolean }) => {
    process.stdout.write(runFailureShowCommand({ json: options.json, failureRecordId: id }));
  });
failure
  .command("resolve")
  .description("Mark verified correction only after the bound execution completes with a new change digest")
  .requiredOption("--failure <id>", "failure record id")
  .option("--json", "JSON output")
  .action((options: { failure: string; json?: boolean }) => {
    process.stdout.write(runFailureResolveCommand({ json: options.json, failureRecordId: options.failure }));
  });

program
  .command("diagnose")
  .description("Rank fault hypotheses and emit a diagnostic Context Pack for a failure record")
  .requiredOption("--failure <id>", "failure record id")
  .option("--json", "JSON output")
  .action((options: { failure: string; json?: boolean }) => {
    process.stdout.write(runDiagnoseCommand({ json: options.json, failureRecordId: options.failure }));
  });

program
  .command("failures")
  .description("List compact Failure Memory entries for this project")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => {
    process.stdout.write(runFailuresCommand({ json: options.json }));
  });

const cache = program.command("cache").description("Evidence cache status and explainable reuse decisions");
cache
  .command("status")
  .description("Show compact evidence-cache health without rescanning the repository")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => {
    process.stdout.write(runCacheStatusCommand({ json: options.json }));
  });
cache
  .command("explain")
  .description("Explain the current cache decision for a gate")
  .requiredOption("--gate <gate-id>", "gate id")
  .option("--json", "JSON output")
  .action((options: { gate: string; json?: boolean }) => {
    process.stdout.write(runCacheExplainCommand({ json: options.json, gateId: options.gate }));
  });

const cost = program.command("cost").description("Cost Governor and provider-neutral token economics");
cost
  .command("status")
  .description("Show compact token-budget and QPT status without rescanning the repository")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => {
    process.stdout.write(runCostStatusCommand({ json: options.json }));
  });

const dashboard = program.command("dashboard").description("Loopback-only M30 operator dashboard and objective event projection");
dashboard
  .command("start")
  .description("Start the local M30 dashboard on loopback")
  .option("--host <host>", "bind host (only 127.0.0.1 is accepted)", "127.0.0.1")
  .option("--port <port>", "listen port", "8765")
  .action(async (options: { host?: string; port?: string }) => {
    await runDashboardStartCommand({ host: options.host, port: Number(options.port) });
  });
dashboard
  .command("status")
  .description("Show the objective M30 dashboard snapshot")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => {
    process.stdout.write(runDashboardStatusCommand({ json: options.json }));
  });
dashboard
  .command("events")
  .description("Show bounded persisted M30 events")
  .option("--limit <n>", "maximum events to show", "50")
  .option("--json", "JSON output")
  .action((options: { limit?: string; json?: boolean }) => {
    process.stdout.write(runDashboardEventsCommand({ limit: Number(options.limit), json: options.json }));
  });

const observability = program.command("observability").description("Bounded M30 observability inspection aliases");
observability
  .command("status")
  .description("Show the objective M30 observability status")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => {
    process.stdout.write(runDashboardStatusCommand({ json: options.json }));
  });
observability
  .command("events")
  .description("Show bounded persisted operational events")
  .option("--limit <n>", "maximum events to show", "50")
  .option("--json", "JSON output")
  .action((options: { limit?: string; json?: boolean }) => {
    process.stdout.write(runDashboardEventsCommand({ limit: Number(options.limit), json: options.json }));
  });
cost
  .command("explain")
  .description("Explain the current Cost Governor decision")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => {
    process.stdout.write(runCostExplainCommand({ json: options.json }));
  });

program
  .command("status")
  .description("Show project identity plus latest orchestration and execution state")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => {
    process.stdout.write(runStatus(process.cwd(), { json: options.json }));
  });

program
  .command("resume")
  .description("Emit a compact resume packet from sidecar state without rescanning the repository")
  .option("--json", "JSON output")
  .action((options: { json?: boolean }) => {
    process.stdout.write(runResumeCommand({ json: options.json }));
  });

program
  .command("review")
  .description("Generate a review ZIP in the global sidecar workspace (outside the project)")
  .action(async () => {
    process.stdout.write(await runReview());
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`uads: ${message}\n`);
  process.exitCode = 1;
});
