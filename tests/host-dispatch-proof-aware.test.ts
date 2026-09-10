import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { installHostAdapter } from "../src/adapters/host-adapter-install.js";
import {
  prepareHostDispatchBundle,
  readCurrentHostDispatchArtifacts,
} from "../src/adapters/host-dispatch.js";
import { buildPassiveHostCapabilityBridge } from "../src/adapters/host-capability-passive.js";
import type { HostAdapterId } from "../src/adapters/host-adapter-types.js";
import { runPlan } from "../src/kernel/orchestrator.js";
import { resolveProjectContext } from "../src/kernel/project-context.js";
import { readRuntimeCapabilitySnapshot } from "../src/kernel/model-runtime.js";
import { seedFrontend } from "./execution-helpers.js";
import { tempDirs } from "./helpers.js";

const ROOT=process.cwd();

function hostHome():string {
  return fs.mkdtempSync(path.join(os.tmpdir(),"uads-wo011-host-"));
}

function fixture(adapterId:HostAdapterId){
  const base=tempDirs();
  seedFrontend(base.repo);
  runPlan({
    cwd:base.repo,
    uadsHome:base.home,
    intake:{
      schema:"uads.intake",
      schemaVersion:"0.2.0",
      objective:"Change the primary button color.",
      domainSignals:["frontend"],
      affectedAreas:["src"],
      inScope:["src"],
      acceptanceCriteria:["the change is verified"],
      classifier:"host-structured",
    },
  });
  const host=hostHome();
  installHostAdapter(adapterId,{hostHome:host,uadsHome:base.home,packageRoot:ROOT},ROOT);
  return {...base,adapterId,host,context:resolveProjectContext(base.repo,base.home)};
}

function prepare(input:ReturnType<typeof fixture>){
  return prepareHostDispatchBundle({
    adapterId:input.adapterId,
    cwd:input.repo,
    uadsHome:input.home,
    hostHome:input.host,
    schemaRoot:ROOT,
  });
}

function values(bundle:ReturnType<typeof prepare>){
  return Object.values(bundle.hostCapabilities);
}

