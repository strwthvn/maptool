/**
 * Видимость: линия между наблюдателем и целью и зона обзора вокруг точки.
 * В сценарий не входит и при перезагрузке пропадает; высоты и радиус запоминаются.
 */

import type { LngLat } from '../core/geodesy';
import {
  DEFAULT_HEIGHT,
  DEFAULT_RADIUS,
  clampHeight,
  clampRadius,
  planGrid,
  sightLine,
  viewshedCorners,
  type SightReport,
  type Viewshed,
  type ViewshedSpec,
} from '../core/los';
import { survey, type Survey } from '../core/profile';
import type { Unit } from '../core/units';
import { SEEN_RGB } from '../map/colors';
import { dem, demAt } from '../map/dem';
import type { ViewshedRequest, ViewshedResponse } from '../workers/viewshed';
import { persist } from './persist.svelte';
import { findUnit } from './scenario.svelte';

/** Место на карте; привязанное к фишке переезжает вместе с ней. */
export interface Anchor {
  unitId: string | null;
  position: LngLat;
}

/** Что указывают на карте: линию видимости или точку обзора. */
export type SightTask = 'line' | 'zone';

/** Концы линии и центр зоны. */
export type SightEnd = 'from' | 'to' | 'center';

export type SightState = 'idle' | 'loading' | 'ready' | 'failed';

export interface Zone {
  zone: Viewshed;
  spec: ViewshedSpec;
  /** Картинка зоны для карты и её углы. */
  url: string;
  corners: LngLat[];
}

const STORAGE_KEY = 'maptool.sight';

/** Столько расчёт зоны ждёт после правки: пока точку тащат, каждый пиксель считать незачем, мс. */
const ZONE_DELAY_MS = 150;

/** Картинка прежней зоны живёт ещё столько: карта могла не успеть её прочесть, мс. */
const RELEASE_DELAY_MS = 5000;

interface Saved {
  observerHeight: number;
  targetHeight: number;
  radius: number;
  opacity: number;
}

function load(): Saved {
  const state: Saved = {
    observerHeight: DEFAULT_HEIGHT,
    targetHeight: DEFAULT_HEIGHT,
    radius: DEFAULT_RADIUS,
    opacity: 0.45,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    const number = (value: unknown): value is number =>
      typeof value === 'number' && Number.isFinite(value);
    if (number(saved?.observerHeight)) state.observerHeight = clampHeight(saved.observerHeight);
    if (number(saved?.targetHeight)) state.targetHeight = clampHeight(saved.targetHeight);
    if (number(saved?.radius)) state.radius = clampRadius(saved.radius);
    if (number(saved?.opacity)) state.opacity = Math.max(0.1, Math.min(1, saved.opacity));
  } catch {
    // Хранилище недоступно или повреждено — работаем с настройками по умолчанию.
  }
  return state;
}

export const sight = $state<
  Saved & {
    /** Что сейчас указывают щелчками по карте. */
    picking: SightTask | null;
    from: Anchor | null;
    to: Anchor | null;
    center: Anchor | null;
    /** Положение курсора, до которого тянется линия от наблюдателя. */
    cursor: LngLat | null;
  }
>({ ...load(), picking: null, from: null, to: null, center: null, cursor: null });

/** Место на линии видимости, на которое показывают на графике. */
export const sightFocus = $state<{ distance: number | null }>({ distance: null });

function anchor(point: LngLat, unit?: Unit): Anchor {
  return unit
    ? { unitId: unit.id, position: [unit.position[0], unit.position[1]] }
    : { unitId: null, position: [point[0], point[1]] };
}

/** Линия видимости указывается двумя щелчками; от фишки — одним, по цели. */
export function startLine(unit?: Unit): void {
  sight.picking = 'line';
  sight.from = unit ? anchor(unit.position, unit) : null;
  sight.to = null;
  sight.cursor = null;
}

/** Прежняя зона остаётся на карте, пока не указана новая точка. */
export function startZone(): void {
  cancelPicking();
  sight.picking = 'zone';
}

