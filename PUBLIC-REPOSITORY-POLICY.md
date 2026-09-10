# UADS V2 Public Repository Policy

Status: PREPARED FOR PUBLIC VISIBILITY
Owner: NexLabs
Applies to: `KayzenRoot/uads-v2`

## Purpose

This repository may be made publicly visible to support transparent development, reproducible CI, security review, interoperability review, and community inspection while preserving NexLabs ownership of UADS V2.

Public visibility is not an open-source grant. The controlling terms are in `LICENSE` and `NOTICE`.

## Intellectual-property posture

- UADS V2 is proprietary and source-visible.
- All rights not expressly granted are reserved by NexLabs.
- GitHub platform rights required to view and fork a public repository remain governed by GitHub's Terms of Service.
- No separate right is granted to commercialize, redistribute, sublicense, host, mirror, or create derivative products from UADS V2.
- Third-party components remain governed by their own licenses.
- Historical materials may retain licenses that validly applied to copies distributed before the UADS V2 proprietary license took effect.

## Secret and exposure policy

The repository must not contain production credentials or private host data. At minimum, the following are prohibited from tracked content:

- `.env` and environment files other than sanitized examples;
- private keys and signing material;
- access tokens, API keys, passwords, bearer credentials, client secrets, and credential stores;
- private certificate bundles;
- raw authentication dumps;
- personal absolute host paths when they expose private host identity;
- review artifacts that contain secrets or unredacted credentials.

The repository `.gitignore`, UADS review-bundle sanitizer, and security documentation provide defense in depth, but they do not replace secret scanning and review.

## Pre-publication audit recorded for 2026-09-09

The connected GitHub repository was inspected before the visibility transition.

Observed:

- repository remained PRIVATE during preparation;
- connected account had repository admin access;
- current-tree searches for common token, password, private-key, API-key, bearer-token, AWS-key, GitHub-token, client-secret, private-path, and personal-email patterns returned no evident committed credential;
- `.env.example` contained only a commented `UADS_HOME` placeholder and no credential value;
- `.gitignore` excludes `.env`, key/certificate formats, credential files, secret files, local UADS state, logs, and generated review archives;
- existing security guidance explicitly excludes secret material from review bundles;
- Apache-2.0/open-source declarations were identified and replaced in current V2 root licensing surfaces;
- no claim is made that a text-pattern audit proves the entire Git history never contained a secret. If GitHub secret scanning later reports a historical credential, treat it as compromised, rotate/revoke it, and remediate history where appropriate.

## Visibility transition gate

Before changing `Private` to `Public`, all of the following must be true:

1. The proprietary `LICENSE` is on `main`.
2. `README.md`, `NOTICE`, `package.json`, and `CONTRIBUTING.md` agree with the proprietary/source-visible posture.
3. The public-preparation PR is reviewed and merged.
4. No blocking secret or personal-data finding remains open.
5. Current CI/governance state is reconciled after the licensing merge.

Only then should the repository owner change visibility to Public in GitHub Settings.

## Immediately after the switch

- verify the repository reports `visibility: public`;
- verify standard GitHub-hosted Actions execute under public-repository billing rules;
- re-check CodeQL, Dependency Review, OpenSSF Scorecard, Linux, Windows, and Foundation workflows;
- inspect branch/ruleset behavior because visibility changes can affect repository governance features;
- confirm no secret-scanning or push-protection alert appears;
- keep the proprietary license badge and notices visible on the repository landing page.

## Fork and copying reality

A public GitHub repository can be viewed and forked using GitHub functionality. Licensing creates legal restrictions; it is not a technical copy-prevention system. Once content has been publicly exposed, external copies may continue to exist even if the original repository later becomes private.

## Future licensing

Commercial, partner, research, hosted-service, redistribution, or integration rights may be granted only by a separate written NexLabs agreement. If UADS V2 later adopts a different licensing strategy, that change must be explicit, versioned, reviewed, and recorded in repository governance.
