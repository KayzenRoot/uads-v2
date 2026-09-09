import type { ScopeControl } from "./types.js";

export type ScopedItem = {
  text: string;
  control: ScopeControl;
};

export function classifyRequestedWork(input: {
  objective: string;
  inScope: string[];
  outOfScope: string[];
  recommendations: string[];
}): { necessary: string[]; important: string[]; future: string[]; excluded: string[] } {
  const necessary = input.inScope.length > 0 ? input.inScope : [input.objective];
  return {
    necessary,
    important: input.recommendations,
    future: [],
    excluded: input.outOfScope,
  };
}

export function scopeControlForLabel(label: ScopeControl): ScopeControl {
  return label;
}
