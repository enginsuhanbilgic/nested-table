// Mock "server" for the nested-table demo.
//
// Exposes async fetchers that simulate network latency. Each scenario owns a tree
// of EntityNodes plus a per-entity minute-by-minute latency series (09:30 -> 18:00).
// Table data (tree + daily aggregates) is fetched per level (lazy children); the
// minute series for the chart is fetched on demand when a row is shown.

import type { EntityNode, Metrics, MinutePoint, PageRequest, PagedResult } from '../types';

export type ScenarioId = 'participant' | 'node';

// ---------------------------------------------------------------------------
// Time axis: one point per minute from 09:30 to 18:00 inclusive (511 points).
// ---------------------------------------------------------------------------

function buildTimes(): string[] {
  const out: string[] = [];
  for (let m = 9 * 60 + 30; m <= 18 * 60; m++) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    out.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  }
  return out;
}

export const TIMES = buildTimes();

const round = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Generate a realistic minute-by-minute series around `base` ms.
 * Guarantees max >= avg >= med at every point. A midday "bump" plus the odd
 * spike keeps the chart visually interesting.
 */
function genSeries(base: number): MinutePoint[] {
  let med = base;
  return TIMES.map((t, i) => {
    med += (Math.random() - 0.5) * base * 0.08;
    med = clamp(med, base * 0.5, base * 1.8);
    const bump = Math.sin((i / TIMES.length) * Math.PI) * base * 0.25;
    const medV = med + bump;
    const avgV = medV * (1.05 + Math.random() * 0.12);
    const spike = Math.random() < 0.04 ? base * (1 + Math.random() * 2.5) : 0;
    const maxV = avgV * (1.2 + Math.random() * 0.35) + spike;
    return { t, med: round(medV), avg: round(avgV), max: round(maxV) };
  });
}

function dailyOf(series: MinutePoint[]): Metrics {
  return {
    avg: round(series.reduce((s, p) => s + p.avg, 0) / series.length),
    med: round(median(series.map((p) => p.med))),
    max: round(Math.max(...series.map((p) => p.max))),
  };
}

// ---------------------------------------------------------------------------
// Build the two scenario trees once at module load. We keep children in a
// separate map (keyed by parent id) so the fetchers can serve them lazily, and
// the minute series in another map keyed by entity id.
// ---------------------------------------------------------------------------

const childrenByParent = new Map<string, EntityNode[]>();
const seriesById = new Map<string, MinutePoint[]>();
const rootsByScenario = new Map<ScenarioId, EntityNode[]>();

function makeEntity(
  id: string,
  name: string,
  level: number,
  base: number,
  extra: Record<string, string | number>,
  hasChildren: boolean,
): EntityNode {
  const series = genSeries(base);
  seriesById.set(id, series);
  return { id, name, level, daily: dailyOf(series), extra, hasChildren };
}

const pick = <T,>(arr: readonly T[], i: number) => arr[i % arr.length];
const randInt = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

function sortValue(node: EntityNode, field: string): string | number | undefined {
  if (field === '__tree__' || field === 'name') return node.name;
  if (field === 'avg' || field === 'med' || field === 'max') return node.daily[field];
  return node.extra[field];
}

function pageRows<T>(rows: T[], request: PageRequest): PagedResult<T> {
  const start = request.page * request.pageSize;
  const end = start + request.pageSize;
  return {
    rows: rows.slice(start, end),
    total: rows.length,
    nextPage: end < rows.length ? request.page + 1 : null,
  };
}

function pageEntities(rows: EntityNode[], request: PageRequest): PagedResult<EntityNode> {
  const sorted = request.sort
    ? [...rows].sort((a, b) => {
        const av = sortValue(a, request.sort!.field);
        const bv = sortValue(b, request.sort!.field);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const dir = request.sort!.direction === 'desc' ? -1 : 1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      })
    : rows;
  return pageRows(sorted, request);
}

const REGIONS = ['EU-West', 'US-East', 'AP-South', 'EU-North', 'US-West'] as const;
const DEVICES = ['Web', 'iOS', 'Android', 'Desktop'] as const;
const STATUSES = ['active', 'idle'] as const;
const HEALTH = ['healthy', 'degraded'] as const;

// ---- Scenario 1: participant -> user --------------------------------------
function buildParticipantTree() {
  const roots: EntityNode[] = [];
  for (let p = 1; p <= 14; p++) {
    const pid = `p${p}`;
    const userCount = randInt(8, 16);
    const participant = makeEntity(
      pid,
      `Participant ${p}`,
      0,
      randInt(40, 90),
      { region: pick(REGIONS, p - 1), users: userCount },
      true,
    );
    roots.push(participant);

    const users: EntityNode[] = [];
    for (let u = 1; u <= userCount; u++) {
      const uid = `${pid}-u${u}`;
      users.push(
        makeEntity(
          uid,
          `User ${p}.${u}`,
          1,
          randInt(30, 120),
          { device: pick(DEVICES, u - 1), status: pick(STATUSES, u) },
          false,
        ),
      );
    }
    childrenByParent.set(pid, users);
  }
  rootsByScenario.set('participant', roots);
}

// ---- Scenario 2: node -> instance -> user ---------------------------------
function buildNodeTree() {
  const roots: EntityNode[] = [];
  for (let n = 1; n <= 10; n++) {
    const nid = `n${n}`;
    const instanceCount = randInt(4, 7);
    const node = makeEntity(
      nid,
      `Gateway ${n}`,
      0,
      randInt(50, 80),
      { region: pick(REGIONS, n - 1), instances: instanceCount },
      true,
    );
    roots.push(node);

    const instances: EntityNode[] = [];
    for (let i = 1; i <= instanceCount; i++) {
      const iid = `${nid}-i${i}`;
      const userCount = randInt(6, 12);
      instances.push(
        makeEntity(
          iid,
          `Instance ${n}.${i}`,
          1,
          randInt(40, 100),
          { status: pick(HEALTH, i), users: userCount },
          true,
        ),
      );

      const users: EntityNode[] = [];
      for (let u = 1; u <= userCount; u++) {
        const uid = `${iid}-u${u}`;
        users.push(
          makeEntity(
            uid,
            `User ${n}.${i}.${u}`,
            2,
            randInt(30, 130),
            { connection: `Instance ${n}.${i}`, device: pick(DEVICES, u - 1) },
            false,
          ),
        );
      }
      childrenByParent.set(iid, users);
    }
    childrenByParent.set(nid, instances);
  }
  rootsByScenario.set('node', roots);
}

buildParticipantTree();
buildNodeTree();

// ---------------------------------------------------------------------------
// Async API (simulated latency).
// ---------------------------------------------------------------------------

const delay = <T,>(value: T, ms = 300): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

/** Top-level rows for a scenario. */
export function fetchRoot(
  scenario: ScenarioId,
  request: PageRequest,
): Promise<PagedResult<EntityNode>> {
  return delay(pageEntities(rootsByScenario.get(scenario) ?? [], request), 200);
}

/** Children of a row, loaded when it is expanded. */
export function fetchChildren(
  parentId: string,
  request: PageRequest,
): Promise<PagedResult<EntityNode>> {
  return delay(pageEntities(childrenByParent.get(parentId) ?? [], request), 400);
}

/** Minute-by-minute series for one entity, loaded when its row is shown. */
export function fetchSeries(entityId: string): Promise<MinutePoint[]> {
  return delay(seriesById.get(entityId) ?? [], 250);
}
