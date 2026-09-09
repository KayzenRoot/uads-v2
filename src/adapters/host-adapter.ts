import { detectHostAdapter } from "./host-adapter-detect.js";
import { getHostAdapterDefinition } from "./host-adapter-registry.js";
import { installHostAdapter, uninstallHostAdapter } from "./host-adapter-install.js";
import { prepareHostDispatchBundle } from "./host-dispatch.js";
import { handoffHostExecution, transitionHostExecutionReceipt } from "./host-execution.js";
import type {
  HostAdapter,
  HostAdapterDetectionInput,
  HostAdapterId,
  HostAdapterInstallInput,
  HostAdapterUninstallInput,
} from "./host-adapter-types.js";

export function getHostAdapter(adapterId: HostAdapterId): HostAdapter {
  return {
    definition: getHostAdapterDefinition(adapterId),
    detect: (input: HostAdapterDetectionInput = {}) => detectHostAdapter(adapterId, input),
    install: (input: HostAdapterInstallInput = {}) => installHostAdapter(adapterId, input),
    uninstall: (input: HostAdapterUninstallInput = {}) => uninstallHostAdapter(adapterId, input),
    prepare: (input = {}) => prepareHostDispatchBundle({ adapterId, ...input }),
    handoff: (input = {}) => handoffHostExecution({ adapterId, ...input }),
    receipt: (input) => transitionHostExecutionReceipt({ adapterId, ...input }),
  };
}
