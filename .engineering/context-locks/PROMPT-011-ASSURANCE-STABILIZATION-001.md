# Context Lock — `PROMPT-011-ASSURANCE-STABILIZATION-001`

State: `RELOCKED`
Repository: `KayzenRoot/uads`
Baseline Git SHA: `d5cb361274cb19f70c8bd02dd023b596b8babf13`
Generated at: `2026-09-05T00:00:00.000Z`

## Required fingerprints

| Source | Relative path or deterministic sentinel | SHA-256 |
| --- | --- | --- |
| Checkpoint | `.engineering/checkpoints/CHECKPOINT-DELTA-PROMPT-011-ASSURANCE-STABILIZATION-001.md` | `34503b30036f23a8346fc91daa27cc3497ccdc8e1fd725c7aeac4d61d047622d` |
| Decisions | `.engineering/DECISIONS.md` | `eacbe3d47b1295561d9673338d2580c305575286fb01a95859c975c2176e1e6a` |
| Scope | `.engineering/work-orders/PROMPT-011-ASSURANCE-STABILIZATION-001.md` | `229a374a169f1bd0d0c27b3435693d5f4e9ca3fd540bdb9962a0a88151506fc9` |
| Definition of Done | `docs/13-DEFINITION-OF-DONE.md` | `fb92a45e7a5233e82fc48d2e731b312ebfb4100394d76bcfaee6b99f90ff6c57` |
| Architecture | `docs/04-ARCHITECTURE.md` | `575e46f741a47a2227bf13e6dab21d882cde2a494a4aa7a4ec4385eb8dc61ca0` |
| Project overview | `README.md` | `fb3dcb8a051dc68b9fcd19f7a048c16205d90e326292017b40fc3d34d0aed8b3` |
| Governance | `GOVERNANCE.md` | `5c45d9f54aba5c08f8fa6e2f84eeee8ead92af34ccca582ccbc1dafd08c4bb68` |
| Quality gates | `docs/07-QUALITY-GATES.md` | `751d8dde295c5fc696516ffcfe2b0404048cfb6aa380189e1401141d6e6d97a6` |
| Executor rules | `.cursorrules` | `7c70f6d93d061f986ea1a0079faa6bf88c0d88504123807694526d7b2a87a711` |
| Delivery protocol | `.engineering/PROTOCOL.md` | `f1ccaf41ae75ba578ed0d548e0d601ed56fe30dd0eff9d7cef00028ec71a60cf` |
| Assurance policy | `src/kernel/assurance-policy.ts` | `3cd7adee881cc68aa800e9e1931595b45e62276857ce031f8fff51f3874daba6` |
| Execution seam | `src/kernel/execution.ts` | `1eb7df8f977df62d15aa5c0322525e4670cbbfcba4c06a2a38b5c7443735f6f0` |
| Direct Review seam | `src/github/direct-review.ts` | `bad48a05a2933582af78fe0d2d6d224f9615c0a0a372b5d0a99d6484b92b22fe` |
| Review packet schema | `schemas/review-packet.schema.json` | `c109d6da98d537375635463acc9112071b20d15f33b39298af1341773a0e81f0` |
| Compatibility schema | `schemas/compatibility-evidence.schema.json` | `23511445a029266c92abe4d9c9455f2f8a155d3572afde1235404ccfe78f792d` |
| Compatibility workflow | `.github/workflows/compatibility.yml` | `41fdd64b75526a6ac09f708457dee3c177dc99cf50e60530cea5d9593fba825a` |
| Assurance eval | `src/eval/assurance.ts` | `1229811d750b70bcd322808cc679a74fc19de5c60d27513a5ab24a9e9be6a522` |
| Fault-injection eval | `src/eval/fault-injection.ts` | `c45b94a5a57617f78d9ff81e03ca71e9c717aa9d203325672e9a744783eea3f7` |
| Evidence Bundle | `.engineering/reports/EVIDENCE-BUNDLE-PROMPT-011-ASSURANCE-STABILIZATION-001.md` | `b96336346d22c7126fb7dfef831c3c8db7dfe9390bc69d6c94692bb1a84dd5be` |

Correction 04 adds these critical locked sources; their final fingerprints are recomputed after the complete correction edit set:

