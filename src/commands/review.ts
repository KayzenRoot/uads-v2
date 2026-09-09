import path from "node:path";
import { createReviewBundle, ReviewInspectionError } from "../lib/review-bundle.js";
import { hostPathVariants } from "../lib/secrets.js";

export async function runReview(cwd: string = process.cwd()): Promise<string> {
  try {
    const result = await createReviewBundle({
      cwd,
      requireEvidence: true,
      requireGitHead: true,
      forbiddenSubstrings: hostPathVariants(path.resolve(cwd)),
    });
    return [
      "UADS review bundle generated.",
      `zip: ${result.zipPath}`,
      `sha256: ${result.sha256}`,
      `checksum: ${result.checksumPath}`,
      `projectId: ${result.manifest.projectId}`,
      `filesIncluded: ${result.manifest.includedFiles.length}`,
      `filesSkipped: ${result.manifest.skipped.length}`,
      `evidenceIncluded: ${result.manifest.evidenceIncluded.length}`,
      `inspection: PASS`,
      "",
    ].join("\n");
  } catch (error) {
    if (error instanceof ReviewInspectionError) {
      const lines = [
        "UADS review bundle inspection failed.",
        `inspection: FAIL`,
        `inspectionErrors: ${error.inspection.errors.join(", ")}`,
        "",
      ];
      throw new Error(`${lines.join("\n")}${error.message}`);
    }
    throw error;
  }
}
