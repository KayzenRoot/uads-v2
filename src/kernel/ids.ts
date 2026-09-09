import { sha256Hex } from "../lib/hash.js";

export function newPrefixedId(prefix: string, material: string): string {
  return `${prefix}_${sha256Hex(material).slice(0, 16)}`;
}

export function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function includesAny(haystack: string, needles: string[]): boolean {
  const text = haystack.toLowerCase();
  return needles.some((needle) => text.includes(needle.toLowerCase()));
}

export function titleFromObjective(objective: string): string {
  const compact = objective.replace(/\s+/g, " ").trim();
  return compact.length <= 80 ? compact : `${compact.slice(0, 77)}...`;
}
