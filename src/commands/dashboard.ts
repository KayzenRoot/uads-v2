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
import type { OperationalEvent, OperationalHealth } from "../kernel/operational-event-types.js";

const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_DASHBOARD_PORT = 8765;
const MAX_SSE_CLIENTS = 8;
const SSE_HEARTBEAT_MS = 15_000;
const SSE_POLL_MS = 1_000;

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

export function buildDashboardSnapshot(cwd = process.cwd(), uadsHome?: string): DashboardSnapshot {
  const { projectId, paths } = projectPaths(cwd, uadsHome);
  const read = readOperationalEvents(paths, { limit: MAX_OPERATIONAL_EVENT_LIMIT });
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
    generatedAt: new Date().toISOString(),
    projectId,
    health: read.health,
    eventCounts: { total: read.health.validEventCount, byType },
    latestActivity: read.events[0] ?? null,
    recentErrors,
    recentDiagnostics,
    b001: computeB001AnalysisMetrics(read.events),
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

const DASHBOARD_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>UADS Operator</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#07111f;color:#d9e7f5}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0,#123050 0,#07111f 42%,#050a12 100%);min-height:100vh}.wrap{max-width:1180px;margin:auto;padding:32px 22px}.top{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:24px}.eyebrow{color:#63d5ff;letter-spacing:.18em;font-size:11px;text-transform:uppercase}.title{font-size:32px;margin:6px 0 0}.health{border:1px solid #2e5872;border-radius:14px;padding:14px 18px;min-width:170px}.health b{display:block;font-size:20px;margin-top:4px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.panel{background:rgba(11,26,43,.88);border:1px solid #21435c;border-radius:14px;padding:18px;box-shadow:0 12px 38px #02060b66}.wide{grid-column:span 2}.label{color:#83a9c1;font-size:12px;text-transform:uppercase;letter-spacing:.08em}.value{font-size:24px;margin-top:8px}.mono{font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px;word-break:break-word}.list{display:grid;gap:8px;margin-top:12px}.item{border-left:2px solid #2a91bd;padding:8px 10px;background:#091827}.muted{color:#83a9c1}.state-HEALTHY{color:#5be0a1}.state-DEGRADED{color:#ffd166}.state-UNAVAILABLE{color:#ff8b8b}@media(max-width:760px){.top{display:block}.health{margin-top:16px}.grid{grid-template-columns:1fr 1fr}.wide{grid-column:span 2}}@media(max-width:480px){.grid{grid-template-columns:1fr}.wide{grid-column:span 1}}
</style></head><body><main class="wrap"><div class="top"><div><div class="eyebrow">UADS V2 / M30</div><h1 class="title">Operator dashboard</h1><div id="project" class="muted mono">Loading objective state…</div></div><div class="health"><span class="label">M30 health</span><b id="health">UNAVAILABLE</b></div></div>
<section class="grid"><div class="panel"><div class="label">Events</div><div id="events" class="value">UNAVAILABLE</div></div><div class="panel"><div class="label">B-001 denominator</div><div id="denominator" class="value">UNAVAILABLE</div></div><div class="panel"><div class="label">B-001 duplicate rate</div><div id="rate" class="value">UNAVAILABLE</div></div><div class="panel"><div class="label">Stream</div><div id="stream" class="value">CONNECTING</div></div><div class="panel wide"><div class="label">Latest activity</div><div id="latest" class="list"><div class="muted">UNAVAILABLE</div></div></div><div class="panel wide"><div class="label">Recent errors and diagnostics</div><div id="issues" class="list"><div class="muted">UNAVAILABLE</div></div></div></section></main>
<script>
const esc=(v)=>String(v??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const renderEvent=(e)=>e?'<div class="item"><div>'+esc(e.eventType)+' <span class="muted">'+esc(e.severity)+'</span></div><div class="mono muted">'+esc(e.message||e.sourceComponent)+' · '+esc(e.recordedAt)+'</div></div>':'<div class="muted">UNAVAILABLE</div>';
function render(s){document.querySelector('#health').textContent=s.health.status;document.querySelector('#health').className='state-'+s.health.status;document.querySelector('#project').textContent='project '+s.projectId;document.querySelector('#events').textContent=String(s.eventCounts.total);document.querySelector('#denominator').textContent=s.b001.denominator?String(s.b001.denominator):'UNAVAILABLE';document.querySelector('#rate').textContent=s.b001.rate===null?'UNAVAILABLE':(s.b001.rate*100).toFixed(2)+'%';document.querySelector('#latest').innerHTML=renderEvent(s.latestActivity);const all=[...(s.recentErrors||[]),...(s.recentDiagnostics||[])].slice(0,8);document.querySelector('#issues').innerHTML=all.length?all.map(renderEvent).join(''):'<div class="muted">UNAVAILABLE</div>'}
fetch('/api/snapshot').then(r=>r.json()).then(render).catch(()=>{});const stream=new EventSource('/api/stream');stream.onopen=()=>document.querySelector('#stream').textContent='CONNECTED';stream.onerror=()=>document.querySelector('#stream').textContent='DEGRADED';stream.addEventListener('operational',()=>fetch('/api/snapshot').then(r=>r.json()).then(render).catch(()=>{}));
</script></body></html>`;

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
            client.write(`: heartbeat ${Date.now()}\n\n`);
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

  private broadcast(event: OperationalEvent): void {
    if (this.announcedEventIds.has(event.eventId)) {
      return;
    }
    this.announcedEventIds.add(event.eventId);
    const encoded = JSON.stringify(event);
    for (const client of this.clients) {
      client.write(`event: operational\ndata: ${encoded}\n\n`);
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
      jsonResponse(res, 200, buildDashboardSnapshot(this.cwd, this.uadsHome));
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
      this.openStream(res);
      return;
    }
    jsonResponse(res, 404, { error: "not-found" });
  }

  private openStream(res: http.ServerResponse): void {
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
    const initial = readOperationalEvents(this.paths, { limit: MAX_OPERATIONAL_EVENT_LIMIT }).events.reverse();
    for (const event of initial) {
      res.write(`event: operational\ndata: ${JSON.stringify(event)}\n\n`);
    }
    res.on("close", () => this.clients.delete(res));
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
