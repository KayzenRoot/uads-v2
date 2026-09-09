import type { ContextRadius, NormalizedIntake, RepositoryMap } from "./types.js";
import { unique } from "./ids.js";

function modulePaths(map: RepositoryMap): string[] {
  return map.modules.map((mod) => mod.path);
}

function hasArea(map: RepositoryMap, area: string): boolean {
  const needle = area.replace(/\\/g, "/").replace(/\/$/, "");
  return (
    modulePaths(map).some((path) => path === needle || path.startsWith(`${needle}/`)) ||
    map.entrypoints.some((path) => path === needle || path.startsWith(`${needle}/`))
  );
}

function namedOrInferred(intake: NormalizedIntake, map: RepositoryMap): string[] {
  if (intake.affectedAreas.length > 0) {
    return unique(intake.affectedAreas.filter((area) => !area.includes(":") || area.startsWith(".") || !/^[A-Za-z]:/.test(area)));
  }
  const inferred: string[] = [];
  if (intake.domainSignals.includes("frontend") && hasArea(map, "frontend")) inferred.push("frontend");
  if (intake.domainSignals.includes("backend") && hasArea(map, "backend")) inferred.push("backend");
  if (intake.domainSignals.includes("documentation") && hasArea(map, "docs")) inferred.push("docs");
  if (
    (intake.domainSignals.includes("web3") || intake.domainSignals.includes("smart-contracts")) &&
    hasArea(map, "contracts")
  ) {
    inferred.push("contracts");
  }
  return unique(inferred);
}

function neighbors(areas: string[], map: RepositoryMap, extra: string[]): string[] {
  const available = new Set([...modulePaths(map), ...map.entrypoints]);
  return unique([...areas, ...extra.filter((item) => available.has(item) || hasArea(map, item))]);
}

export function selectContextCandidates(input: {
  radius: ContextRadius;
  intake: NormalizedIntake;
  map: RepositoryMap;
}): string[] {
  if (input.radius === "C0") {
    return [];
  }

  const named = namedOrInferred(input.intake, input.map);
  if (input.radius === "C1") {
    return named.slice(0, 8);
  }

  const tests = hasArea(input.map, "tests") ? ["tests"] : [];
  if (input.radius === "C2") {
    return unique([...named, ...tests]).slice(0, 10);
  }

  if (input.radius === "C3") {
    const related: string[] = [];
    if (named.includes("frontend") && hasArea(input.map, "backend")) related.push("backend");
    if (named.includes("backend") && hasArea(input.map, "frontend")) related.push("frontend");
    if (input.intake.domainSignals.includes("api") && hasArea(input.map, "backend")) related.push("backend");
    if (input.intake.domainSignals.includes("database") && hasArea(input.map, "backend")) related.push("backend");
    return neighbors(named, input.map, [...tests, ...related]).slice(0, 12);
  }

  const connected: string[] = [...named, ...tests];
  if (input.intake.domainSignals.includes("web3") || input.intake.domainSignals.includes("smart-contracts")) {
    if (hasArea(input.map, "contracts")) connected.push("contracts");
    if (hasArea(input.map, "backend")) connected.push("backend");
  }
  if (input.intake.domainSignals.includes("security") && hasArea(input.map, "backend")) {
    connected.push("backend");
  }
  if (input.intake.domainSignals.includes("finance-economics") && hasArea(input.map, "backend")) {
    connected.push("backend");
  }
  if (input.intake.domainSignals.includes("architecture")) {
    connected.push(...modulePaths(input.map).filter((path) => path !== "docs").slice(0, 4));
  }
  return unique(connected).slice(0, 16);
}
