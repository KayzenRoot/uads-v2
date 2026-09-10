import http from "node:http";
import { URL } from "node:url";
import { computeProjectFingerprint } from "../lib/fingerprint.js";
import { readGitSummary } from "../lib/git.js";
import { redactHostPaths } from "../lib/secrets.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import { ensureWorkspace, type UadsPaths } from "../lib/workspace.js";
import { runStatus } from "./status.js";
import {
  DEFAULT_OPERATIONAL_EVENT_LIMIT,
  MAX_OPERATIONAL_EVENT_LIMIT,
  computeB001AnalysisMetrics,
  readOperationalEvents,
  subscribeOperationalEvents,
} from "../kernel/operational-events.js";
import {
  DEFAULT_OBSERVABILITY_LIMITS,
  evaluateStreamBackpressure,
} from "../kernel/operational-budget.js";
import {
  buildLivingCockpitProjection,
  type CockpitStreamState,
  type LivingCockpitProjection,
} from "../kernel/operational-cockpit.js";
import type { OperationalContinuityEvidence } from "../kernel/operational-continuity.js";
import { sanitizeCorrelationLabel } from "../kernel/operational-correlation.js";
import type {
  OperationalEvent,
  OperationalEventRead,
  OperationalHealth,
} from "../kernel/operational-event-types.js";

const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_DASHBOARD_PORT = 8765;
export const MAX_SSE_CLIENTS = 8;
const SSE_HEARTBEAT_MS = 15_000;
const SSE_POLL_MS = 1_000;
/** Backpressure firewall: a client buffering beyond this bound is dropped as a slow client. */
const MAX_SSE_CLIENT_BUFFER_BYTES = DEFAULT_OBSERVABILITY_LIMITS.maxSseClientBufferBytes;

type DashboardSnapshot = {
  schema: "uads.dashboard-snapshot";
  schemaVersion: "1.0.0";
  generatedAt: string;
  projectId: string;
  health: OperationalHealth;
  eventCounts: { total: number; byType: Record<string, number> };
  latestActivity: OperationalEvent | null;
  recentErrors: OperationalEvent[];
  recentDiagnostics: OperationalEvent[];
  b001: ReturnType<typeof computeB001AnalysisMetrics>;
  cockpit: LivingCockpitProjection;
  uadsStatus: Record<string, unknown>;
};

function projectPaths(cwd: string, uadsHome?: string): { projectId: string; paths: UadsPaths } {
  const git = readGitSummary(cwd);
  const repoRoot = git.repoRoot ?? cwd;
  const fingerprint = computeProjectFingerprint({ originUrl: git.originUrl, repoRoot });
  return { projectId: fingerprint.projectId, paths: ensureWorkspace(fingerprint.projectId, uadsHome) };
}

function sanitizeDashboardValue<T>(value: T): T {
  const sanitized = sanitizeOperationalValue(value);
  if (typeof sanitized === "string") {
    return redactHostPaths(sanitized) as T;
  }
  if (Array.isArray(sanitized)) {
    return sanitized.map((item) => sanitizeDashboardValue(item)) as T;
  }
  if (sanitized && typeof sanitized === "object") {
    return Object.fromEntries(Object.entries(sanitized as Record<string, unknown>).map(([key, item]) => [key, sanitizeDashboardValue(item)])) as T;
  }
  return sanitized;
}

function defaultStreamState(): CockpitStreamState {
  return {
    activeClients: 0,
    maxClients: MAX_SSE_CLIENTS,
    bufferLimitBytes: MAX_SSE_CLIENT_BUFFER_BYTES,
    slowClientDrops: 0,
    lastDropReasonCode: null,
    reconnects: 0,
    replayActive: false,
    lastResumeState: null,
  };
}

/**
 * Continuity evidence derived from bounded reader output only.
 *
 * The bounded reader reports rejected records and scan-window saturation as
 * distinct evidence: rejected records stay GAP_KNOWN, while a saturated scan
 * surfaces as GAP_UNKNOWN instead of silently collapsing into a known gap or
 * a contiguous state.
 */
