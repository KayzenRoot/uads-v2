import { InvalidOrchestrationStateError } from "./persist.js";
import type { ExecutionPacket, ExecutionRun } from "./execution-types.js";
import type { Checkpoint, RoutingDecision, WorkOrder } from "./types.js";

export function assertActiveExecutionConsistency(input: {
  projectId: string;
  checkpoint: Checkpoint;
  workOrder: WorkOrder;
  routing: RoutingDecision;
  run: ExecutionRun;
  packet: ExecutionPacket;
}): void {
  const { projectId, checkpoint, workOrder, routing, run, packet } = input;
  if (
    projectId !== checkpoint.projectId ||
    projectId !== workOrder.projectId ||
    projectId !== routing.projectId ||
    projectId !== run.projectId
  ) {
    throw new InvalidOrchestrationStateError("execution artifacts have conflicting projectId");
  }
  if (!checkpoint.workOrderId || checkpoint.workOrderId !== workOrder.workOrderId || workOrder.workOrderId !== run.workOrderId) {
    throw new InvalidOrchestrationStateError("execution artifacts have conflicting workOrderId");
  }
  if (
    !checkpoint.routingDecisionId ||
    checkpoint.routingDecisionId !== workOrder.routingDecisionId ||
    workOrder.routingDecisionId !== run.routingDecisionId ||
    routing.routingDecisionId !== run.routingDecisionId
  ) {
    throw new InvalidOrchestrationStateError("execution artifacts have conflicting routingDecisionId");
  }
  if (packet.executionRunId !== run.executionRunId || packet.workOrderId !== run.workOrderId) {
    throw new InvalidOrchestrationStateError("execution packet does not match the active run");
  }
}
