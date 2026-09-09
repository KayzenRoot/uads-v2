import { describe, expect, it } from "vitest";
import {
  compileActiveEvidenceToPccr,
  getHostCapabilityActiveEvidenceContract,
  listProductionActiveEvidenceContracts,
  type ActiveEvidenceCurrentContext,
} from "../src/kernel/host-capability-active-evidence.js";
import {
  compileHostCapabilityProofV11,
  computeHostCapabilityProofDigest,
  evaluateHostCapabilityProof,
  normalizeHostCapabilityProof,
} from "../src/kernel/host-capability-proof.js";
import {
  computeHostCapabilityProbeReceiptDigest,
  executeHostCapabilityProbe,
  type HostCapabilityProbeReceipt,
} from "../src/kernel/host-capability-probe.js";

const ROOT=process.cwd();
const SUBJECT="2".repeat(64);
const ADAPTER_DIGEST="3".repeat(64);
const CONFIG_DIGEST="4".repeat(64);
const current=(overrides:Partial<ActiveEvidenceCurrentContext>={}):ActiveEvidenceCurrentContext=>({
  subjectDigest:SUBJECT,
  adapterId:"generic-agent-skills",
  runtimeVersion:null,
  adapterContractDigest:ADAPTER_DIGEST,
  configurationDigest:CONFIG_DIGEST,
  ...overrides,
});

async function receipt(probeId:string,subjectDigest=SUBJECT):Promise<HostCapabilityProbeReceipt>{
  return executeHostCapabilityProbe(probeId,subjectDigest,{schemaRoot:ROOT});
}

function resignReceipt(input:HostCapabilityProbeReceipt,patch:Partial<HostCapabilityProbeReceipt>):HostCapabilityProbeReceipt{
  const merged={...input,...patch};
  const {receiptDigest:_d,...unsigned}=merged;
  return {...unsigned,receiptDigest:computeHostCapabilityProbeReceiptDigest(unsigned)};
}

