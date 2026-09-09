# 12 — Review bundle

## Purpose

Produce an **external-audit** ZIP of a project snapshot without secrets, heavy artifacts, or host-identifying paths.

## How to generate

Capture gates into the sidecar, then package:

```bash
node scripts/validate/capture-evidence.mjs
uads review
# or
node scripts/review/create-review-bundle.mjs
node scripts/review/inspect-review-bundle.mjs <zip>
```

Output (outside the project):

```
~/.uads/workspaces/<project-id>/reviews/uads-review-<project-id>-<timestamp>.zip
~/.uads/workspaces/<project-id>/reviews/uads-review-<project-id>-<timestamp>.zip.sha256
```

Validation evidence is stored in the sidecar (`.../evidence/`), never in git.

## ZIP contents

- `review-manifest.json` (privacy-minimized; see `schemas/review-manifest.schema.json`)
- `repository-tree.txt`
- `git-status.txt`, `git-diff.txt`, `git-log.txt`
- `version.txt`, `README.txt`
- `evidence/validation-summary.json` and per-command outputs
- `github/` and `release/` — optional canonical release evidence for an external release audit; generated from the global sidecar and never from repository-root staging directories
- `orchestration/` — sanitized checkpoint/Work Order/routing/execution/evidence/review snapshot when present
- `host-dispatch/current.json` and `adapters/<adapter>/state.json` — sanitized Host Dispatch Bundle and adapter ownership/capability summaries when present
- `intelligence/` — sanitized index-state and current Context Pack metadata when present
- `failures/` — sanitized failure/diagnosis/memory summaries when present (no raw `--input` logs)
- `cache/cache-summary.json` and `cost/cost-summary.json` — counts, eligibility, budget/QPT summary (no raw cache output)
- `project/` — included source/docs/configs after sanitization

The shareable manifest uses `repositoryName`, `projectId`, and `sidecar://workspaces/<project-id>`. It does not include absolute `repoRoot` or sidecar filesystem paths.

## Secret handling (defense-in-depth)

Filename exclusion is not enough. Before any text is archived, UADS:

- strips credential userinfo from Git remotes
- redacts high-confidence secret signatures (private keys, common token formats)
- redacts absolute host paths (Windows drives, UNC, Unix homes)
- omits a file when it cannot be sanitized, recording a non-sensitive skip reason

Ordinary TypeScript/Markdown/test files are not excluded merely because their names contain words such as `secret`, `token`, `password`, or `credential`. Those files are packed after content sanitization. Data files such as `.env`, `secrets.json`, `credentials.json`, and private keys remain excluded.

Manifest accounting distinguishes:

- `includedFiles` — packed under `project/`
- `skipped` — omitted files with a safe reason
- `excludedDirectoryClasses` — directory names skipped during traversal (`node_modules/`, `.git/`, …)

This is not a guarantee of complete secret detection.

## Must exclude

- `.env*`, private keys, tokens, credential filenames
- `node_modules/`, `.git/`, `dist/`, coverage, caches
- `memory-bank/` (session state)
- review output directories
- absolute local paths in the shareable manifest

Host adapter review data contains only fixed adapter IDs, status, relative
resource names, content hashes, capability provenance, dispatch references,
and identity digests. It excludes raw host homes, environment values,
credentials, complete prompts, and arbitrary commands.

## Checksum and inspection

The generator writes a candidate ZIP that already contains `inspection.ok: true`, reopens **that** file, and requires the inspector to PASS. SHA-256 is computed only after that PASS. If inspection fails, `uads review` fails and does not report a successful artifact.

The inspector independently checks:

- required root and evidence entries
- excluded directory/file classes are absent
- no absolute host path remains
- no unredacted high-confidence secret signature remains
- `review-manifest.json` is valid JSON and conforms to `schemas/review-manifest.schema.json` (Ajv)
- `includedFiles` / `evidenceIncluded` match ZIP entries
- when release evidence is required, `reviewEvidenceIncluded` matches the canonical `github/` and `release/` entries and all release identities resolve to one commit
- no `../`, absolute, or drive-prefixed ZIP entry names
- duplicate ZIP entry names are rejected
