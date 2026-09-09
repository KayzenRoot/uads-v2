import {
  detectHostAdapter,
  resolveHostTarget,
} from "./host-adapter-detect.js";
import { getHostAdapterDefinition } from "./host-adapter-registry.js";
import {
  installHostAdapter,
  uninstallHostAdapter,
} from "./host-adapter-install.js";
import type {
  HostAdapterDetection,
  HostAdapterInstallInput,
  HostAdapterState,
  HostAdapterUninstallInput,
} from "./host-adapter-types.js";

export function detectGenericAgentSkillsAdapter(
  input: { hostHome?: string } = {},
): HostAdapterDetection {
  return detectHostAdapter("generic-agent-skills", input);
}

export function installGenericAgentSkillsAdapter(
  input: HostAdapterInstallInput = {},
  schemaRoot?: string,
): HostAdapterState {
  return installHostAdapter("generic-agent-skills", input, schemaRoot);
}

export function uninstallGenericAgentSkillsAdapter(
  input: HostAdapterUninstallInput = {},
  schemaRoot?: string,
): HostAdapterState | null {
  return uninstallHostAdapter("generic-agent-skills", input, schemaRoot);
}

export function resolveGenericAgentSkillsTarget(hostHome?: string) {
  return resolveHostTarget(getHostAdapterDefinition("generic-agent-skills"), { hostHome });
}
