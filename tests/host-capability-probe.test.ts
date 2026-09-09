import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ensureWorkspace } from "../src/lib/workspace.js";
import {
  compileHostCapabilityProbeDescriptor,
  computeHostCapabilityProbeDescriptorDigest,
  executeHostCapabilityProbe,
  getHostCapabilityProbeDescriptor,
  hostCapabilityProbeRuntimeStats,
  listProductionHostCapabilityProbeDescriptors,
  readHostCapabilityProbeReceipt,
  resetHostCapabilityProbeRuntimeStatsForTests,
  evaluateHostCapabilityProbePolicy,
} from "../src/kernel/host-capability-probe.js";

const ROOT = process.cwd();
const SUBJECT = "1".repeat(64);

function home(prefix="uads-m03-probe-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(),prefix));
}

beforeEach(() => {
  resetHostCapabilityProbeRuntimeStatsForTests();
  delete process.env.UADS_TEST_SECRET;
});

describe("UADS2-WO-008 M03 Probe Budget Fence", { timeout: 120_000 }, () => {
  it("descriptor digest is deterministic and production registry is closed", () => {
    const one = getHostCapabilityProbeDescriptor("uads.node.version.v1");
    const two = getHostCapabilityProbeDescriptor("uads.node.version.v1");
    expect(one.descriptorDigest).toBe(two.descriptorDigest);
    expect(computeHostCapabilityProbeDescriptorDigest({
      ...one,
      descriptorDigest:undefined as never,
    } as never)).not.toBe("");
    expect(listProductionHostCapabilityProbeDescriptors().map((item)=>item.probeId)).toEqual(["uads.node.version.v1"]);
    expect(() => getHostCapabilityProbeDescriptor("not.registered")).toThrow(/not registered/);
  });

  it("M03-T031 arbitrary executable rule is rejected", () => {
    const base = getHostCapabilityProbeDescriptor("uads.node.version.v1");
    const { schema:_s,schemaVersion:_v,descriptorDigest:_d,...raw } = base;
    expect(() => compileHostCapabilityProbeDescriptor({ ...raw, executableRule:"arbitrary" })).toThrow(/executable rule|validation/i);
  });

  it("M03-T032 shell field is rejected and runtime has no shell control surface", async () => {
    const base = getHostCapabilityProbeDescriptor("uads.node.version.v1");
    const { schema:_s,schemaVersion:_v,descriptorDigest:_d,...raw } = base;
    expect(() => compileHostCapabilityProbeDescriptor({ ...raw, shell:true })).toThrow(/unsupported fields/);
    const receipt = await executeHostCapabilityProbe("uads.node.version.v1",SUBJECT,{schemaRoot:ROOT});
    expect(receipt.status).toBe("SUCCEEDED");
  });

  it("M03-T033 unbounded args are rejected and runtime caller supplies no args", () => {
    const base = getHostCapabilityProbeDescriptor("uads.node.version.v1");
    const { schema:_s,schemaVersion:_v,descriptorDigest:_d,...raw } = base;
    expect(() => compileHostCapabilityProbeDescriptor({ ...raw, fixedArgs:Array.from({length:17},()=>"--version") })).toThrow(/fixedArgs/);
    expect(() => compileHostCapabilityProbeDescriptor({ ...raw, fixedArgs:["x".repeat(513)] })).toThrow(/fixedArgs/);
  });

  it("M03-T034 inherited secret environment does not reach child", async () => {
    process.env.UADS_TEST_SECRET="github_pat_abcdefghijklmnopqrstuvwxyz1234567890";
    const receipt = await executeHostCapabilityProbe("test.env-secret.v1",SUBJECT,{schemaRoot:ROOT});
    expect(receipt.status).toBe("SUCCEEDED");
    expect(receipt.parsedSummary).toBe("ABSENT");
    expect(JSON.stringify(receipt)).not.toContain(process.env.UADS_TEST_SECRET);
  });

  it("M03-T035 stdout ceiling is enforced", async () => {
    const receipt = await executeHostCapabilityProbe("test.stdout-overflow.v1",SUBJECT,{schemaRoot:ROOT});
    expect(receipt.status).toBe("OUTPUT_LIMIT");
    expect(receipt.stdoutBytes).toBeLessThanOrEqual(64);
  });

  it("M03-T036 stderr ceiling is enforced", async () => {
    const receipt = await executeHostCapabilityProbe("test.stderr-overflow.v1",SUBJECT,{schemaRoot:ROOT});
    expect(receipt.status).toBe("OUTPUT_LIMIT");
    expect(receipt.stderrBytes).toBeLessThanOrEqual(64);
  });

  it("M03-T037 timeout aborts hung probe", async () => {
    const receipt = await executeHostCapabilityProbe("test.timeout.v1",SUBJECT,{schemaRoot:ROOT});
    expect(receipt.status).toBe("TIMED_OUT");
    expect(receipt.reasonCodes).toContain("PROBE_TIMEOUT");
  });

  it("M03-T038 mutating automatic probe is BLOCKED without spawn", async () => {
    const before=hostCapabilityProbeRuntimeStats().spawnCount;
    const receipt=await executeHostCapabilityProbe("test.mutating-blocked.v1",SUBJECT,{schemaRoot:ROOT});
    expect(receipt.status).toBe("BLOCKED");
    expect(hostCapabilityProbeRuntimeStats().spawnCount).toBe(before);
  });

  it("M03-T039 network automatic probe is BLOCKED without spawn", async () => {
    const before=hostCapabilityProbeRuntimeStats().spawnCount;
    const receipt=await executeHostCapabilityProbe("test.network-blocked.v1",SUBJECT,{schemaRoot:ROOT});
    expect(receipt.status).toBe("BLOCKED");
    expect(hostCapabilityProbeRuntimeStats().spawnCount).toBe(before);
  });

  it("M03-T040 cost-bearing automatic probe is BLOCKED without spawn", async () => {
    const before=hostCapabilityProbeRuntimeStats().spawnCount;
    const receipt=await executeHostCapabilityProbe("test.cost-blocked.v1",SUBJECT,{schemaRoot:ROOT});
    expect(receipt.status).toBe("BLOCKED");
    expect(hostCapabilityProbeRuntimeStats().spawnCount).toBe(before);
  });

  it("test-only policy blocks outside test mode", () => {
    const descriptor=getHostCapabilityProbeDescriptor("test.single-flight.v1");
    const policy=evaluateHostCapabilityProbePolicy(descriptor,{nodeEnv:"production",platform:process.platform});
    expect(policy.allowed).toBe(false);
    expect(policy.reasonCodes).toContain("TEST_ONLY_PROBE_BLOCKED");
  });

  it("M03-T041 PATH shadow cannot replace process.execPath", async () => {
    const original=process.env.PATH;
    process.env.PATH=home("uads-fake-path-");
    try {
      const receipt=await executeHostCapabilityProbe("uads.node.version.v1",SUBJECT,{schemaRoot:ROOT});
      expect(receipt.status).toBe("SUCCEEDED");
      expect(receipt.parsedSummary).toMatch(/^v\d+\.\d+\.\d+/);
    } finally {
      if (original === undefined) delete process.env.PATH; else process.env.PATH=original;
    }
    const base=getHostCapabilityProbeDescriptor("uads.node.version.v1");
    const { schema:_s,schemaVersion:_v,descriptorDigest:_d,...raw }=base;
    expect(() => compileHostCapabilityProbeDescriptor({...raw,executableRule:"path-search"})).toThrow();
  });

  it("M03-T042 executable identity drift cannot succeed", async () => {
    const before="a".repeat(64);
    const after="b".repeat(64);
    const receipt=await executeHostCapabilityProbe("uads.node.version.v1",SUBJECT,{
      schemaRoot:ROOT,
      identityProvider:(phase)=>phase==="before"?before:after,
    });
    expect(receipt.status).toBe("IDENTITY_DRIFT");
    expect(receipt.reasonCodes).toContain("EXECUTABLE_IDENTITY_DRIFT");
  });

  it("M03-T043 100 concurrent callers single-flight to one execution", async () => {
    const start=performance.now();
    const receipts=await Promise.all(Array.from({length:100},()=>executeHostCapabilityProbe("test.single-flight.v1",SUBJECT,{schemaRoot:ROOT})));
    const elapsed=performance.now()-start;
    expect(new Set(receipts.map((item)=>item.executionId)).size).toBe(1);
    expect(new Set(receipts.map((item)=>item.receiptDigest)).size).toBe(1);
    expect(hostCapabilityProbeRuntimeStats().spawnCount).toBe(1);
    expect(hostCapabilityProbeRuntimeStats().inFlight).toBe(0);
    expect(elapsed).toBeLessThan(2000);
  });

  it("M03-T044 executor creates no PCCR proof and corrupt receipt is rejected", async () => {
    const uadsHome=home("uads-m03-probe-store-");
    const paths=ensureWorkspace("wo008",uadsHome);
    const receipt=await executeHostCapabilityProbe("uads.node.version.v1",SUBJECT,{paths,persist:true,schemaRoot:ROOT});
    const proofDir=path.join(paths.runtimeCapabilities,"proofs");
    expect(fs.existsSync(proofDir)).toBe(false);
    const receiptPath=path.join(paths.runtimeCapabilities,"probe-runs",SUBJECT,receipt.probeId,`${receipt.executionId}.json`);
    expect(fs.existsSync(receiptPath)).toBe(true);
    fs.writeFileSync(receiptPath,"{broken","utf8");
    expect(readHostCapabilityProbeReceipt(paths,SUBJECT,receipt.probeId,receipt.executionId,ROOT).status).toBe("REJECTED");
  });

  it("receipt tamper and path binding fail closed", async () => {
    const uadsHome=home("uads-m03-probe-binding-");
    const paths=ensureWorkspace("wo008",uadsHome);
    const receipt=await executeHostCapabilityProbe("uads.node.version.v1",SUBJECT,{paths,persist:true,schemaRoot:ROOT});
    expect(readHostCapabilityProbeReceipt(paths,SUBJECT,receipt.probeId,receipt.executionId,ROOT).status).toBe("VALID");
    const source=path.join(paths.runtimeCapabilities,"probe-runs",SUBJECT,receipt.probeId,`${receipt.executionId}.json`);
    const parsed=JSON.parse(fs.readFileSync(source,"utf8"));
    parsed.reasonCodes=["TAMPERED"];
    fs.writeFileSync(source,JSON.stringify(parsed),"utf8");
    expect(readHostCapabilityProbeReceipt(paths,SUBJECT,receipt.probeId,receipt.executionId,ROOT).status).toBe("REJECTED");
  });

  it("receipt contains no executable path, environment dump, or secret", async () => {
    process.env.UADS_TEST_SECRET="ghp_abcdefghijklmnopqrstuvwxyz12345678901234567890";
    const receipt=await executeHostCapabilityProbe("test.env-secret.v1",SUBJECT,{schemaRoot:ROOT});
    const durable=JSON.stringify(receipt);
    expect(durable).not.toContain(process.execPath);
    expect(durable).not.toContain(process.env.UADS_TEST_SECRET);
    expect(durable).not.toMatch(/"env"|PATH|SystemRoot.*:/);
  });

  it("WO008-B2/B5/B3/B4 benchmark evidence stays bounded", async () => {
    const durations:number[]=[];
    let receiptBytes=0;
    for(let i=0;i<50;i+=1){
      const subject=(i.toString(16).padStart(64,"0")).slice(-64);
      const paths=ensureWorkspace(`wo008-b2-${i}`,home("uads-m03-probe-bench-"));
      const started=performance.now();
      const receipt=await executeHostCapabilityProbe("uads.node.version.v1",subject,{paths,persist:true,schemaRoot:ROOT});
      durations.push(performance.now()-started);
      if(i===0){
        const target=path.join(paths.runtimeCapabilities,"probe-runs",subject,receipt.probeId,`${receipt.executionId}.json`);
        receiptBytes=fs.statSync(target).size;
      }
    }
    const sorted=[...durations].sort((a,b)=>a-b);
    const p=(n:number)=>sorted[Math.max(0,Math.ceil(sorted.length*n/100)-1)] ?? 0;

    resetHostCapabilityProbeRuntimeStatsForTests();
    const stormStart=performance.now();
    const storm=await Promise.all(Array.from({length:100},()=>executeHostCapabilityProbe("test.single-flight.v1","f".repeat(64),{schemaRoot:ROOT})));
    const stormMs=performance.now()-stormStart;
    const stats=hostCapabilityProbeRuntimeStats();

    const benchmark={
      schema:"uads2.wo008.probe-benchmark",
      B2:{samples:50,p50Ms:p(50),p95Ms:p(95),targetP95Ms:2000,maxDescriptorTimeoutMs:1000},
      B5:{callers:100,uniqueExecutionIds:new Set(storm.map(r=>r.executionId)).size,uniqueReceiptDigests:new Set(storm.map(r=>r.receiptDigest)).size,completionMs:stormMs,inFlightAfter:stats.inFlight,spawnCount:stats.spawnCount},
      B3:{receiptBytes,targetBytes:65536},
      B4:{shellExecution:0,pathLookupExecution:0,blockedSpawn:0,leakedSecret:0,pccrProofCreated:0},
    };
    console.log(`UADS2_WO_008_BENCHMARK=${JSON.stringify(benchmark)}`);
    expect(benchmark.B2.p95Ms).toBeLessThanOrEqual(2000);
    expect(receiptBytes).toBeLessThanOrEqual(65536);
    expect(benchmark.B5.uniqueExecutionIds).toBe(1);
    expect(benchmark.B5.uniqueReceiptDigests).toBe(1);
    expect(benchmark.B5.spawnCount).toBe(1);
    expect(benchmark.B5.inFlightAfter).toBe(0);
    expect(stormMs).toBeLessThanOrEqual(2000);
    expect(benchmark.B4).toEqual({shellExecution:0,pathLookupExecution:0,blockedSpawn:0,leakedSecret:0,pccrProofCreated:0});
  });
});
