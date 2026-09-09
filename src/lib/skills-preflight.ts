import fs from "node:fs";
import path from "node:path";

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DESCRIPTION_LIMIT = 1024;
const SKILL_LINE_LIMIT = 500;

export type SkillsPreflightResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

function parseFrontmatter(text: string): { name?: string; description?: string } {
  if (!text.startsWith("---")) {
    return {};
  }
  const end = text.indexOf("\n---", 3);
  if (end < 0) {
    return {};
  }
  const block = text.slice(4, end).replace(/\r/g, "");
  const name = block.match(/^name:\s*(\S+)/m)?.[1]?.trim();
  const descStart = block.search(/^description:\s*/m);
  if (descStart < 0) {
    return { name };
  }
  const after = block.slice(descStart).replace(/^description:\s*[>|]?\s*/m, "");
  const nextKey = after.search(/\n[a-zA-Z0-9_-]+:/m);
  const description = (nextKey >= 0 ? after.slice(0, nextKey) : after).replace(/\s+/g, " ").trim();
  return { name, description };
}

export function preflightUadsSkills(skillsRoot: string): SkillsPreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const skillDir = path.join(skillsRoot, "uads-orchestrator");
  const skillFile = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillFile)) {
    return { ok: false, errors: ["missing SKILL.md"], warnings };
  }
  const text = fs.readFileSync(skillFile, "utf8");
  const lines = text.split(/\r?\n/);
  if (lines.length > SKILL_LINE_LIMIT) {
    errors.push(`SKILL.md exceeds ${SKILL_LINE_LIMIT} lines`);
  }
  const frontmatter = parseFrontmatter(text);
  if (!frontmatter.name) {
    errors.push("frontmatter name missing");
  } else {
    if (frontmatter.name !== "uads-orchestrator") {
      errors.push("frontmatter name must match parent directory");
    }
    if (!NAME_PATTERN.test(frontmatter.name)) {
      errors.push("name must be lowercase hyphenated");
    }
  }
  if (!frontmatter.description) {
    errors.push("description missing");
  } else if (frontmatter.description.length > DESCRIPTION_LIMIT) {
    errors.push("description exceeds specification limit");
  }
  const refs = [...text.matchAll(/\breferences\/([A-Za-z0-9._-]+\.md)\b/g)]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name));
  for (const ref of refs) {
    const abs = path.join(skillDir, "references", ref);
    if (!fs.existsSync(abs)) {
      errors.push(`missing reference ${ref}`);
    }
  }
  const nested = [...text.matchAll(/references\/[^/\s]+\/[^/\s]+/g)];
  if (nested.length > 0) {
    errors.push("deep reference chains are not allowed");
  }
  return { ok: errors.length === 0, errors, warnings };
}
