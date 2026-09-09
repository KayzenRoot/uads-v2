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

export function detectCodexAdapter(
  input: { hostHome?: string } = {},
): HostAdapterDetection {
  return detectHostAdapter("codex", input);
}

export function installCodexAdapter(
  input: HostAdapterInstallInput = {},
  schemaRoot?: string,
): HostAdapterState {
  return installHostAdapter("codex", input, schemaRoot);
}

export function uninstallCodexAdapter(
  input: HostAdapterUninstallInput = {},
  schemaRoot?: string,
): HostAdapterState | null {
  return uninstallHostAdapter("codex", input, schemaRoot);
}

export function resolveCodexTarget(hostHome?: string) {
  return resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome });
}