describe("UADS2-WO-011 M03 S06.1 proof-aware host dispatch",{timeout:120000},()=>{
  it("U011-T001 Cursor clean/present dispatch capabilities remain all UNKNOWN",()=>{
    const f=fixture("cursor");
    const bundle=prepare(f);
    expect(values(bundle).every(value=>value==="unknown")).toBe(true);
    expect(values(bundle)).not.toContain(true);
  });

  it("U011-T002 Codex clean/present dispatch capabilities remain all UNKNOWN",()=>{
    const f=fixture("codex");
    const bundle=prepare(f);
    expect(values(bundle).every(value=>value==="unknown")).toBe(true);
    expect(values(bundle)).not.toContain(true);
  });

  it("U011-T003 Generic exposes only exact negative subagent/parallel facts and zero TRUE",()=>{
    const f=fixture("generic-agent-skills");
    const bundle=prepare(f);
    expect(bundle.hostCapabilities.subagents).toBe(false);
    expect(bundle.hostCapabilities.parallelAgents).toBe(false);
    expect(values(bundle)).not.toContain(true);
    const others=Object.entries(bundle.hostCapabilities)
      .filter(([key])=>!["subagents","parallelAgents"].includes(key))
      .map(([,value])=>value);
    expect(others.every(value=>value==="unknown")).toBe(true);
  });

  it("U011-T004 all three adapters keep sequential role-cycling absent positive proof",()=>{
    for(const adapterId of ["cursor","codex","generic-agent-skills"] as const){
      const bundle=prepare(fixture(adapterId));
      expect(bundle.execution.parallel).toBe(false);
      expect(bundle.execution.roleDispatch).toBe("role-cycling");
      expect(bundle.execution.reasonCodes).toContain("SEQUENTIAL_FALLBACK");
      expect(bundle.execution.reasonCodes).toContain("ROLE_CYCLING_FALLBACK");
    }
  });

  it("U011-T005 passive subject and bundle bind the exact same target root digest",()=>{
    for(const adapterId of ["cursor","codex","generic-agent-skills"] as const){
      const f=fixture(adapterId);
      const bridge=buildPassiveHostCapabilityBridge({
        adapterId,
        detectionInput:{hostHome:f.host},
        persist:false,
        schemaRoot:ROOT,
      });
      const bundle=prepare(f);
      expect(bundle.hostTargetRootDigest).toBe(bridge.subject.targetRootDigest);
    }
  });

  it("U011-T006 dispatch persists compatibility snapshot but writes no PCCR proof directory",()=>{
    const f=fixture("generic-agent-skills");
    const bundle=prepare(f);
    const runtime=readRuntimeCapabilitySnapshot(f.context.paths,bundle.runtimeId,ROOT);
    expect(runtime.identityDigest).toBe(bundle.runtimeIdentityDigest);
    expect(runtime.capabilities).toEqual(bundle.hostCapabilities);
    expect(fs.existsSync(path.join(f.context.paths.runtimeCapabilities,"proofs"))).toBe(false);
  });

  it("U011-T007 root switch remains stale/fail-closed",()=>{
    const f=fixture("generic-agent-skills");
    const first=prepare(f);
    const other=hostHome();
    installHostAdapter("generic-agent-skills",{hostHome:other,uadsHome:f.home,packageRoot:ROOT},ROOT);
    expect(()=>prepareHostDispatchBundle({
      adapterId:"generic-agent-skills",
      cwd:f.repo,
      uadsHome:f.home,
      hostHome:other,
      schemaRoot:ROOT,
    })).not.toThrow();
    const second=prepareHostDispatchBundle({
      adapterId:"generic-agent-skills",
      cwd:f.repo,
      uadsHome:f.home,
      hostHome:other,
      schemaRoot:ROOT,
    });
    expect(second.hostTargetRootDigest).not.toBe(first.hostTargetRootDigest);
    expect(second.bundleDigest).not.toBe(first.bundleDigest);
  });

  it("U011-T008 bundle remains privacy-minimized",()=>{
    const f=fixture("cursor");
    const bundle=prepare(f);
    const text=JSON.stringify(bundle);
    expect(text).not.toContain(f.host);
    expect(text).not.toContain(f.home);
    expect(text).not.toMatch(/api.?key|private.?key|bearer/i);
  });

  it("U011-T009 host-dispatch source no longer calls runtimeSnapshotFromHostDetection",()=>{
    const source=fs.readFileSync(path.join(ROOT,"src","adapters","host-dispatch.ts"),"utf8");
    expect(source).not.toContain("runtimeSnapshotFromHostDetection");
    expect(source).toContain("buildPassiveHostCapabilityBridge");
  });

  it("U011-T010 same proof-aware host facts yield deterministic runtime identity",()=>{
    const f=fixture("codex");
    const one=readCurrentHostDispatchArtifacts({
      adapterId:"codex",cwd:f.repo,uadsHome:f.home,hostHome:f.host,schemaRoot:ROOT,
    });
    const two=readCurrentHostDispatchArtifacts({
      adapterId:"codex",cwd:f.repo,uadsHome:f.home,hostHome:f.host,schemaRoot:ROOT,
    });
    expect(one.hostRuntime.identityDigest).toBe(two.hostRuntime.identityDigest);
    expect(one.hostRuntime.capabilities).toEqual(two.hostRuntime.capabilities);
  });

  it("WO011 benchmark passive derivation is bounded",()=>{
    const f=fixture("generic-agent-skills");
    const durations:number[]=[];
    for(let i=0;i<100;i+=1){
      const start=performance.now();
      buildPassiveHostCapabilityBridge({
        adapterId:f.adapterId,
        detectionInput:{hostHome:f.host},
        persist:false,
        schemaRoot:ROOT,
      });
      durations.push(performance.now()-start);
    }
    const sorted=[...durations].sort((a,b)=>a-b);
    const p=(n:number)=>sorted[Math.max(0,Math.ceil(sorted.length*n/100)-1)]??0;
    const metrics={schema:"uads2.wo011.passive-dispatch-bridge",samples:100,p50Ms:p(50),p95Ms:p(95),targetP95Ms:25};
    console.log(`UADS2_WO_011_BENCHMARK=${JSON.stringify(metrics)}`);
    expect(metrics.p95Ms).toBeLessThanOrEqual(25);
  });
});
