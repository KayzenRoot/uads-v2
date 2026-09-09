export type ReleaseArtifact = {
  name: string;
  size: number;
  sha256: string;
};

export type ReleaseManifest = {
  schema: "uads.release-manifest";
  schemaVersion: "0.7.0" | "0.7.1" | "0.8.0" | "0.8.1" | "0.9.0" | "0.9.1" | "0.10.0" | "0.11.0" | "0.11.1";
  version: string;
  tag: string;
  commit: string;
  generatedAt: string;
  artifacts: ReleaseArtifact[];
  validationReport: string;
  ciBinding: string | null;
};

const SHA256_RE = /^[0-9a-f]{64}$/i;
const SECRET_RE = /(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}|-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY-----)/;
const ABSOLUTE_PATH_RE = /(?<![A-Za-z])[A-Za-z]:[\\/]|\\\\|(?:^|[\s"'=])\/(?:Users|home)\//;

export function sortArtifacts(artifacts: readonly ReleaseArtifact[]): ReleaseArtifact[] {
  return [...artifacts]
    .map((artifact) => ({ ...artifact }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function checksumFile(artifacts: readonly ReleaseArtifact[]): string {
  return `${sortArtifacts(artifacts).map((artifact) => `${artifact.sha256}  ${artifact.name}`).join("\n")}\n`;
}

export function createReleaseManifest(input: Omit<ReleaseManifest, "schema" | "schemaVersion" | "artifacts"> & { artifacts: readonly ReleaseArtifact[]; schemaVersion?: ReleaseManifest["schemaVersion"] }): ReleaseManifest {
  const artifacts = sortArtifacts(input.artifacts);
  for (const artifact of artifacts) {
    if (!artifact.name || artifact.name.includes("\\") || artifact.name.startsWith("/") || /^[A-Za-z]:/.test(artifact.name)) {
      throw new Error(`unsafe release artifact name: ${artifact.name}`);
    }
    if (!Number.isSafeInteger(artifact.size) || artifact.size <= 0 || !SHA256_RE.test(artifact.sha256)) {
      throw new Error(`invalid release artifact metadata: ${artifact.name}`);
    }
  }
  const manifest: ReleaseManifest = {
    schema: "uads.release-manifest",
    schemaVersion: input.schemaVersion ?? "0.7.0",
    version: input.version,
    tag: input.tag,
    commit: input.commit,
    generatedAt: input.generatedAt,
    artifacts,
    validationReport: input.validationReport,
    ciBinding: input.ciBinding,
  };
  assertReleaseTextSafe(JSON.stringify(manifest));
  return manifest;
}

export function assertReleaseTextSafe(text: string): void {
  if (SECRET_RE.test(text)) {
    throw new Error("release output contains a credential-like secret");
  }
  if (ABSOLUTE_PATH_RE.test(text)) {
    throw new Error("release output contains an absolute host path");
  }
}
