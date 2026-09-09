import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";
import { findPackageRoot } from "./version.js";
import { sanitizeOperationalText } from "./safe-persist.js";

type CompiledValidator = ((data: unknown) => boolean) & { errors?: unknown[] | null };

const validators = new Map<string, CompiledValidator>();

function applyAjvFormats(ajv: Ajv2020): void {
  const imported = addFormatsImport as unknown as
    | ((instance: Ajv2020) => unknown)
    | { default?: (instance: Ajv2020) => unknown };
  const plugin = typeof imported === "function" ? imported : imported.default;
  if (!plugin) {
    throw new Error("ajv-formats plugin is unavailable");
  }
  plugin(ajv);
}

export function loadJsonSchema(name: string, schemaRoot?: string): Record<string, unknown> {
  const root = schemaRoot ?? findPackageRoot();
  const schemaPath = path.join(root, "schemas", name);
  return JSON.parse(fs.readFileSync(schemaPath, "utf8")) as Record<string, unknown>;
}

function compileSchema(schemaFile: string, schemaRoot?: string): CompiledValidator {
  const root = schemaRoot ?? findPackageRoot();
  const key = `${root}::${schemaFile}`;
  const cached = validators.get(key);
  if (cached) {
    return cached;
  }
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  applyAjvFormats(ajv);
  if (schemaFile === "specialist-registry.schema.json") {
    ajv.addSchema(loadJsonSchema("specialist-profile.schema.json", root));
  }
  const validate = ajv.compile(loadJsonSchema(schemaFile, root)) as CompiledValidator;
  validators.set(key, validate);
  return validate;
}

export function validateAgainstSchema(
  schemaFile: string,
  data: unknown,
  schemaRoot?: string,
): string[] {
  const validate = compileSchema(schemaFile, schemaRoot);
  if (validate(data)) {
    return [];
  }
  return (validate.errors ?? []).map((error) => {
    const item = error as { instancePath?: string; message?: string };
    return sanitizeOperationalText(`schema:${item.instancePath || "/"} ${item.message ?? "invalid"}`);
  });
}

export function assertSchema(schemaFile: string, data: unknown, schemaRoot?: string): void {
  const errors = validateAgainstSchema(schemaFile, data, schemaRoot);
  if (errors.length > 0) {
    throw new Error(`${schemaFile} validation failed: ${errors.join("; ")}`);
  }
}
