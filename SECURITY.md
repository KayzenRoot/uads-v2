# Security Policy

UADS is maintained by **NexLabs**.

## Supported versions

UADS is pre-1.0. The `main` branch and the latest `0.7.x` release line receive security fixes. Older pre-1.0 release lines are historical snapshots; fixes may be backported when practical, but users should upgrade to the latest release.

## Reporting a vulnerability

Do **not** open a public issue for exploitable vulnerabilities.

1. Use [GitHub Private Vulnerability Reporting](https://github.com/KayzenRoot/uads/security/advisories/new) when available, or privately contact the NexLabs maintainers through the repository.
2. Include reproduction notes, affected version, and impact
3. Do not attach secrets, private keys, or production credentials

Maintainers acknowledge reports when practicable, review the reproduction and impact, coordinate a fix, and publish a release note when disclosure is appropriate. No fixed response-time SLA is promised.

Security scope includes orchestration and execution controls, cache and evidence integrity, local sidecars, adapters and installers, GitHub automation, release artifacts, and the software supply chain. Do not open a public issue for an exploitable vulnerability.

## Review bundles

`uads review` must never include `.env*` files, private keys, tokens, or credential dumps. Git remotes are stripped of userinfo. High-confidence secret signatures and absolute host paths in source, diffs, and evidence are redacted. Ordinary source files are not omitted merely because their names mention secrets. Filename exclusion alone is not sufficient. The delivered ZIP is inspected after its final write. If you find a packing or redaction bypass, report it as a vulnerability.

Content scanning is defense-in-depth, not a guarantee of complete secret detection.

## Installer safety

Install scripts skip existing destination files unless `--force` / `-Force` is passed. Report overwrite or path-traversal issues privately.