| Security proof seam | `src/github/security-proof.ts` | `fdadc0a2df2682909f8d273ae1275ec9a282d788c198254c53b15272c8bc64fd` |
| Security proof runtime | `scripts/github/security-proof.mjs` | `6a7e86a35a0d07978cdf14bbb84ff5be9a23d4ad7b6f00bf6de98efba821795a` |
| Direct Review publisher | `scripts/github/publish-direct-review-evidence.mjs` | `9686891300a9d5b4aff9804918836b25cd36bb65130ad49ced401bc0b6446e20` |
| Direct Review workflow | `.github/workflows/direct-review.yml` | `362ca67d64a6b51a854ca515906fc0a7634ea93549b4291766dee08855537047` |
| CI-to-Direct Review seam | `scripts/github/ci-gate-receipt-runtime.mjs` | `cf590100bf2f23e91c011bb64b16dd551c0a1389ee43a65e8aef9dcf7b0f2677` |
| Review index seam | `src/github/review-index.ts` | `91845238b3377e04f393ed597fa7411a915ff4a7c56a35526403129fd1c374a3` |
| Direct Review schema | `schemas/github-direct-review-evidence.schema.json` | `9cf9b96824618746e640c222bfcbcd5d39441e3ae8e29ad07196f10ad1824d31` |
| Review index schema | `schemas/github-review-index.schema.json` | `a128ff47f6fe01b35ee61b61c03637a8c60d2a01794c640ed9494cec47638be6` |
| Release verify barrier | `scripts/release/verify-release.mjs` | `38dc02721b40641ae7b7023b821daff37180390583ee84ea6266e17a7f2caeb6` |
| Release build barrier | `scripts/release/build-release.mjs` | `c153c5d12224dd121f1805b74bca29577e6d0a64aed2a89abdcd5676cec6d5c` |
| Release publish barrier | `scripts/release/publish-release.mjs` | `a9b6fd1bfc3d9e2fe999bec343708a10a41cfb9f6c8235000ac77b83775e35a0` |
| Release workflow | `.github/workflows/release.yml` | `6b7fd7ee619fab770490d5cfc37c23be0ab6871c35e764498babad5127fc6986` |
| RG regression tests | `tests/release-security-proof.test.ts` | `f1f6631d325ef65c9e63a1527f5ba831c61e7f9f37324879ebc3b30aa2e6611a` |
| Security documentation | `docs/08-SECURITY.md`, `docs/15-GITHUB-DIRECT-REVIEW.md`, `RELEASING.md`, `schemas/README.md` | `0db8edca0c855228417daddd4a01f0297a96030f413755cb03ca714c359b83db`, `b1ad788b13600b41ef82a5ea3b3cb232e712a5d1c12fd942f5de326f388f31bc`, `7240e3030205b43ec9247aad0758af52f06bb0359997fbb060cd81928db16131`, `29e5c05482bd07768d250e33d050f98831d2f20711ba1973256af57d3c214a98` |

## Stale events

Record every critical source change after the lock. Do not continue silently.

- Source: Prompt 011 implementation, schemas, evals, workflows, release metadata, and documentation
- Reason: critical sources changed after the initial `FRESH` lock was created
- Action: stopped the initial flow, re-inspected the changed source set, recomputed SHA-256 fingerprints, and relocked before final validation
- Source: Prompt 011 correction implementation and evidence records
- Reason: C1-C4 correction blockers changed assurance authority, normative FI coverage, compatibility artifact identity, findings-file safety, and their documentation
- Action: committed implementation at `12b70f9d0fc54bce87dcfe31fc3b4cae59b09a56`, fixed the Windows tree-proof shell portability at `3e06aa9d1fdcdee371b1d4cca41222d052072d5f`, recorded hosted correction evidence at `4061946f301ff5b7ce5d3f0ddc231ab1a87cce09`, and relocked before final evidence validation
- Source: Prompt 011 Correction 04 release security proof implementation and release metadata
- Reason: corrected-release authorization previously treated CodeQL, Scorecard, and Dependency Review as informative status only; Prompt 011 records also lacked successful v0.11.0 promotion and current exact baseline identity
- Action: preserve the historical pre-promotion records, record v0.11.0 promotion at `d5cb361274cb19f70c8bd02dd023b596b8babf13`, add typed proof/reconstruction barriers and RG1-RG14, and relock all changed fingerprints before push/review
- Source: Prompt 011 Correction 05 security-proof event/ref binding, exact merged-PR/run binding, ambiguity semantics, readiness handling, and evidence records
- Reason: independent review identified non-push Scorecard acceptance, cross-PR Dependency Review reuse, silent latest-run selection, post-main Scorecard timing race, and stale identity wording
- Action: implement and test the correction at source commit `a23903d0f8f137121eab7a1d631b294eba8e5946`, update canonical security/releasing records, record the final pre-record hosted review matrix separately, and relock changed fingerprints after the evidence-record refresh

## Relock evidence

- Re-inspection commands: `git status --short`, `git diff --check`, targeted `rg` review, `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, `npm run test:security-proof`, all legacy/new evals, AS1-AS22, normative FI1-FI16 plus legacy FI17-FI32, CLI smoke, `npm ci`, `npm audit --audit-level=high`, `npm pack --dry-run`, and the engineering/skills/actions/Direct Review/CI receipt validators. Correction 05 adds RG15-RG22 and bounded readiness tests; final hosted checks remain an external post-push gate.
- New lock or reason blocked: `RELOCKED`; corrected source, schemas, Direct Review workflow/publisher, security/releasing documentation, tests, and Prompt 011 records match the fingerprints above. The final pre-record hosted checks are green; independent maintainer review and post-merge evidence remain external gates.