function deriveContinuityEvidence(read: OperationalEventRead): OperationalContinuityEvidence {
  return {
    observedEventCount: read.health.validEventCount,
    rejectedRecordCount: read.health.rejectedEventCount,
    scanSaturated: read.health.scanSaturated,
    replayActive: false,
    baselineEstablished: read.health.validEventCount > 0 || read.health.lastEventAt !== null,
  };
}

function buildCockpitProjectionFor(
  projectId: string,
  read: OperationalEventRead,
  generatedAt: string,
  stream: CockpitStreamState,
): LivingCockpitProjection {
  return buildLivingCockpitProjection({
    projectId,
    health: read.health,
    observedEvents: read.events,
    continuityEvidence: deriveContinuityEvidence(read),
    generatedAt,
    activeClients: stream.activeClients,
    maxClients: stream.maxClients,
    bufferLimitBytes: stream.bufferLimitBytes,
    slowClientDrops: stream.slowClientDrops,
    lastDropReasonCode: stream.lastDropReasonCode,
    reconnects: stream.reconnects,
    replayActive: stream.replayActive,
    lastResumeState: stream.lastResumeState,
  });
}

/** Read-only Living Cockpit projection over the current bounded evidence window. */
export function buildCockpitSnapshot(
  cwd = process.cwd(),
  uadsHome?: string,
  stream: CockpitStreamState = defaultStreamState(),
): LivingCockpitProjection {
  const { projectId, paths } = projectPaths(cwd, uadsHome);
  const read = readOperationalEvents(paths, { limit: MAX_OPERATIONAL_EVENT_LIMIT });
  return buildCockpitProjectionFor(projectId, read, new Date().toISOString(), stream);
}

export function buildDashboardSnapshot(
  cwd = process.cwd(),
  uadsHome?: string,
  stream: CockpitStreamState = defaultStreamState(),
): DashboardSnapshot {
  const { projectId, paths } = projectPaths(cwd, uadsHome);
  const read = readOperationalEvents(paths, { limit: MAX_OPERATIONAL_EVENT_LIMIT });
  const generatedAt = new Date().toISOString();
  const byType: Record<string, number> = {};
  for (const event of read.events) {
    byType[event.eventType] = (byType[event.eventType] ?? 0) + 1;
  }
  const recentErrors = read.events.filter((event) => event.eventType === "system.error" || event.severity === "error" || event.severity === "critical").slice(0, 20);
  const recentDiagnostics = read.events.filter((event) => event.eventType === "system.diagnostic").slice(0, 20);
  let uadsStatus: Record<string, unknown> = {};
  try {
    uadsStatus = JSON.parse(runStatus(cwd, { uadsHome, json: true })) as Record<string, unknown>;
  } catch {
    uadsStatus = { status: "UNAVAILABLE", reason: "UADS_STATUS_UNAVAILABLE" };
  }
  return sanitizeDashboardValue({
    schema: "uads.dashboard-snapshot",
    schemaVersion: "1.0.0",
    generatedAt,
    projectId,
    health: read.health,
    eventCounts: { total: read.health.validEventCount, byType },
    latestActivity: read.events[0] ?? null,
    recentErrors,
    recentDiagnostics,
    b001: computeB001AnalysisMetrics(read.events),
    cockpit: buildCockpitProjectionFor(projectId, read, generatedAt, stream),
    uadsStatus,
  });
}

