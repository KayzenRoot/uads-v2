export const RELEASE_TITLE_BY_VERSION: Readonly<Record<string, string>> = Object.freeze({
  "0.7.0": "UADS v0.7.0 - GitHub Release Engineering",
  "0.7.1": "UADS v0.7.1 - Direct Review Evidence Hardening",
  "0.8.0": "UADS v0.8.0 - Model Routing",
  "0.8.1": "UADS v0.8.1 - Runtime Capability Ownership",
  "0.9.0": "UADS v0.9.0 - Specialist Routing",
  "0.9.1": "UADS v0.9.1 - Specialist Semantic Revalidation",
  "0.10.0": "UADS v0.10.0 - Runtime Adapters",
  "0.10.1": "UADS v0.10.1 - Runtime Adapter Hardening",
  "0.10.2": "UADS v0.10.2 - Adapter Root Identity Hardening",
  "0.10.3": "UADS v0.10.3 - Host Root Ownership Binding",
  "0.10.4": "UADS v0.10.4 - Filesystem-Safe Root Binding",
  "0.11.0": "UADS v0.11.0 - Assurance & Stabilization",
  "0.11.1": "UADS v0.11.1 - Release Security Proof",
});

const STALE_HARDCODED_TITLE = "UADS v0.10.0 - GitHub Release Engineering";

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function releaseTitle(version: string, changelog?: string): string {
  const mapped = RELEASE_TITLE_BY_VERSION[version];
  if (mapped) return mapped;
  if (!changelog) {
    throw new Error(`release title is not defined for version ${version}`);
  }
  const start = changelog.indexOf(`## [${version}]`);
  if (start < 0) {
    throw new Error(`release changelog section is missing for version ${version}`);
  }
  const next = changelog.indexOf("\n## [", start + 1);
  const section = changelog.slice(start, next < 0 ? changelog.length : next);
  const highlight = section.match(/### Highlights\s*\n\s*\n\s*-\s+(.+)/)?.[1]?.trim();
  if (!highlight) {
    throw new Error(`release title cannot be derived from changelog highlights for version ${version}`);
  }
  const summary = highlight.length > 72 ? `${highlight.slice(0, 69)}...` : highlight;
  const title = `UADS v${version} - ${summary}`;
  if (title.includes("GitHub Release Engineering") && version !== "0.7.0") {
    throw new Error("release title must not reuse the stale GitHub Release Engineering increment");
  }
  return title;
}

export function assertReleaseTitleIsCurrent(version: string, title: string): void {
  const expected = releaseTitle(version);
  if (title !== expected) {
    throw new Error(`release title mismatch for ${version}: expected "${expected}", got "${title}"`);
  }
  if (title === STALE_HARDCODED_TITLE) {
    throw new Error("release title is still hard-coded to GitHub Release Engineering");
  }
}
