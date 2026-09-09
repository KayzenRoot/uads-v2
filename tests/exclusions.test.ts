import { describe, expect, it } from "vitest";
import {
  isOrdinaryReviewableSource,
  isSecretFileName,
  isUnsafeZipEntryName,
  shouldExcludeFromReview,
} from "../src/lib/exclusions.js";

describe("secret and heavy-path exclusion", () => {
  it("excludes environment files, keys, and credential names", () => {
    expect(shouldExcludeFromReview(".env")).toBe(true);
    expect(shouldExcludeFromReview(".env.local")).toBe(true);
    expect(shouldExcludeFromReview("config/secrets.json")).toBe(true);
    expect(shouldExcludeFromReview("id_rsa")).toBe(true);
    expect(shouldExcludeFromReview("certs/service.key")).toBe(true);
    expect(shouldExcludeFromReview("auth.token")).toBe(true);
    expect(isSecretFileName(".env.production")).toBe(true);
  });

  it("excludes heavy generated directories", () => {
    expect(shouldExcludeFromReview("node_modules/left-pad/index.js")).toBe(true);
    expect(shouldExcludeFromReview(".git/config")).toBe(true);
    expect(shouldExcludeFromReview("dist/cli.js")).toBe(true);
    expect(shouldExcludeFromReview("coverage/lcov.info")).toBe(true);
    expect(shouldExcludeFromReview("reviews/uads-review.zip")).toBe(true);
    expect(shouldExcludeFromReview("memory-bank/activeContext.md")).toBe(true);
  });

  it("keeps source, docs, schemas, and skill entrypoints", () => {
    expect(shouldExcludeFromReview("src/cli.ts")).toBe(false);
    expect(shouldExcludeFromReview("docs/04-ARCHITECTURE.md")).toBe(false);
    expect(shouldExcludeFromReview("schemas/checkpoint.schema.json")).toBe(false);
    expect(shouldExcludeFromReview("skills/uads-orchestrator/SKILL.md")).toBe(false);
    expect(shouldExcludeFromReview("README.md")).toBe(false);
  });

  it("keeps ordinary source whose names mention secrets, tokens, or credentials", () => {
    expect(shouldExcludeFromReview("src/lib/secrets.ts")).toBe(false);
    expect(shouldExcludeFromReview("src/auth/token-service.ts")).toBe(false);
    expect(shouldExcludeFromReview("tests/password-policy.test.ts")).toBe(false);
    expect(shouldExcludeFromReview("docs/credential-handling.md")).toBe(false);
    expect(isOrdinaryReviewableSource("src/lib/secrets.ts")).toBe(true);
    expect(isOrdinaryReviewableSource("src/auth/token-service.ts")).toBe(true);
    expect(isOrdinaryReviewableSource("tests/password-policy.test.ts")).toBe(true);
    expect(isOrdinaryReviewableSource("docs/credential-handling.md")).toBe(true);
  });

  it("rejects unsafe ZIP entry names", () => {
    expect(isUnsafeZipEntryName("../escape.txt")).toBe(true);
    expect(isUnsafeZipEntryName("/abs/path.txt")).toBe(true);
    expect(isUnsafeZipEntryName("C:/windows/path.txt")).toBe(true);
    expect(isUnsafeZipEntryName("project/src/lib/secrets.ts")).toBe(false);
  });
});
