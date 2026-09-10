import { sha256Hex } from "../lib/hash.js";
import { assertSchema } from "../lib/json-schema.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "../lib/secrets.js";
import {
  compileHostCapabilityProofV11,
  type HostCapabilityCurrentBasis,
  type HostCapabilityProofRecord,
  type HostCapabilityProofState,
} from "./host-capability-proof.js";
import {
  getHostCapabilityProbeDescriptor,
  normalizeHostCapabilityProbeReceipt,
  type HostCapabilityProbeReceipt,
  type ProbeParserId,
} from "./host-capability-probe.js";
import type { ModelCapability } from "./model-types.js";

export const ACTIVE_EVIDENCE_CONTRACT_SCHEMA = "uads.host-capability-active-evidence-contract" as const;
export const ACTIVE_EVIDENCE_CONTRACT_SCHEMA_VERSION = "1.0.0" as const;

export type ActiveEvidenceAvailability = "PRODUCTION" | "TEST_ONLY";
export type ActiveEvidenceResultMode = "EXACT_ACTIVE_RESULT" | "COMPLETE_ENUMERATION";

export type HostCapabilityActiveEvidenceContract = {
  schema: typeof ACTIVE_EVIDENCE_CONTRACT_SCHEMA;
  schemaVersion: typeof ACTIVE_EVIDENCE_CONTRACT_SCHEMA_VERSION;
  contractId: string;
  availability: ActiveEvidenceAvailability;
  adapterId: string;
  capabilityId: ModelCapability;
  probeId: string;
  descriptorDigest: string;
  parserId: ProbeParserId;
  resultMode: ActiveEvidenceResultMode;
  supportedSummaries: string[];
  unsupportedSummaries: string[];
  evidenceClass: "E3";
  validityClass: "LEASED";
  leaseMs: number;
  policyDigest: string;
  contractDigest: string;
};

type ActiveContractInput = Omit<
  HostCapabilityActiveEvidenceContract,
  "schema" | "schemaVersion" | "descriptorDigest" | "policyDigest" | "contractDigest"
>;

export type ActiveEvidenceCurrentContext = {
  subjectDigest: string;
  adapterId: string;
  runtimeVersion: string | null;
  adapterContractDigest: string;
  configurationDigest: string | null;
  executableIdentityDigest: string | null;
};

export type ActiveEvidenceCompileResult = {
  status: "COMPILED" | "NO_EVIDENCE" | "REJECTED" | "CONTRACT_BLOCKED";
  state: HostCapabilityProofState;
  proof: HostCapabilityProofRecord | null;
  currentBasis: HostCapabilityCurrentBasis | null;
  reasonCodes: string[];
};

const DIGEST=/^[a-f0-9]{64}$/;
const SAFE_ID=/^[A-Za-z0-9._:-]+$/;

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item)=>canonicalValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .filter(([,nested])=>nested!==undefined)
        .sort(([left],[right])=>(left<right?-1:left>right?1:0))
        .map(([key,nested])=>[key,canonicalValue(nested)]),
    );
  }
  return value;
}
function canonicalJson(value:unknown):string { return JSON.stringify(canonicalValue(value)); }
function digest(value:unknown):string { return sha256Hex(canonicalJson(value)); }
function assertDigest(value:string,label:string):void {
  if(!DIGEST.test(value)) throw new Error(`${label} must be a sha256 digest`);
}
function assertSafeId(value:string,label:string):void {
  if(!SAFE_ID.test(value)||containsAbsoluteHostPath(value)||containsUnredactedSecret(value)) throw new Error(`${label} is unsafe`);
}
function sorted(values:readonly string[]):string[] {
  return [...new Set(values)].sort((a,b)=>(a<b?-1:a>b?1:0));
}