/** Ставит точку, которую ждёт инструмент. Точка, поставленная на фишку, привязывается к ней. */
export function placeSight(point: LngLat, unit?: Unit): void {
  if (sight.picking === 'zone') {
    sight.center = anchor(point, unit);
    sight.picking = null;
  } else if (sight.picking === 'line' && !sight.from) {
    sight.from = anchor(point, unit);
  } else if (sight.picking === 'line') {
    sight.to = anchor(point, unit);
    sight.picking = null;
  }
  sight.cursor = null;
}

/** Линия, у которой указан только наблюдатель, на карте не остаётся. */
export function cancelPicking(): void {
  if (sight.picking === 'line' && !sight.to) sight.from = null;
  sight.picking = null;
  sight.cursor = null;
}

/** Что видит фишка: зона обзора с её места. */
export function watchFrom(unit: Unit): void {
  cancelPicking();
  sight.center = anchor(unit.position, unit);
}

export function moveSightEnd(end: SightEnd, point: LngLat, unit?: Unit): void {
  sight[end] = anchor(point, unit);
}

/** Наблюдатель и цель меняются местами: видимость в обе стороны не одинакова. */
export function swapLine(): void {
  if (!sight.from || !sight.to) return;
  [sight.from, sight.to] = [sight.to, sight.from];
}

export function clearLine(): void {
  if (sight.picking === 'line') cancelPicking();
  sight.from = null;
  sight.to = null;
}

export function clearZone(): void {
  if (sight.picking === 'zone') cancelPicking();
  sight.center = null;
}

export function setObserverHeight(meters: number): void {
  sight.observerHeight = clampHeight(meters);
}

export function setTargetHeight(meters: number): void {
  sight.targetHeight = clampHeight(meters);
}

export function setRadius(meters: number): void {
  sight.radius = clampRadius(meters);
}

/** Фишка, к которой привязано место, или undefined. */
export function anchorUnit(place: Anchor | null): Unit | undefined {
  return findUnit(place?.unitId ?? null);
}

let lineSurvey = $state.raw<{ key: string; survey: Survey } | null>(null);
let lineFailed = $state.raw<string | null>(null);
let lineAttempt = $state(0);
let lineAsked: string | null = null;

const lineKey = $derived(
  sight.from && sight.to ? JSON.stringify([sight.from.position, sight.to.position]) : null,
);

async function measureLine(key: string): Promise<void> {
  try {
    const result = await survey(JSON.parse(key), (positions) => dem.elevations(positions));
    // Пока высоты грузились, линию могли передвинуть или стереть.
    if (lineAsked !== key) return;
    lineSurvey = { key, survey: result };
    lineFailed = null;
  } catch (error) {
    if (lineAsked !== key) return;
    console.warn(error);
    lineFailed = key;
  }
}

let zone = $state.raw<(Zone & { key: string }) | null>(null);
let zoneFailed = $state.raw<string | null>(null);
let zoneAttempt = $state(0);

const zoneKey = $derived(
  sight.center
    ? JSON.stringify([
        sight.center.position,
        sight.radius,
        sight.observerHeight,
        sight.targetHeight,
      ])
    : null,
);

let worker: Worker | null = null;
let serial = 0;
const waiting = new Map<
  number,
  { resolve: (result: { zone: Viewshed; image: Blob }) => void; reject: (error: Error) => void }
>();

function compute(request: Omit<ViewshedRequest, 'id'>): Promise<{ zone: Viewshed; image: Blob }> {
  if (!worker) {
    worker = new Worker(new URL('../workers/viewshed.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', ({ data }: MessageEvent<ViewshedResponse>) => {
      const asked = waiting.get(data.id);
      waiting.delete(data.id);
      if ('error' in data) asked?.reject(new Error(data.error));
      else asked?.resolve(data);
    });
    worker.addEventListener('error', (event) => {
      for (const { reject } of waiting.values()) reject(new Error(event.message));
      waiting.clear();
    });
  }
  const id = ++serial;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker!.postMessage({ id, ...request } satisfies ViewshedRequest, [request.grid.data.buffer]);
  });
}

