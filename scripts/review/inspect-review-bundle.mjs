#!/usr/bin/env node
import { inspectReviewBundle } from "../../dist/lib/inspect-review.js";

const zipPath = process.argv[2];
if (!zipPath) {
  process.stderr.write("usage: node scripts/review/inspect-review-bundle.mjs <zip>\n");
  process.exit(1);
}

const result = await inspectReviewBundle(zipPath, {
  requireEvidence: true,
  requireGitHead: true,
  requireCleanTree: true,
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(result.ok ? 0 : 1);