export function compileActiveEvidenceContract(
  input: ActiveContractInput,
  schemaRoot?: string,
): HostCapabilityActiveEvidenceContract {
  assertSafeId(input.contractId,"contractId");
  assertSafeId(input.adapterId,"adapterId");
  assertSafeId(input.probeId,"probeId");
  const descriptor=getHostCapabilityProbeDescriptor(input.probeId);
  if(descriptor.capabilityId!==input.capabilityId) throw new Error("active contract capability/descriptor mismatch");
  if(descriptor.parserId!==input.parserId) throw new Error("active contract parser/descriptor mismatch");
  if(descriptor.availability!==input.availability) throw new Error("active contract availability/descriptor mismatch");
  for(const value of [...input.supportedSummaries,...input.unsupportedSummaries]){
    if(!SAFE_ID.test(value)||value.length>64) throw new Error("active contract summary is unsafe");
  }
  if(new Set(input.supportedSummaries).size!==input.supportedSummaries.length) throw new Error("supportedSummaries must be unique");
  if(new Set(input.unsupportedSummaries).size!==input.unsupportedSummaries.length) throw new Error("unsupportedSummaries must be unique");
  if(input.supportedSummaries.some((value)=>input.unsupportedSummaries.includes(value))) throw new Error("active contract result sets overlap");
  if(!Number.isInteger(input.leaseMs)||input.leaseMs<1000||input.leaseMs>86400000) throw new Error("active contract lease is outside bounds");

  const policyDigest=digest({
    domain:"uads-m03-active-evidence-policy-v1",
    contractId:input.contractId,
    availability:input.availability,
    adapterId:input.adapterId,
    capabilityId:input.capabilityId,
    probeId:input.probeId,
    descriptorDigest:descriptor.descriptorDigest,
    parserId:input.parserId,
    resultMode:input.resultMode,
    supportedSummaries:sorted(input.supportedSummaries),
    unsupportedSummaries:sorted(input.unsupportedSummaries),
    evidenceClass:input.evidenceClass,
    validityClass:input.validityClass,
    leaseMs:input.leaseMs,
  });
  const unsigned:Omit<HostCapabilityActiveEvidenceContract,"contractDigest">={
    schema:ACTIVE_EVIDENCE_CONTRACT_SCHEMA,
    schemaVersion:ACTIVE_EVIDENCE_CONTRACT_SCHEMA_VERSION,
    ...input,
    descriptorDigest:descriptor.descriptorDigest,
    supportedSummaries:sorted(input.supportedSummaries),
    unsupportedSummaries:sorted(input.unsupportedSummaries),
    policyDigest,
  };
  const contract={...unsigned,contractDigest:digest(unsigned)};
  assertSchema("host-capability-active-evidence-contract.schema.json",contract,schemaRoot);
  return contract;
}

const INPUTS:readonly ActiveContractInput[]=[
  {
    contractId:"test.active.tool-supported.v1",availability:"TEST_ONLY",adapterId:"generic-agent-skills",
    capabilityId:"toolCalling",probeId:"test.active-supported.v1",parserId:"echo-safe-v1",
    resultMode:"EXACT_ACTIVE_RESULT",supportedSummaries:["SUPPORTED"],unsupportedSummaries:[],
    evidenceClass:"E3",validityClass:"LEASED",leaseMs:60000,
  },
  {
    contractId:"test.active.tool-unsupported.v1",availability:"TEST_ONLY",adapterId:"generic-agent-skills",
    capabilityId:"toolCalling",probeId:"test.active-unsupported.v1",parserId:"echo-safe-v1",
    resultMode:"EXACT_ACTIVE_RESULT",supportedSummaries:[],unsupportedSummaries:["UNSUPPORTED"],
    evidenceClass:"E3",validityClass:"LEASED",leaseMs:60000,
  },
  {
    contractId:"test.enumeration.structured-excluded.v1",availability:"TEST_ONLY",adapterId:"generic-agent-skills",
    capabilityId:"structuredOutput",probeId:"test.enumeration-excluded.v1",parserId:"echo-safe-v1",
    resultMode:"COMPLETE_ENUMERATION",supportedSummaries:[],unsupportedSummaries:["EXCLUDED"],
    evidenceClass:"E3",validityClass:"LEASED",leaseMs:60000,
  },
  {
    contractId:"test.active.tool-unrecognized.v1",availability:"TEST_ONLY",adapterId:"generic-agent-skills",
    capabilityId:"toolCalling",probeId:"test.active-unrecognized.v1",parserId:"echo-safe-v1",
    resultMode:"EXACT_ACTIVE_RESULT",supportedSummaries:["SUPPORTED"],unsupportedSummaries:["UNSUPPORTED"],
    evidenceClass:"E3",validityClass:"LEASED",leaseMs:60000,
  },
  {
    contractId:"test.active.tool-timeout.v1",availability:"TEST_ONLY",adapterId:"generic-agent-skills",
    capabilityId:"toolCalling",probeId:"test.active-timeout.v1",parserId:"echo-safe-v1",
    resultMode:"EXACT_ACTIVE_RESULT",supportedSummaries:["SUPPORTED"],unsupportedSummaries:["UNSUPPORTED"],
    evidenceClass:"E3",validityClass:"LEASED",leaseMs:60000,
  },
  {
    contractId:"test.active.tool-blocked.v1",availability:"TEST_ONLY",adapterId:"generic-agent-skills",
    capabilityId:"toolCalling",probeId:"test.active-blocked.v1",parserId:"echo-safe-v1",
    resultMode:"EXACT_ACTIVE_RESULT",supportedSummaries:["SUPPORTED"],unsupportedSummaries:["UNSUPPORTED"],
    evidenceClass:"E3",validityClass:"LEASED",leaseMs:60000,
  },
];

