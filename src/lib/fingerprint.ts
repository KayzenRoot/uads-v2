import { sha256Hex } from "./hash.js";
import { sanitizeRemoteUrl } from "./sanitize-url.js";

export type FingerprintSource = "remote" | "path";

export type ProjectFingerprint = {
  projectId: string;
  fingerprint: string;
  material: string;
  source: FingerprintSource;
};

export function normalizeRemoteUrl(remote: string): string {
  let value = remote.trim();

  const scp = value.match(/^git@([^:]+):(.+)$/i);
  if (scp) {
    const host = scp[1] ?? "";
    const repo = (scp[2] ?? "").replace(/\.git$/i, "");
    value = `https://${host}/${repo}`;
  }

  value = value.replace(/^ssh:\/\/git@/i, "https://");
  value = value.replace(/\.git$/i, "");
  value = value.replace(/\/+$/, "");

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname.replace(/\/+$/, "");
    return `https://${host}${pathname}`;
  } catch {
    return value.toLowerCase();
  }
}

export function fingerprintFromMaterial(
  material: string,
  source: FingerprintSource,
): ProjectFingerprint {
  const fingerprint = sha256Hex(material);
  return {
    fingerprint,
    projectId: fingerprint.slice(0, 16),
    material,
    source,
  };
}

export function computeProjectFingerprint(input: {
  originUrl: string | null;
  repoRoot: string;
}): ProjectFingerprint {
  const sanitized = sanitizeRemoteUrl(input.originUrl);
  if (sanitized) {
    return fingerprintFromMaterial(normalizeRemoteUrl(sanitized), "remote");
  }

  return fingerprintFromMaterial(input.repoRoot.replace(/\\/g, "/").toLowerCase(), "path");
}
