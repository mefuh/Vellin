/**
 * Лёгкая in-process телеметрия для админ-мониторинга: кольцевые буферы латентности
 * HTTP-запросов и последних ошибок, счётчик WS-событий с вычислением rate и
 * семплер загрузки CPU. Всё в памяти одного инстанса — при мультинодовости нужен
 * внешний агрегатор (вне scope v2, см. docs/admin-panel-v2.md §10).
 */

export interface RequestRecord {
  ts: number;
  method: string;
  route: string;
  status: number;
  ms: number;
}

export interface ErrorRecord {
  ts: number;
  where: string;
  message: string;
}

const REQ_CAP = 500;
const ERR_CAP: number = 50;

const requests: RequestRecord[] = [];
const errors: ErrorRecord[] = [];

let wsEventsTotal = 0;
let lastRateTotal = 0;
let lastRateTs = Date.now();

let cpuPercent = 0;
let lastCpu = process.cpuUsage();
let lastCpuTs = Date.now();

export function recordRequest(method: string, route: string, status: number, ms: number): void {
  requests.push({ ts: Date.now(), method, route, status, ms });
  if (requests.length > REQ_CAP) requests.shift();
}

export function incWsEvent(): void {
  wsEventsTotal += 1;
}

export function recordError(where: string, message: string): void {
  errors.push({ ts: Date.now(), where, message: message.slice(0, 300) });
  if (errors.length > ERR_CAP) errors.shift();
}

export function getRequests(): RequestRecord[] {
  return requests;
}

export function getErrors(): ErrorRecord[] {
  return [...errors].reverse();
}

/** События WS в секунду с момента прошлого опроса (дельта/время). */
export function getWsEventRate(): { total: number; perSec: number } {
  const now = Date.now();
  const dt = (now - lastRateTs) / 1000;
  const perSec = dt > 0 ? Math.round(((wsEventsTotal - lastRateTotal) / dt) * 10) / 10 : 0;
  lastRateTotal = wsEventsTotal;
  lastRateTs = now;
  return { total: wsEventsTotal, perSec: Math.max(0, perSec) };
}

export function getCpuPercent(): number {
  return cpuPercent;
}

/** Периодически пересчитывает загрузку CPU процесса (по process.cpuUsage). */
export function startMetricsSampler(): void {
  setInterval(() => {
    const now = Date.now();
    const usage = process.cpuUsage(lastCpu);
    const elapsedMs = now - lastCpuTs;
    const cpuMs = (usage.user + usage.system) / 1000;
    cpuPercent = elapsedMs > 0 ? Math.min(100, Math.round((cpuMs / elapsedMs) * 1000) / 10) : 0;
    lastCpu = process.cpuUsage();
    lastCpuTs = now;
  }, 5000).unref();
}