const REGISTRY=new Map<string,HostCapabilityActiveEvidenceContract>(
  INPUTS.map((input)=>{const contract=compileActiveEvidenceContract(input);return [contract.contractId,contract];}),
);

export function getHostCapabilityActiveEvidenceContract(contractId:string):HostCapabilityActiveEvidenceContract {
  assertSafeId(contractId,"contractId");
  const contract=REGISTRY.get(contractId);
  if(!contract) throw new Error(`active evidence contract is not registered: ${contractId}`);
  return contract;
}

export function listProductionActiveEvidenceContracts():HostCapabilityActiveEvidenceContract[] {
  return [...REGISTRY.values()].filter((contract)=>contract.availability==="PRODUCTION");
}

function activeConfigurationBindingDigest(current:ActiveEvidenceCurrentContext):string {
  return digest({
    domain:"uads-m03-active-validity-basis-v1",
    configurationDigest:current.configurationDigest,
    executableIdentityDigest:current.executableIdentityDigest,
  });
}

function basis(contract:HostCapabilityActiveEvidenceContract,current:ActiveEvidenceCurrentContext):HostCapabilityCurrentBasis {
  return {
    subjectDigest:current.subjectDigest,
    adapterId:current.adapterId,
    runtimeVersion:current.runtimeVersion,
    validityBasis:{
      adapterContractDigest:current.adapterContractDigest,
      probeDefinitionDigest:contract.descriptorDigest,
      policyDigest:contract.policyDigest,
      configurationDigest:activeConfigurationBindingDigest(current),
    },
  };
}

export function buildActiveEvidenceCurrentBasis(
  contractId:string,
  current:ActiveEvidenceCurrentContext,
):HostCapabilityCurrentBasis {
  const contract=getHostCapabilityActiveEvidenceContract(contractId);
  assertCurrent(current);
  if(current.adapterId!==contract.adapterId) throw new Error("active contract adapter mismatch");
  return basis(contract,current);
}

function reject(contract:HostCapabilityActiveEvidenceContract,current:ActiveEvidenceCurrentContext,reason:string):ActiveEvidenceCompileResult {
  return {status:"REJECTED",state:"UNKNOWN",proof:null,currentBasis:basis(contract,current),reasonCodes:[reason]};
}

function assertCurrent(current:ActiveEvidenceCurrentContext):void {
  assertDigest(current.subjectDigest,"subjectDigest");
  assertSafeId(current.adapterId,"adapterId");
  assertDigest(current.adapterContractDigest,"adapterContractDigest");
  if(current.configurationDigest!==null) assertDigest(current.configurationDigest,"configurationDigest");
  if(current.executableIdentityDigest!==null) assertDigest(current.executableIdentityDigest,"executableIdentityDigest");
}

const BLOCKED_REASONS=new Set([
  "TEST_ONLY_PROBE_BLOCKED",
  "SIDE_EFFECT_CLASS_BLOCKED",
  "NETWORK_POLICY_BLOCKED",
  "PLATFORM_UNSUPPORTED",
]);

function exactReasons(receipt:HostCapabilityProbeReceipt,allowed:readonly string[]):boolean {
  return receipt.reasonCodes.length===allowed.length &&
    allowed.every((reason)=>receipt.reasonCodes.includes(reason));
}

