import { runInspect } from "../kernel/orchestrator.js";

export function runInspectCommand(input: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  const result = runInspect(input);
  if (input.json) {
    return `${JSON.stringify(
      {
        projectId: result.projectId,
        reused: result.reused,
        fullWalk: result.fullWalk,
        digest: result.map.digest,
        languages: result.map.languages,
        packageManager: result.map.packageManager,
        frameworks: result.map.frameworks,
        signals: result.map.signals,
        modules: result.map.modules,
        entrypoints: result.map.entrypoints,
      },
      null,
      2,
    )}\n`;
  }
  return [
    "UADS inspect",
    `projectId: ${result.projectId}`,
    `repositoryName: ${result.map.repositoryName}`,
    `reused: ${result.reused}`,
    `languages: ${result.map.languages.join(", ") || "(none)"}`,
    `packageManager: ${result.map.packageManager ?? "(none)"}`,
    `digest: ${result.map.digest}`,
    `modules: ${result.map.modules.map((mod) => mod.path).join(", ") || "(none)"}`,
    "",
  ].join("\n");
}
