export type CiBinding = {
  schema: "uads.ci-binding";
  schemaVersion: "0.7.1";
  repository: string;
  workflow: "CI";
  runId: number;
  headSha: string;
  event: string;
  status: "completed";
  conclusion: "success";
  htmlUrl: string;
  createdAt?: string;
  updatedAt?: string;
};

const SHA_RE = /^[0-9a-f]{40}$/i;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const RUN_URL_RE = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[0-9]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T/;

export function createCiBinding(input: unknown, expectedSha: string, repository: string): CiBinding {
  if (!SHA_RE.test(expectedSha)) {
    throw new Error("CI binding expected SHA is invalid");
  }
  if (!REPOSITORY_RE.test(repository)) {
    throw new Error("CI binding repository is invalid");
  }

  const runs = extractRuns(input);
  const matches = runs.filter((run) => {
    const name = stringValue(run.name);
    const headSha = stringValue(run.headSha ?? run.head_sha);
    return (
      name === "CI" &&
      headSha === expectedSha &&
      run.status === "completed" &&
      run.conclusion === "success"
    );
  });
  if (matches.length !== 1) {
    throw new Error(`CI binding requires exactly one successful CI run for ${expectedSha}; found ${matches.length}`);
  }

  const run = matches[0];
  if (!run) {
    throw new Error("CI binding run is missing");
  }
  const runId = Number(run.databaseId ?? run.id);
  const htmlUrl = stringValue(run.url ?? run.htmlUrl ?? run.html_url);
  if (!Number.isSafeInteger(runId) || runId <= 0 || !RUN_URL_RE.test(htmlUrl)) {
    throw new Error("CI binding run identity is invalid");
  }

  const binding: CiBinding = {
    schema: "uads.ci-binding",
    schemaVersion: "0.7.1",
    repository,
    workflow: "CI",
    runId,
    headSha: expectedSha,
    event: stringValue(run.event) || "push",
    status: "completed",
    conclusion: "success",
    htmlUrl,
  };

  for (const field of ["createdAt", "updatedAt"] as const) {
    const value = stringValue(run[field] ?? run[field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)]);
    if (value) {
      if (!ISO_DATE_RE.test(value)) {
        throw new Error(`CI binding ${field} is not a timestamp`);
      }
      binding[field] = value;
    }
  }

  assertCiBinding(binding, expectedSha, repository);
  return binding;
}

export function assertCiBinding(value: unknown, expectedSha?: string, expectedRepository?: string): asserts value is CiBinding {
  if (!value || typeof value !== "object") {
    throw new Error("CI binding is not an object");
  }
  const binding = value as Partial<CiBinding>;
  const runId = binding.runId;
  if (
    binding.schema !== "uads.ci-binding" ||
    binding.schemaVersion !== "0.7.1" ||
    binding.workflow !== "CI" ||
    binding.status !== "completed" ||
    binding.conclusion !== "success" ||
    typeof binding.repository !== "string" ||
    !REPOSITORY_RE.test(binding.repository) ||
    !Number.isSafeInteger(runId) ||
    runId === undefined ||
    runId <= 0 ||
    typeof binding.headSha !== "string" ||
    !SHA_RE.test(binding.headSha) ||
    typeof binding.event !== "string" ||
    typeof binding.htmlUrl !== "string" ||
    !RUN_URL_RE.test(binding.htmlUrl)
  ) {
    throw new Error("CI binding schema or identity is invalid");
  }
  if (expectedSha && binding.headSha !== expectedSha) {
    throw new Error("CI binding head SHA mismatch");
  }
  if (expectedRepository && binding.repository !== expectedRepository) {
    throw new Error("CI binding repository mismatch");
  }
  for (const field of ["createdAt", "updatedAt"] as const) {
    const value = binding[field];
    if (value !== undefined && (typeof value !== "string" || !ISO_DATE_RE.test(value))) {
      throw new Error(`CI binding ${field} is invalid`);
    }
  }
}

export function isCanonicalCiBindingReference(value: unknown): value is "ci-binding.json" {
  return value === "ci-binding.json";
}

function extractRuns(input: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(input)) {
    return input.filter(isRecord);
  }
  if (!isRecord(input)) {
    return [];
  }
  for (const key of ["runs", "workflow_runs"]) {
    const value = input[key];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }
  return [input];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