function coherentReceipt(
  receipt:HostCapabilityProbeReceipt,
  descriptor:ReturnType<typeof getHostCapabilityProbeDescriptor>,
):boolean {
  if(receipt.stdoutBytes>descriptor.maxStdoutBytes || receipt.stderrBytes>descriptor.maxStderrBytes){
    return false;
  }
  if(receipt.status==="SUCCEEDED"){
    return receipt.exitCode===0 &&
      receipt.signal===null &&
      receipt.parsedSummary!==null &&
      receipt.executableIdentityBefore!==null &&
      receipt.executableIdentityAfter!==null &&
      receipt.executableIdentityBefore===receipt.executableIdentityAfter &&
      exactReasons(receipt,["PROBE_EXECUTION_SUCCEEDED"]);
  }
  if(receipt.parsedSummary!==null) return false;
  if(receipt.status==="BLOCKED"){
    return receipt.executableIdentityBefore===null &&
      receipt.executableIdentityAfter===null &&
      receipt.exitCode===null &&
      receipt.signal===null &&
      receipt.stdoutBytes===0 &&
      receipt.stderrBytes===0 &&
      receipt.reasonCodes.length>0 &&
      receipt.reasonCodes.every((reason)=>BLOCKED_REASONS.has(reason));
  }
  if(
    receipt.executableIdentityBefore===null ||
    receipt.executableIdentityAfter===null ||
    receipt.executableIdentityBefore!==receipt.executableIdentityAfter
  ){
    if(receipt.status!=="IDENTITY_DRIFT") return false;
  }
  if(receipt.status==="IDENTITY_DRIFT"){
    return receipt.executableIdentityBefore!==null &&
      receipt.executableIdentityAfter!==null &&
      receipt.executableIdentityBefore!==receipt.executableIdentityAfter &&
      exactReasons(receipt,["EXECUTABLE_IDENTITY_DRIFT"]);
  }
  if(receipt.status==="TIMED_OUT") return exactReasons(receipt,["PROBE_TIMEOUT"]);
  if(receipt.status==="OUTPUT_LIMIT") return exactReasons(receipt,["PROBE_OUTPUT_LIMIT"]);
  if(receipt.status==="FAILED"){
    return exactReasons(receipt,["PROBE_PROCESS_FAILED"]) ||
      exactReasons(receipt,["PROBE_PARSER_REJECTED"]);
  }
  return false;
}

function stateForReceipt(
  contract:HostCapabilityActiveEvidenceContract,
  receipt:HostCapabilityProbeReceipt,
):{state:HostCapabilityProofState;negativeProofKind:HostCapabilityProofRecord["negativeProofKind"];reason:string} {
  if(receipt.status==="BLOCKED") return {state:"BLOCKED",negativeProofKind:null,reason:"ACTIVE_PROBE_BLOCKED"};
  if(receipt.status!=="SUCCEEDED") return {state:"UNKNOWN",negativeProofKind:null,reason:`ACTIVE_PROBE_${receipt.status}`};
  const summary=receipt.parsedSummary;
  if(summary!==null && contract.supportedSummaries.includes(summary)){
    return {state:"SUPPORTED",negativeProofKind:null,reason:"ACTIVE_PROBE_RECOGNIZED_SUPPORTED"};
  }
  if(summary!==null && contract.unsupportedSummaries.includes(summary)){
    return {
      state:"UNSUPPORTED",
      negativeProofKind:contract.resultMode==="COMPLETE_ENUMERATION"
        ?"complete-enumeration-exclusion"
        :"active-probe-recognized-unsupported",
      reason:contract.resultMode==="COMPLETE_ENUMERATION"
        ?"ACTIVE_COMPLETE_ENUMERATION_EXCLUSION"
        :"ACTIVE_PROBE_RECOGNIZED_UNSUPPORTED",
    };
  }
  return {state:"UNKNOWN",negativeProofKind:null,reason:"ACTIVE_PROBE_UNRECOGNIZED_RESULT"};
}

