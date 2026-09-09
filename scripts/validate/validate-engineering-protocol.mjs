#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const engineering = path.join(root, ".engineering");
const identity = "ENG-PROTOCOL-ADOPTION-001";
const required = [
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
  `.engineering/work-orders/${identity}.md`,
  `.engineering/context-locks/${identity}.md`,
  `.engineering/baselines/${identity}.md`,
  `.engineering/reports/CLEANUP-INVENTORY.md`,
  `.engineering/reports/EVIDENCE-BUNDLE-${identity}.md`,
  `.engineering/checkpoints/CHECKPOINT-DELTA-${identity}.md`,
  ".github/ISSUE_TEMPLATE/implementation.yml",
  "scripts/validate/validate-engineering-protocol.mjs",
];

const errors = [];
for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) errors.push(`missing ${relative}`);
}

const schemaFiles = [
  ".engineering/schemas/engineering-work-order.schema.json",
  ".engineering/schemas/context-lock.schema.json",
  ".engineering/schemas/evidence-bundle.schema.json",
  ".engineering/schemas/correction-delta.schema.json",
  ".engineering/schemas/checkpoint-delta.schema.json",
  ".engineering/schemas/report.schema.json",
];
for (const relative of schemaFiles) {
  if (!fs.existsSync(path.join(root, relative))) continue;
  try {
    const schema = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
    if (schema.type !== "object" || typeof schema.$id !== "string" || !schema.$id.includes("uads.dev/schemas/")) {
      errors.push(`invalid protocol schema contract ${relative}`);
    }
  } catch (error) {
    errors.push(`invalid JSON in ${relative}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const recordFiles = [
  `.engineering/work-orders/${identity}.md`,
  `.engineering/context-locks/${identity}.md`,
  `.engineering/baselines/${identity}.md`,
  `.engineering/reports/CLEANUP-INVENTORY.md`,
  `.engineering/reports/EVIDENCE-BUNDLE-${identity}.md`,
  `.engineering/checkpoints/CHECKPOINT-DELTA-${identity}.md`,
];
const secretPattern = /(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}|-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY-----)/;
const hostPathPattern = /(?:[A-Za-z]:\\|(?:^|[^\w])\/Users\/|(?:^|[^\w])\/home\/)/;
for (const relative of recordFiles) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(identity)) errors.push(`record is not bound to ${identity}: ${relative}`);
  if (secretPattern.test(text)) errors.push(`credential-like value in protocol record: ${relative}`);
  if (hostPathPattern.test(text)) errors.push(`absolute host path in protocol record: ${relative}`);
}

const protocol = fs.existsSync(path.join(engineering, "PROTOCOL.md")) ? fs.readFileSync(path.join(engineering, "PROTOCOL.md"), "utf8") : "";
for (const requiredTerm of ["baseline", "Context Lock", "Evidence Bundle", "Checkpoint Delta", "STOP", "VERIFIED_DEAD", "zero-project-footprint"]) {
  if (!protocol.toLowerCase().includes(requiredTerm.toLowerCase())) errors.push(`protocol missing required term: ${requiredTerm}`);
}

const pullRequestTemplate = path.join(root, ".github/pull_request_template.md");
if (fs.existsSync(pullRequestTemplate)) {
  const text = fs.readFileSync(pullRequestTemplate, "utf8");
  for (const term of ["Work Order", "Context Lock", "Evidence Bundle", "Baseline", "Cleanup inventory"]) {
    if (!text.toLowerCase().includes(term.toLowerCase())) errors.push(`PR template missing protocol field: ${term}`);
  }
}

if (errors.length > 0) {
  process.stderr.write(`${errors.map((error) => `- ${error}`).join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(JSON.stringify({ ok: true, identity, requiredFiles: required.length, schemas: schemaFiles.length, records: recordFiles.length }) + "\n");