function release(url: string | undefined): void {
  if (url) setTimeout(() => URL.revokeObjectURL(url), RELEASE_DELAY_MS);
}

function show(next: (Zone & { key: string }) | null): void {
  release(zone?.url);
  zone = next;
}

let wanted: string | null = null;
let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Считает зону, которая нужна сейчас. Пока идёт расчёт, новые правки ждут его конца. */
async function pump(): Promise<void> {
  const key = wanted;
  if (running || key === null || zone?.key === key) return;
  running = true;
  try {
    const [observer, radius, observerHeight, targetHeight] = JSON.parse(key);
    const spec: ViewshedSpec = { observer, radius, observerHeight, targetHeight };
    const plan = planGrid(spec);
    const grid = await demAt(plan.zoom).grid(plan.left, plan.top, plan.width, plan.height);
    const result = await compute({ grid, spec, tint: SEEN_RGB });
    if (wanted !== null) {
      show({
        key,
        spec,
        zone: result.zone,
        url: URL.createObjectURL(result.image),
        corners: viewshedCorners(result.zone),
      });
      zoneFailed = null;
    }
  } catch (error) {
    console.warn(error);
    if (wanted === key) zoneFailed = key;
  } finally {
    running = false;
    if (wanted !== key) void pump();
  }
}

$effect.root(() => {
  // Место, привязанное к фишке, идёт за ней; без фишки остаётся там, где она стояла.
  $effect(() => {
    for (const place of [sight.from, sight.to, sight.center]) {
      if (!place?.unitId) continue;
      const unit = findUnit(place.unitId);
      if (!unit) place.unitId = null;
      else if (unit.position[0] !== place.position[0] || unit.position[1] !== place.position[1]) {
        place.position = [unit.position[0], unit.position[1]];
      }
    }
  });

  $effect(() => {
    void lineAttempt;
    const key = lineKey;
    if (key === lineAsked) return;
    lineAsked = key;
    if (key === null) {
      lineSurvey = null;
      lineFailed = null;
      sightFocus.distance = null;
    } else {
      void measureLine(key);
    }
  });

  $effect(() => {
    void zoneAttempt;
    wanted = zoneKey;
    clearTimeout(timer);
    if (wanted === null) {
      show(null);
      zoneFailed = null;
    } else {
      timer = setTimeout(() => void pump(), ZONE_DELAY_MS);
    }
  });
});

const report = $derived(
  lineSurvey ? sightLine(lineSurvey.survey, sight.observerHeight, sight.targetHeight) : null,
);

/** Расчёт линии видимости. Пока линию двигают, на миг отстаёт от неё: см. lineState. */
export function sightReport(): SightReport | null {
  return report;
}

export function lineState(): SightState {
  if (lineKey === null) return 'idle';
  if (lineFailed === lineKey) return 'failed';
  return lineSurvey?.key === lineKey ? 'ready' : 'loading';
}

/** Посчитанная зона обзора. Пока зону пересчитывают, на карте остаётся прежняя. */
export function sightZone(): Zone | null {
  return zone;
}

export function zoneState(): SightState {
  if (zoneKey === null) return 'idle';
  if (zoneFailed === zoneKey) return 'failed';
  return zone?.key === zoneKey ? 'ready' : 'loading';
}

/** Пробует снять высоты заново, например когда вернулась сеть. */
export function retryLine(): void {
  lineAsked = null;
  lineFailed = null;
  lineAttempt += 1;
}

export function retryZone(): void {
  zoneFailed = null;
  zoneAttempt += 1;
}

if (import.meta.env.DEV) {
  Object.assign(window, { sight: { report: sightReport, zone: sightZone, state: sight } });
}

persist(STORAGE_KEY, () =>
  JSON.stringify({
    observerHeight: sight.observerHeight,
    targetHeight: sight.targetHeight,
    radius: sight.radius,
    opacity: sight.opacity,
  } satisfies Saved),
);