function jsonResponse(res: http.ServerResponse, status: number, value: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(value)}\n`);
}

function applySecurityHeaders(res: http.ServerResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
}

const DASHBOARD_BASE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>UADS Operator</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#07111f;color:#d9e7f5}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0,#123050 0,#07111f 42%,#050a12 100%);min-height:100vh}.wrap{max-width:1180px;margin:auto;padding:32px 22px}.top{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:24px}.eyebrow{color:#63d5ff;letter-spacing:.18em;font-size:11px;text-transform:uppercase}.title{font-size:32px;margin:6px 0 0}.health{border:1px solid #2e5872;border-radius:14px;padding:14px 18px;min-width:170px}.health b{display:block;font-size:20px;margin-top:4px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.panel{background:rgba(11,26,43,.88);border:1px solid #21435c;border-radius:14px;padding:18px;box-shadow:0 12px 38px #02060b66}.wide{grid-column:span 2}.label{color:#83a9c1;font-size:12px;text-transform:uppercase;letter-spacing:.08em}.value{font-size:24px;margin-top:8px}.mono{font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px;word-break:break-word}.list{display:grid;gap:8px;margin-top:12px}.item{border-left:2px solid #2a91bd;padding:8px 10px;background:#091827}.muted{color:#83a9c1}.state-HEALTHY{color:#5be0a1}.state-DEGRADED{color:#ffd166}.state-UNAVAILABLE{color:#ff8b8b}@media(max-width:760px){.top{display:block}.health{margin-top:16px}.grid{grid-template-columns:1fr 1fr}.wide{grid-column:span 2}}@media(max-width:480px){.grid{grid-template-columns:1fr}.wide{grid-column:span 1}}
</style></head><body><main class="wrap"><div class="top"><div><div class="eyebrow">UADS V2 / M30</div><h1 class="title">Operator dashboard</h1><div id="project" class="muted mono">Loading objective state…</div></div><div class="health"><span class="label">M30 health</span><b id="health">UNAVAILABLE</b></div></div>
<section class="grid"><div class="panel"><div class="label">Events</div><div id="events" class="value">UNAVAILABLE</div></div><div class="panel"><div class="label">B-001 denominator</div><div id="denominator" class="value">UNAVAILABLE</div></div><div class="panel"><div class="label">B-001 duplicate rate</div><div id="rate" class="value">UNAVAILABLE</div></div><div class="panel"><div class="label">Stream</div><div id="stream" class="value">CONNECTING</div></div><div class="panel wide"><div class="label">Work Order and correlation</div><div id="identity" class="list"><div class="muted">UNAVAILABLE</div></div></div><div class="panel wide"><div class="label">Existing UADS status</div><div id="uads-status" class="list"><div class="muted">UNAVAILABLE</div></div></div><div class="panel wide"><div class="label">Latest activity</div><div id="latest" class="list"><div class="muted">UNAVAILABLE</div></div></div><div class="panel wide"><div class="label">Recent errors and diagnostics</div><div id="issues" class="list"><div class="muted">UNAVAILABLE</div></div></div></section></main>
<script>
const esc=(v)=>String(v??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const renderEvent=(e)=>e?'<div class="item"><div>'+esc(e.eventType)+' <span class="muted">'+esc(e.severity)+'</span></div><div class="mono muted">'+esc(e.message||e.sourceComponent)+' · '+esc(e.recordedAt)+'</div></div>':'<div class="muted">UNAVAILABLE</div>';
const field=(label,value)=>'<div class="item"><span class="muted">'+esc(label)+'</span><div class="mono">'+esc(value===null||value===undefined||value===''?'UNAVAILABLE':value)+'</div></div>';
function render(s){document.querySelector('#health').textContent=s.health.status;document.querySelector('#health').className='state-'+s.health.status;document.querySelector('#project').textContent='project '+s.projectId;document.querySelector('#events').textContent=String(s.eventCounts.total);document.querySelector('#denominator').textContent=s.b001.denominator?String(s.b001.denominator):'UNAVAILABLE';document.querySelector('#rate').textContent=s.b001.rate===null?'UNAVAILABLE':(s.b001.rate*100).toFixed(2)+'%';const latest=s.latestActivity;document.querySelector('#identity').innerHTML=[['Work Order ID',latest?.workOrderId],['Correlation ID',latest?.correlationId],['Execution Run ID',latest?.executionRunId]].map(([label,value])=>field(label,value)).join('');const status=s.uadsStatus||{};document.querySelector('#uads-status').innerHTML=[['Phase',status.phase],['Next action',status.nextAction],['Working tree',status.workingTree],['Cost budget',status.costBudgetStatus],['Model routing',status.modelRoutingStatus],['Specialist selection',status.specialistSelectionStatus]].map(([label,value])=>field(label,value)).join('');document.querySelector('#latest').innerHTML=renderEvent(latest);const all=[...(s.recentErrors||[]),...(s.recentDiagnostics||[])].slice(0,8);document.querySelector('#issues').innerHTML=all.length?all.map(renderEvent).join(''):'<div class="muted">UNAVAILABLE</div>'}
fetch('/api/snapshot').then(r=>r.json()).then(render).catch(()=>{});const stream=new EventSource('/api/stream');stream.onopen=()=>document.querySelector('#stream').textContent='CONNECTED';stream.onerror=()=>document.querySelector('#stream').textContent='DEGRADED';stream.addEventListener('operational',()=>fetch('/api/snapshot').then(r=>r.json()).then(render).catch(()=>{}));
</script></body></html>`;

