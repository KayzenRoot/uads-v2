export function sanitizeRemoteUrl(remote: string | null | undefined): string | null {
  if (!remote) {
    return null;
  }

  const trimmed = remote.trim();
  if (!trimmed) {
    return null;
  }

  if (/^git@[^:]+:/.test(trimmed)) {
    return trimmed.replace(/\.git$/i, "");
  }

  try {
    const url = new URL(trimmed);
    url.username = "";
    url.password = "";
    url.hash = "";
    const serialized = url.toString().replace("://@", "://").replace(/\/+$/, "");
    return serialized.replace(/\.git$/i, "");
  } catch {
    if (hasEmbeddedUserinfo(trimmed)) {
      return null;
    }
    return trimmed.replace(/\.git$/i, "");
  }
}

export function hasEmbeddedUserinfo(value: string): boolean {
  return /https?:\/\/[^/\s"'@]+@/i.test(value);
}

export function stripCredentialUrls(text: string): string {
  return text.replace(/https?:\/\/[^/\s"'\\]+@/gi, (match) => {
    return match.toLowerCase().startsWith("https://") ? "https://" : "http://";
  });
}
