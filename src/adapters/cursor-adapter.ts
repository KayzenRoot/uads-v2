import { detectHostAdapter, resolveHostTarget } from "./host-adapter-detect.js";
import { getHostAdapterDefinition } from "./host-adapter-registry.js";
import { installHostAdapter, uninstallHostAdapter } from "./host-adapter-install.js";
import type {
  HostAdapterDetection,
  HostAdapterInstallInput,
  HostAdapterState,
  HostAdapterUninstallInput,
} from "./host-adapter-types.js";

export function detectCursorAdapter(input: { hostHome?: string } = {}): HostAdapterDetection {
  return detectHostAdapter("cursor", input);
}

export function installCursorAdapter(
  input: HostAdapterInstallInput = {},
  schemaRoot?: string,
): HostAdapterState {
  return installHostAdapter("cursor", input, schemaRoot);
}

export function uninstallCursorAdapter(
  input: HostAdapterUninstallInput = {},
  schemaRoot?: string,
): HostAdapterState | null {
  return uninstallHostAdapter("cursor", input, schemaRoot);
}

export function resolveCursorTarget(hostHome?: string) {
  return resolveHostTarget(getHostAdapterDefinition("cursor"), { hostHome });
}