export function compileActiveEvidenceToPccr(input:{
  contractId:string;
  current?:ActiveEvidenceCurrentContext|null;
  receipt?:unknown|null;
  schemaRoot?:string;
}):ActiveEvidenceCompileResult {
  const contract=getHostCapabilityActiveEvidenceContract(input.contractId);
  if(input.current===undefined || input.current===null){
    return {status:"NO_EVIDENCE",state:"UNKNOWN",proof:null,currentBasis:null,reasonCodes:["ACTIVE_CURRENT_CONTEXT_MISSING"]};
  }
  assertCurrent(input.current);
  const currentBasis=basis(contract,input.current);
  if(contract.availability==="TEST_ONLY" && process.env.NODE_ENV!=="test"){
    return {status:"CONTRACT_BLOCKED",state:"UNKNOWN",proof:null,currentBasis,reasonCodes:["TEST_ONLY_ACTIVE_CONTRACT_BLOCKED"]};
  }
  if(contract.availability!=="TEST_ONLY"){
    return {status:"CONTRACT_BLOCKED",state:"UNKNOWN",proof:null,currentBasis,reasonCodes:["NO_PRODUCTION_ACTIVE_CONTRACT_IN_WO009"]};
  }
  if(input.current.adapterId!==contract.adapterId) return reject(contract,input.current,"ACTIVE_CONTRACT_ADAPTER_MISMATCH");
  if(input.receipt===undefined||input.receipt===null){
    return {status:"NO_EVIDENCE",state:"UNKNOWN",proof:null,currentBasis,reasonCodes:["ACTIVE_RECEIPT_MISSING"]};
  }

  let receipt:HostCapabilityProbeReceipt;
  try{
    receipt=normalizeHostCapabilityProbeReceipt(input.receipt,input.schemaRoot);
  }catch{
    return reject(contract,input.current,"ACTIVE_RECEIPT_INVALID");
  }

  if(receipt.subjectDigest!==input.current.subjectDigest) return reject(contract,input.current,"ACTIVE_RECEIPT_SUBJECT_MISMATCH");
  if(receipt.probeId!==contract.probeId) return reject(contract,input.current,"ACTIVE_RECEIPT_PROBE_MISMATCH");
  if(receipt.capabilityId!==contract.capabilityId) return reject(contract,input.current,"ACTIVE_RECEIPT_CAPABILITY_MISMATCH");
  if(receipt.descriptorDigest!==contract.descriptorDigest) return reject(contract,input.current,"ACTIVE_RECEIPT_DESCRIPTOR_MISMATCH");
  if(receipt.parserId!==contract.parserId) return reject(contract,input.current,"ACTIVE_RECEIPT_PARSER_MISMATCH");
  const descriptor=getHostCapabilityProbeDescriptor(contract.probeId);
  if(!coherentReceipt(receipt,descriptor)) return reject(contract,input.current,"ACTIVE_RECEIPT_SEMANTIC_INCONSISTENCY");
  if(
    receipt.executableIdentityAfter!==null &&
    input.current.executableIdentityDigest!==receipt.executableIdentityAfter
  ){
    return reject(contract,input.current,"ACTIVE_EXECUTABLE_IDENTITY_MISMATCH");
  }

  const mapped=stateForReceipt(contract,receipt);
  const observedAt=receipt.finishedAt;
  const observedMs=Date.parse(observedAt);
  if(!Number.isFinite(observedMs)) return reject(contract,input.current,"ACTIVE_RECEIPT_TIME_INVALID");
  const validUntil=new Date(observedMs+contract.leaseMs).toISOString();
  const evidenceDigest=digest({
    domain:"uads-m03-active-evidence-v1",
    contractDigest:contract.contractDigest,
    receiptDigest:receipt.receiptDigest,
    subjectDigest:receipt.subjectDigest,
    capabilityId:receipt.capabilityId,
    descriptorDigest:receipt.descriptorDigest,
    parserId:receipt.parserId,
    status:receipt.status,
    parsedSummary:receipt.parsedSummary,
  });
  const proof=compileHostCapabilityProofV11({
    capabilityId:contract.capabilityId,
    state:mapped.state,
    evidenceClass:"E3",
    subjectDigest:input.current.subjectDigest,
    adapterId:input.current.adapterId,
    runtimeVersion:input.current.runtimeVersion,
    probeId:contract.probeId,
    validityBasis:{...currentBasis.validityBasis},
    observedAt,
    validUntil,
    validityClass:"LEASED",
    evidenceDigest,
    negativeProofKind:mapped.negativeProofKind,
    reasonCodes:sorted([mapped.reason,...receipt.reasonCodes]),
  },input.schemaRoot);
  return {status:"COMPILED",state:mapped.state,proof,currentBasis,reasonCodes:proof.reasonCodes};
}