const COCKPIT_CSS = ".state-CURRENT{color:#5be0a1}.state-STALE{color:#ffd166}.state-UNKNOWN{color:#83a9c1}";

const COCKPIT_SECTION = '<section class="grid" style="margin-top:12px"><div class="panel wide"><div class="label">Truth cockpit</div><div id="cockpit" class="list"><div class="muted">UNAVAILABLE</div></div></div><div class="panel"><div class="label">Freshness</div><div id="freshness" class="list"><div class="muted">UNAVAILABLE</div></div></div><div class="panel"><div class="label">Continuity</div><div id="continuity" class="list"><div class="muted">UNAVAILABLE</div></div></div><div class="panel"><div class="label">Observability pressure</div><div id="pressure" class="list"><div class="muted">UNAVAILABLE</div></div></div><div class="panel"><div class="label">Capability (M03)</div><div id="capability" class="list"><div class="muted">UNAVAILABLE</div></div></div><div class="panel"><div class="label">Economic (M07 / M24)</div><div id="economic" class="list"><div class="muted">UNAVAILABLE</div></div></div><div class="panel wide"><div class="label">Bounded realtime stream</div><div id="stream-facts" class="list"><div class="muted">UNAVAILABLE</div></div></div></section>';

const COCKPIT_SCRIPT = `
(function(){
const f=(l,v)=>'<div class="item"><span class="muted">'+esc(l)+'</span><div class="mono">'+esc(v===null||v===undefined||v===''?'UNAVAILABLE':v)+'</div></div>';
const rows=(list)=>list.map((pair)=>f(pair[0],pair[1])).join('');
const paint=(c)=>{const g=(c&&c.globalHealth)||{};const fr=(c&&c.freshness)||{};const co=(c&&c.continuity)||{};const pr=(c&&c.pressure)||{};const cap=(c&&c.capability)||{};const ec=(c&&c.economic)||{};const st=(c&&c.stream)||{};
document.querySelector('#cockpit').innerHTML=rows([['Global truth',g.status],['Reasons',(g.reasonCodes||[]).join(', ')],['Projection class',c&&c.truthClass],['Projection version',c&&c.projectionVersion]])+(g.sources||[]).map((s)=>f(s.sourceId+' ['+s.truthClass+']',s.truthState+' - '+s.reasonCode)).join('');
document.querySelector('#freshness').innerHTML=rows([['State',fr.truthState],['Lease ms',fr.freshnessLeaseMs],['Observed at',fr.observedAt],['Evaluated at',fr.evaluatedAt],['Age ms',fr.value?fr.value.ageMs:null],['Continuity',fr.continuityState],['Reason',fr.reasonCode]]);
document.querySelector('#continuity').innerHTML=rows([['State',co.state],['Reason',co.reasonCode],['Known gaps',co.knownGapCount],['Unresolved gap',co.unresolvedGap],['Replay active',co.replayActive]]);
document.querySelector('#pressure').innerHTML=rows([['State',pr.state],['Utilization',pr.utilization],['Retained',(pr.retainedClasses||[]).join(', ')],['Shed',(pr.shedClasses||[]).join(', ')],['Dropped series',pr.droppedSeries],['Bounded keys',pr.boundedKeys]]);
document.querySelector('#capability').innerHTML=rows([['State',cap.truthState],['Reason',cap.reasonCode],['Adapters',(cap.adapters||[]).length]]);
document.querySelector('#economic').innerHTML=rows([['State',ec.truthState],['Reason',ec.reasonCode],['Owner modules',(ec.sourceOwnerModules||[]).join(', ')],['Value',ec.value]]);
document.querySelector('#stream-facts').innerHTML=rows([['Active clients',st.activeClients],['Max clients',st.maxClients],['Slow client drops',st.slowClientDrops],['Reconnects',st.reconnects],['Resume state',st.lastResumeState],['Replay active',st.replayActive]]);};
let pending=false;
const loadCockpit=()=>{if(pending){return;}pending=true;setTimeout(()=>{pending=false;fetch('/api/cockpit').then((r)=>r.json()).then(paint).catch(()=>{});},750);};
loadCockpit();
stream.addEventListener('operational',loadCockpit);
stream.addEventListener('stream.gap',()=>{document.querySelector('#stream').textContent='GAP_KNOWN';loadCockpit();});
stream.addEventListener('stream.resumed',()=>{document.querySelector('#stream').textContent='RESUMED';loadCockpit();});
})();
`;

