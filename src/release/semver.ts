export type ReleaseValidationInput = {
  version: string;
  packageVersion: string | null;
  versionFile: string | null;
  lockfileVersion: string | null;
  changelog: string;
  branch?: string | null;
  currentSha?: string | null;
  originMainSha?: string | null;
  tagSha?: string | null;
  historical?: boolean;
};

export type HistoricalRelease = {
  version: string;
  commit: string;
  title: string;
  retrospective: true;
};

export const HISTORICAL_RELEASES: readonly HistoricalRelease[] = Object.freeze([
  {
    version: "0.1.0",
    commit: "fed4a41fa606d2c20f045c49872c4a4a384ba341",
    title: "UADS v0.1.0 - Foundation",
    retrospective: true,
  },
  {
    version: "0.2.0",
    commit: "8a920a22f28e7317883776bb397060deaf5306d8",
    title: "UADS v0.2.0 - Orchestrator Kernel",
    retrospective: true,
  },
  {
    version: "0.3.0",
    commit: "ccd24218c1ffa2693f9e3d2d5dfe797738961ac0",
    title: "UADS v0.3.0 - Bounded Execution Engine",
    retrospective: true,
  },
  {
    version: "0.4.0",
    commit: "de0842435890517c02f5c1171cacd1fec3e845d7",
    title: "UADS v0.4.0 - Context Intelligence",
    retrospective: true,
  },
  {
    version: "0.5.0",
    commit: "9b1012c11c135c2eaa8b191d0526e796a0c6bcda",
    title: "UADS v0.5.0 - Fault Localization & Failure Memory",
    retrospective: true,
  },
  {
    version: "0.6.0",
    commit: "9433ca04d3db41411d313959f140a707459bae74",
    title: "UADS v0.6.0 - Evidence Cache & Cost Governor",
    retrospective: true,
  },
]);

/**
 * Canonical commit targets for every published tag known to the release
 * reviewer. This map is data-driven so new reviews never need a one-off tag
 * comparison branch.
 */
export const IMMUTABLE_TAG_TARGETS: Readonly<Record<string, string>> = Object.freeze({
  "v0.1.0": "fed4a41fa606d2c20f045c49872c4a4a384ba341",
  "v0.2.0": "8a920a22f28e7317883776bb397060deaf5306d8",
  "v0.3.0": "ccd24218c1ffa2693f9e3d2d5dfe797738961ac0",
  "v0.4.0": "de0842435890517c02f5c1171cacd1fec3e845d7",
  "v0.5.0": "9b1012c11c135c2eaa8b191d0526e796a0c6bcda",
  "v0.6.0": "9433ca04d3db41411d313959f140a707459bae74",
  "v0.7.0": "bdfec142ee0b94593a6d0372fb1eb95409ef391d",
  "v0.7.1": "f6d36261545bb70ac9b566bef6313b31f2c22e6d",
  "v0.8.0": "54506705573bed5453a3f441d707f384da8c28f7",
  "v0.9.0": "8f697f09c16c0bcea7ee5007a813b96421d0f054",
  "v0.9.1": "f3061091a801ab98325e1dcfe70beaa123b0fc17",
  "v0.10.0": "86f7f1767f40ecfee3afd49aadef4f4e63b51fda",
  "v0.10.1": "6210ed235f0e0c0742fbba15e6a909b3d7bed8f0",
  "v0.10.2": "3aa81ac53f9c6b3b31dcb216e2eb8210d3fb3d21",
  "v0.10.3": "f0ab15e0b00834f3ca2f0ed3d72f193d579741b0",
  "v0.10.4": "0936f818ba8dc938b1b2ad41ffab0450c8fb30eb",
});

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function isValidSemVer(version: string): boolean {
  return SEMVER_RE.test(version.trim());
}

export function releaseTag(version: string): string {
  return `v${version}`;
}

export function validateReleaseMetadata(input: ReleaseValidationInput): string[] {
  const errors: string[] = [];
  const version = input.version.trim();

  if (!isValidSemVer(version)) {
    errors.push("invalid-semver");
  }
  if (input.packageVersion !== version) {
    errors.push("package-version-mismatch");
  }
  if (input.versionFile?.trim() !== version) {
    errors.push("VERSION-mismatch");
  }
  if (input.lockfileVersion !== version) {
    errors.push("lockfile-version-mismatch");
  }
  if (!new RegExp(`^## \\[${escapeRegExp(version)}\\]`, "m").test(input.changelog)) {
    errors.push("changelog-version-missing");
  }
  if (!input.historical && input.branch !== "main") {
    errors.push("release-branch-must-be-main");
  }
  if (!input.historical && input.currentSha && input.originMainSha && input.currentSha !== input.originMainSha) {
    errors.push("current-commit-not-on-origin-main");
  }
  if (input.tagSha && input.currentSha && input.tagSha !== input.currentSha) {
    errors.push("release-tag-conflict");
  }
  return errors;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
