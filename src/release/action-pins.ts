export type ActionPinIssue = {
  file: string;
  line: number;
  reference: string;
  reason: "mutable-ref" | "missing-ref";
};

const USES_RE = /^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/;
const SHA_RE = /^[0-9a-f]{40}$/i;

export function findActionPinIssues(text: string, file = "workflow.yml"): ActionPinIssue[] {
  const issues: ActionPinIssue[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const match = USES_RE.exec(line);
    if (!match?.[1] || match[1].startsWith("./")) {
      return;
    }
    const reference = match[1];
    const at = reference.lastIndexOf("@");
    const ref = at >= 0 ? reference.slice(at + 1) : "";
    if (at < 0) {
      issues.push({ file, line: index + 1, reference, reason: "missing-ref" });
    } else if (!SHA_RE.test(ref)) {
      issues.push({ file, line: index + 1, reference, reason: "mutable-ref" });
    }
  });
  return issues;
}

export function validateActionPins(files: Record<string, string>): ActionPinIssue[] {
  return Object.entries(files).flatMap(([file, text]) => findActionPinIssues(text, file));
}