const DASHBOARD_HTML = DASHBOARD_BASE_HTML
  .replace("</style>", COCKPIT_CSS + "</style>")
  .replace("</section></main>", "</section>" + COCKPIT_SECTION + "</main>")
  .replace("</script>", COCKPIT_SCRIPT + "</script>");

export type DashboardServerOptions = { cwd?: string; uadsHome?: string; host?: string; port?: number };

export class DashboardServer {
  private readonly cwd: string;
  private readonly uadsHome?: string;
  private readonly host: string;
  private readonly port: number;
  private readonly paths: UadsPaths;
  private readonly server: http.Server;
  private readonly clients = new Set<http.ServerResponse>();
  private readonly announcedEventIds = new Set<string>();
  private slowClientDrops = 0;
  private lastDropReasonCode: string | null = null;
  private reconnects = 0;
  private lastResumeState: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private poller: NodeJS.Timeout | null = null;

  constructor(options: DashboardServerOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.uadsHome = options.uadsHome;
    this.host = options.host ?? LOOPBACK_HOST;
    this.port = options.port ?? DEFAULT_DASHBOARD_PORT;
    if (this.host !== LOOPBACK_HOST) {
      throw new Error(`dashboard binding rejected; only ${LOOPBACK_HOST} is allowed`);
    }
    if (!Number.isInteger(this.port) || this.port < 0 || this.port > 65_535) {
      throw new Error("dashboard port must be an integer between 0 and 65535");
    }
    this.paths = projectPaths(this.cwd, this.uadsHome).paths;
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  start(): Promise<{ host: string; port: number; url: string }> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => {
        this.server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off("error", onError);
        const address = this.server.address();
        const port = typeof address === "object" && address ? address.port : this.port;
        for (const event of readOperationalEvents(this.paths, { limit: MAX_OPERATIONAL_EVENT_LIMIT }).events) {
          this.announcedEventIds.add(event.eventId);
        }
        this.unsubscribe = subscribeOperationalEvents(this.paths, (event) => this.broadcast(event));
        this.heartbeat = setInterval(() => {
          for (const client of this.clients) {
            this.safeWrite(client, `: heartbeat ${Date.now()}\n\n`);
          }
        }, SSE_HEARTBEAT_MS);
        this.poller = setInterval(() => this.pollPersistedEvents(), SSE_POLL_MS);
        resolve({ host: LOOPBACK_HOST, port, url: `http://${LOOPBACK_HOST}:${port}/` });
      };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(this.port, this.host);
    });
  }

  stop(): Promise<void> {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();
    return new Promise((resolve) => {
      if (!this.server.listening) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
  }

  private streamState(): CockpitStreamState {
    return {
      activeClients: this.clients.size,
      maxClients: MAX_SSE_CLIENTS,
      bufferLimitBytes: MAX_SSE_CLIENT_BUFFER_BYTES,
      slowClientDrops: this.slowClientDrops,
      lastDropReasonCode: this.lastDropReasonCode,
      reconnects: this.reconnects,
      replayActive: false,
      lastResumeState: this.lastResumeState,
    };
  }

  /**
   * Bounded SSE write. A client whose socket buffer exceeds the firewall is
   * dropped and counted instead of accumulating unbounded buffered work.
   */
  private safeWrite(client: http.ServerResponse, payload: string): boolean {
    if (client.destroyed || client.writableEnded) {
      this.clients.delete(client);
      return false;
    }
    const backpressure = evaluateStreamBackpressure({
      bufferedBytes: client.writableLength,
      limitBytes: MAX_SSE_CLIENT_BUFFER_BYTES,
    });
    if (backpressure.drop) {
      this.slowClientDrops += 1;
      this.lastDropReasonCode = backpressure.reasonCode;
      this.clients.delete(client);
      client.destroy();
      return false;
    }
    client.write(payload);
    return true;
  }

  private frame(event: OperationalEvent): string {
    return `id: ${event.eventId}\nevent: operational\ndata: ${JSON.stringify(event)}\n\n`;
  }

  private broadcast(event: OperationalEvent): void {
    if (this.announcedEventIds.has(event.eventId)) {
      return;
    }
    this.announcedEventIds.add(event.eventId);
    const payload = this.frame(event);
    for (const client of this.clients) {
      this.safeWrite(client, payload);
    }
  }

  private pollPersistedEvents(): void {
    try {
      const events = readOperationalEvents(this.paths, { limit: MAX_OPERATIONAL_EVENT_LIMIT }).events.reverse();
      for (const event of events) {
        if (!this.announcedEventIds.has(event.eventId)) {
          this.broadcast(event);
        }
      }
      if (this.announcedEventIds.size > MAX_OPERATIONAL_EVENT_LIMIT * 2) {
        const current = new Set(events.map((event) => event.eventId));
        for (const eventId of this.announcedEventIds) {
          if (!current.has(eventId)) {
            this.announcedEventIds.delete(eventId);
          }
        }
      }
    } catch {
      // The next snapshot remains authoritative and exposes degraded state.
    }
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    applySecurityHeaders(res);
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      jsonResponse(res, 405, { error: "method-not-allowed" });
      return;
    }
    const url = new URL(req.url ?? "/", `http://${LOOPBACK_HOST}`);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(DASHBOARD_HTML);
      return;
    }
    if (url.pathname === "/api/snapshot") {
      jsonResponse(res, 200, buildDashboardSnapshot(this.cwd, this.uadsHome, this.streamState()));
      return;
    }
    if (url.pathname === "/api/cockpit") {
      jsonResponse(res, 200, buildCockpitSnapshot(this.cwd, this.uadsHome, this.streamState()));
      return;
    }
    if (url.pathname === "/api/events") {
      const requested = Number(url.searchParams.get("limit") ?? DEFAULT_OPERATIONAL_EVENT_LIMIT);
      const limit = Number.isFinite(requested) ? Math.max(1, Math.min(MAX_OPERATIONAL_EVENT_LIMIT, Math.floor(requested))) : DEFAULT_OPERATIONAL_EVENT_LIMIT;
      const read = readOperationalEvents(this.paths, { limit });
      jsonResponse(res, 200, { schema: "uads.operational-events", schemaVersion: "1.0.0", health: read.health, events: read.events });
      return;
    }
    if (url.pathname === "/api/stream") {
      this.openStream(req, res);
      return;
    }
    jsonResponse(res, 404, { error: "not-found" });
  }

  private openStream(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (this.clients.size >= MAX_SSE_CLIENTS) {
      res.setHeader("Retry-After", "5");
      jsonResponse(res, 503, { error: "sse-client-limit" });
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    this.clients.add(res);
    res.write("retry: 5000\n\n");
    const url = new URL(req.url ?? "/api/stream", `http://${LOOPBACK_HOST}`);
    const requestedCursor = req.headers["last-event-id"] ?? url.searchParams.get("cursor");
    const cursor = typeof requestedCursor === "string" && requestedCursor.length > 0 ? requestedCursor : null;
    const bounded = readOperationalEvents(this.paths, { limit: MAX_OPERATIONAL_EVENT_LIMIT }).events.reverse();
    if (!cursor) {
      this.lastResumeState = "REPLAY_BOUNDED";
      for (const event of bounded) {
        this.safeWrite(res, this.frame(event));
      }
    } else {
      const safeCursor = sanitizeCorrelationLabel(cursor, 64).value;
      this.reconnects += 1;
      const cursorIndex = bounded.findIndex((event) => event.eventId === cursor);
      if (cursorIndex >= 0) {
        this.lastResumeState = "RESUMED_FROM_CURSOR";
        this.safeWrite(res, `event: stream.resumed\ndata: ${JSON.stringify({ resumeState: "RESUMED_FROM_CURSOR", cursor: safeCursor, delivered: bounded.length - cursorIndex - 1 })}\n\n`);
        for (const event of bounded.slice(cursorIndex + 1)) {
          this.safeWrite(res, this.frame(event));
        }
      } else {
        this.lastResumeState = "GAP_KNOWN";
        this.safeWrite(res, `event: stream.gap\ndata: ${JSON.stringify({ resumeState: "GAP_KNOWN", reason: "CURSOR_OUTSIDE_BOUNDED_WINDOW", cursor: safeCursor, boundedWindow: bounded.length })}\n\n`);
        for (const event of bounded) {
          this.safeWrite(res, this.frame(event));
        }
      }
    }
    const cleanup = () => this.clients.delete(res);
    res.on("close", cleanup);
    req.socket?.on("close", cleanup);
  }
}