describe("UADS2-WO-009 M03 active evidence compiler",{timeout:120000},()=>{
  it("production active contract registry is intentionally empty",()=>{
    expect(listProductionActiveEvidenceContracts()).toEqual([]);
  });

  it("M03-T011 no receipt remains UNKNOWN, never UNSUPPORTED",()=>{
    const result=compileActiveEvidenceToPccr({
      contractId:"test.active.tool-unsupported.v1",current:current(),receipt:null,nodeEnv:"test",schemaRoot:ROOT,
    });
    expect(result.status).toBe("NO_EVIDENCE");
    expect(result.state).toBe("UNKNOWN");
    expect(result.proof).toBeNull();
  });

  it("M03-T012 missing host/current context cannot create UNSUPPORTED",()=>{
    const result=compileActiveEvidenceToPccr({
      contractId:"test.active.tool-supported.v1",current:null,nodeEnv:"test",schemaRoot:ROOT,
    });
    expect(result.status).toBe("NO_EVIDENCE");
    expect(result.state).toBe("UNKNOWN");
    expect(result.proof).toBeNull();
    expect(result.currentBasis).toBeNull();
    expect(result.reasonCodes).toContain("ACTIVE_CURRENT_CONTEXT_MISSING");
  });

  it("M03-T013 blocked probe remains BLOCKED and non-enabling",async()=>{
    const r=await receipt("test.active-blocked.v1");
    const result=compileActiveEvidenceToPccr({
      contractId:"test.active.tool-blocked.v1",current:current(),receipt:r,nodeEnv:"test",schemaRoot:ROOT,
    });
    expect(r.status).toBe("BLOCKED");
    expect(result.state).toBe("BLOCKED");
    expect(result.proof?.negativeProofKind).toBeNull();
  });

  it("M03-T014 timeout remains UNKNOWN",async()=>{
    const r=await receipt("test.active-timeout.v1");
    const result=compileActiveEvidenceToPccr({
      contractId:"test.active.tool-timeout.v1",current:current(),receipt:r,nodeEnv:"test",schemaRoot:ROOT,
    });
    expect(r.status).toBe("TIMED_OUT");
    expect(result.state).toBe("UNKNOWN");
    expect(result.proof?.negativeProofKind).toBeNull();
  });

  it("M03-T015 unrecognized successful summary remains UNKNOWN",async()=>{
    const r=await receipt("test.active-unrecognized.v1");
    const result=compileActiveEvidenceToPccr({
      contractId:"test.active.tool-unrecognized.v1",current:current(),receipt:r,nodeEnv:"test",schemaRoot:ROOT,
    });
    expect(r.status).toBe("SUCCEEDED");
    expect(r.parsedSummary).toBe("MAYBE");
    expect(result.state).toBe("UNKNOWN");
    expect(result.proof?.negativeProofKind).toBeNull();
  });

  it("M03-T016 complete enumeration exclusion creates only exact E3 NPC UNSUPPORTED",async()=>{
    const r=await receipt("test.enumeration-excluded.v1");
    const result=compileActiveEvidenceToPccr({
      contractId:"test.enumeration.structured-excluded.v1",current:current(),receipt:r,nodeEnv:"test",schemaRoot:ROOT,
    });
    expect(result.state).toBe("UNSUPPORTED");
    expect(result.proof?.schemaVersion).toBe("1.1.0");
    expect(result.proof?.evidenceClass).toBe("E3");
    expect(result.proof?.negativeProofKind).toBe("complete-enumeration-exclusion");
  });

  it("M03-T017 recognized exact unsupported result creates active NPC UNSUPPORTED",async()=>{
    const r=await receipt("test.active-unsupported.v1");
    const result=compileActiveEvidenceToPccr({
      contractId:"test.active.tool-unsupported.v1",current:current(),receipt:r,nodeEnv:"test",schemaRoot:ROOT,
    });
    expect(result.state).toBe("UNSUPPORTED");
    expect(result.proof?.negativeProofKind).toBe("active-probe-recognized-unsupported");
  });

  it("synthetic recognized supported result creates E3 SUPPORTED only under TEST_ONLY contract",async()=>{
    const r=await receipt("test.active-supported.v1");
    const result=compileActiveEvidenceToPccr({
      contractId:"test.active.tool-supported.v1",current:current(),receipt:r,nodeEnv:"test",schemaRoot:ROOT,
    });
    expect(result.status).toBe("COMPILED");
    expect(result.state).toBe("SUPPORTED");
    expect(result.proof?.schemaVersion).toBe("1.1.0");
    expect(result.proof?.evidenceClass).toBe("E3");
    expect(result.proof?.validityClass).toBe("LEASED");
  });

  it("TEST_ONLY contract is blocked outside test mode",async()=>{
    const r=await receipt("test.active-supported.v1");
    const result=compileActiveEvidenceToPccr({
      contractId:"test.active.tool-supported.v1",current:current(),receipt:r,nodeEnv:"production",schemaRoot:ROOT,
    });
    expect(result.status).toBe("CONTRACT_BLOCKED");
    expect(result.state).toBe("UNKNOWN");
    expect(result.proof).toBeNull();
  });

  it("wrong subject binding fails closed",async()=>{
    const r=await receipt("test.active-supported.v1","5".repeat(64));
    const result=compileActiveEvidenceToPccr({
      contractId:"test.active.tool-supported.v1",current:current(),receipt:r,nodeEnv:"test",schemaRoot:ROOT,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.state).toBe("UNKNOWN");
  });

  it("wrong adapter binding fails closed",async()=>{
    const r=await receipt("test.active-supported.v1");
    const result=compileActiveEvidenceToPccr({
      contractId:"test.active.tool-supported.v1",current:current({adapterId:"cursor"}),receipt:r,nodeEnv:"test",schemaRoot:ROOT,
    });
    expect(result.status).toBe("REJECTED");
  });

  it("wrong probe/descriptor/parser/capability bindings fail closed",async()=>{
    const r=await receipt("test.active-supported.v1");
    const variants=[
      resignReceipt(r,{probeId:"test.active-unsupported.v1"}),
      resignReceipt(r,{descriptorDigest:"6".repeat(64)}),
      resignReceipt(r,{parserId:"exit-code-v1"}),
      resignReceipt(r,{capabilityId:"structuredOutput"}),
    ];
    for(const forged of variants){
      const result=compileActiveEvidenceToPccr({
        contractId:"test.active.tool-supported.v1",current:current(),receipt:forged,nodeEnv:"test",schemaRoot:ROOT,
      });
      expect(result.status).toBe("REJECTED");
      expect(result.proof).toBeNull();
    }
  });

  it("M03-T051 forged coherent-digest but incoherent success receipt is rejected",async()=>{
    const timed=await receipt("test.active-timeout.v1");
    const forged=resignReceipt(timed,{
      status:"SUCCEEDED",
      reasonCodes:["PROBE_EXECUTION_SUCCEEDED"],
      exitCode:0,
      signal:null,
      parsedSummary:null,
    });
    const result=compileActiveEvidenceToPccr({
      contractId:"test.active.tool-timeout.v1",current:current(),receipt:forged,nodeEnv:"test",schemaRoot:ROOT,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.reasonCodes).toContain("ACTIVE_RECEIPT_SEMANTIC_INCONSISTENCY");
  });

  it("M03-T052 historical PCCR 1.0 remains valid and cannot carry 1.1 negative kind",async()=>{
    const r=await receipt("test.active-unsupported.v1");
    const compiled=compileActiveEvidenceToPccr({
      contractId:"test.active.tool-unsupported.v1",current:current(),receipt:r,nodeEnv:"test",schemaRoot:ROOT,
    }).proof!;
    const historical={
      ...compiled,
      schemaVersion:"1.0.0" as const,
      negativeProofKind:"adapter-contract-impossible" as const,
    };
    const {proofDigest:_one,...historicalUnsigned}=historical;
    const validHistorical={...historicalUnsigned,proofDigest:computeHostCapabilityProofDigest(historicalUnsigned)};
    expect(normalizeHostCapabilityProof(validHistorical,ROOT).schemaVersion).toBe("1.0.0");

    const invalid={...validHistorical,negativeProofKind:"active-probe-recognized-unsupported" as const};
    const {proofDigest:_two,...invalidUnsigned}=invalid;
    const resigned={...invalidUnsigned,proofDigest:computeHostCapabilityProofDigest(invalidUnsigned as never)};
    expect(()=>normalizeHostCapabilityProof(resigned,ROOT)).toThrow();
  });

  it("PCCR 1.1 complete-enumeration negative proof also requires E3",()=>{
    const contract=getHostCapabilityActiveEvidenceContract("test.enumeration.structured-excluded.v1");
    expect(()=>compileHostCapabilityProofV11({
      capabilityId:"structuredOutput",
      state:"UNSUPPORTED",
      evidenceClass:"E2",
      subjectDigest:SUBJECT,
      adapterId:"generic-agent-skills",
      runtimeVersion:null,
      probeId:contract.probeId,
      validityBasis:{
        adapterContractDigest:ADAPTER_DIGEST,
        probeDefinitionDigest:contract.descriptorDigest,
        policyDigest:contract.policyDigest,
        configurationDigest:CONFIG_DIGEST,
      },
      observedAt:"2026-09-09T20:00:00.000Z",
      validUntil:"2026-09-09T20:01:00.000Z",
      validityClass:"LEASED",
      evidenceDigest:"b".repeat(64),
      negativeProofKind:"complete-enumeration-exclusion",
      reasonCodes:["TEST_COMPLETE_ENUMERATION"],
    },ROOT)).toThrow(/E3 or stronger/);
  });

  it("forged receipt exceeding descriptor byte budget is rejected even with valid receipt digest",async()=>{
    const r=await receipt("test.active-supported.v1");
    const forged=resignReceipt(r,{stdoutBytes:1024});
    const result=compileActiveEvidenceToPccr({
      contractId:"test.active.tool-supported.v1",current:current(),receipt:forged,nodeEnv:"test",schemaRoot:ROOT,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.reasonCodes).toContain("ACTIVE_RECEIPT_SEMANTIC_INCONSISTENCY");
  });

  it("lease expiry and descriptor/policy/config/runtime drift become STALE",async()=>{
    const r=await receipt("test.active-supported.v1");
    const result=compileActiveEvidenceToPccr({
      contractId:"test.active.tool-supported.v1",current:current(),receipt:r,nodeEnv:"test",schemaRoot:ROOT,
    });
    const proof=result.proof!;
    expect(evaluateHostCapabilityProof(proof,result.currentBasis,{now:proof.observedAt,schemaRoot:ROOT}).effectiveState).toBe("SUPPORTED");
    const afterLease=new Date(Date.parse(proof.validUntil!)+1).toISOString();
    expect(evaluateHostCapabilityProof(proof,result.currentBasis,{now:afterLease,schemaRoot:ROOT}).effectiveState).toBe("STALE");

    const drifts=[
      {...result.currentBasis,validityBasis:{...result.currentBasis.validityBasis,probeDefinitionDigest:"7".repeat(64)}},
      {...result.currentBasis,validityBasis:{...result.currentBasis.validityBasis,policyDigest:"8".repeat(64)}},
      {...result.currentBasis,validityBasis:{...result.currentBasis.validityBasis,configurationDigest:"9".repeat(64)}},
      {...result.currentBasis,runtimeVersion:"different"},
    ];
    for(const drift of drifts){
      expect(evaluateHostCapabilityProof(proof,drift,{now:proof.observedAt,schemaRoot:ROOT}).effectiveState).toBe("STALE");
    }
  });

  it("compiler needs only privacy-safe receipt identity, never raw output/path/env",async()=>{
    const r=await receipt("test.active-supported.v1");
    const result=compileActiveEvidenceToPccr({
      contractId:"test.active.tool-supported.v1",current:current(),receipt:r,nodeEnv:"test",schemaRoot:ROOT,
    });
    const durable=JSON.stringify(result.proof);
    expect(durable).not.toContain(process.execPath);
    expect(durable).not.toMatch(/stdout.*SUPPORTED|stderr.*SUPPORTED|process\.env/);
  });

  it("WO009-B1/B4 synthetic compiler benchmark remains bounded",async()=>{
    const r=await receipt("test.active-supported.v1");
    const durations:number[]=[];
    for(let i=0;i<1000;i+=1){
      const started=performance.now();
      const result=compileActiveEvidenceToPccr({
        contractId:"test.active.tool-supported.v1",current:current(),receipt:r,nodeEnv:"test",schemaRoot:ROOT,
      });
      durations.push(performance.now()-started);
      expect(result.state).toBe("SUPPORTED");
    }
    const sorted=[...durations].sort((a,b)=>a-b);
    const percentile=(n:number)=>sorted[Math.max(0,Math.ceil(sorted.length*n/100)-1)]??0;

    const absence=compileActiveEvidenceToPccr({
      contractId:"test.active.tool-unsupported.v1",current:current(),receipt:null,nodeEnv:"test",schemaRoot:ROOT,
    });
    const unknownR=await receipt("test.active-unrecognized.v1");
    const unknown=compileActiveEvidenceToPccr({
      contractId:"test.active.tool-unrecognized.v1",current:current(),receipt:unknownR,nodeEnv:"test",schemaRoot:ROOT,
    });
    const forged=resignReceipt(r,{descriptorDigest:"a".repeat(64)});
    const forgedResult=compileActiveEvidenceToPccr({
      contractId:"test.active.tool-supported.v1",current:current(),receipt:forged,nodeEnv:"test",schemaRoot:ROOT,
    });
    const metrics={
      schema:"uads2.wo009.active-evidence-benchmark",
      B1:{samples:1000,p50Ms:percentile(50),p95Ms:percentile(95),targetP95Ms:10},
      B4:{
        falsePositiveFromAbsence:absence.state==="SUPPORTED"?1:0,
        absenceUnsupported:absence.state==="UNSUPPORTED"?1:0,
        unrecognizedUnsupported:unknown.state==="UNSUPPORTED"?1:0,
        forgedAccepted:forgedResult.status==="COMPILED"?1:0,
      },
    };
    console.log(`UADS2_WO_009_BENCHMARK=${JSON.stringify(metrics)}`);
    expect(metrics.B1.p95Ms).toBeLessThanOrEqual(10);
    expect(metrics.B4).toEqual({falsePositiveFromAbsence:0,absenceUnsupported:0,unrecognizedUnsupported:0,forgedAccepted:0});
  });
});