export function createDashboardServer(options: DashboardServerOptions = {}): DashboardServer {
  return new DashboardServer(options);
}

export function runDashboardStatusCommand(options: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  const snapshot = buildDashboardSnapshot(options.cwd ?? process.cwd(), options.uadsHome);
  return options.json ? `${JSON.stringify(snapshot, null, 2)}\n` : [
    "UADS M30 dashboard status",
    `projectId: ${snapshot.projectId}`,
    `health: ${snapshot.health.status}`,
    `validEvents: ${snapshot.health.validEventCount}`,
    `invalidEvents: ${snapshot.health.invalidEventCount}`,
    `lastEventAt: ${snapshot.health.lastEventAt ?? "UNAVAILABLE"}`,
    `b001Denominator: ${snapshot.b001.denominator}`,
    `b001DuplicateRate: ${snapshot.b001.rate === null ? "UNAVAILABLE" : snapshot.b001.rate}`,
    "",
  ].join("\n");
}

export function runDashboardEventsCommand(options: { cwd?: string; uadsHome?: string; limit?: number; json?: boolean } = {}): string {
  const { paths } = projectPaths(options.cwd ?? process.cwd(), options.uadsHome);
  const requested = options.limit ?? DEFAULT_OPERATIONAL_EVENT_LIMIT;
  const limit = Math.max(1, Math.min(MAX_OPERATIONAL_EVENT_LIMIT, Math.floor(requested)));
  const read = readOperationalEvents(paths, { limit });
  if (options.json) {
    return `${JSON.stringify({ health: read.health, events: read.events }, null, 2)}\n`;
  }
  return [
    `M30 events (${read.events.length}/${read.health.validEventCount})`,
    ...read.events.map((event) => `${event.recordedAt} ${event.severity} ${event.eventType} ${event.eventId}`),
    "",
  ].join("\n");
}

export async function runDashboardStartCommand(options: DashboardServerOptions = {}): Promise<void> {
  const dashboard = createDashboardServer(options);
  const address = await dashboard.start();
  process.stdout.write(`UADS dashboard listening at ${address.url}\n`);
  await new Promise<void>((resolve) => {
    const shutdown = () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      void dashboard.stop().finally(resolve);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
