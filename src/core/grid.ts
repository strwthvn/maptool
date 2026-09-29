/** Сетка MGRS для видимой части карты: границы зон, линии сетки UTM, подписи квадратов. */

import type { LngLat } from './geodesy';
import { SQUARE, columnLetter, rowLetter } from './mgrs';
import {
  UTM_NORTH,
  UTM_SOUTH,
  bandCount,
  bandIndex,
  bandLetter,
  centralMeridian,
  fromUtm,
  isSouthBand,
  toUtm,
  zoneCell,
} from './utm';

/** Границы по долготе могут выходить за ±180°, если карта прокручена через 180-й меридиан. */
export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Шаги сетки от мелкого к крупному, м. */
export const GRID_STEPS = [100, 1000, 10_000, SQUARE];

/** Вес линии: от него зависит толщина. */
export const WEIGHT_MINOR = 0;
export const WEIGHT_TENTH = 1;
export const WEIGHT_SQUARE = 2;
export const WEIGHT_ZONE = 3;

export interface GridLine {
  kind: 'zone' | 'easting' | 'northing';
  weight: number;
  /** Зона и полушарие, в координатах которых проведена линия. У границ зон не используются. */
  zone: number;
  south: boolean;
  /** Восточная или северная координата линии, м. */
  value: number;
  points: LngLat[];
}

export interface GridLabel {
  text: string;
  position: LngLat;
}

export interface Grid {
  /** Шаг, с которым сетка построена; 0 — только границы зон. */
  step: number;
  lines: GridLine[];
  /** Подписи зон («42S») в центрах видимых частей ячеек. */
  zones: GridLabel[];
  /** Подписи квадратов 100 км вместе с зоной («42S XD»). */
  squares: GridLabel[];
}

/** Больше линий по одной оси не строится: шаг укрупняется. */
const MAX_LINES = 160;

/** Крупная сетка заметно изгибается, поэтому её линии строятся с промежуточными точками. */
const SMOOTH_FROM_STEP = 10_000;

const METERS_PER_DEGREE = 111_320;

/**
 * Наименьший шаг, при котором клетка на экране не мельче `minCellPx`.
 * 0, если даже квадраты 100 км слишком мелки и показывать стоит только зоны.
 */
export function gridStep(metersPerPx: number, minCellPx: number): number {
  return GRID_STEPS.find((step) => step / metersPerPx >= minCellPx) ?? 0;
}

function mod(value: number, by: number): number {
  return ((value % by) + by) % by;
}

/** Отсекает отрезок прямоугольником (алгоритм Лианга — Барски). */
function clipSegment(a: LngLat, b: LngLat, rect: Bounds): [LngLat, LngLat] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a[0] - rect.west],
    [dx, rect.east - a[0]],
    [-dy, a[1] - rect.south],
    [dy, rect.north - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      t0 = Math.max(t0, t);
    } else {
      if (t < t0) return null;
      t1 = Math.min(t1, t);
    }
  }
  return [
    [a[0] + dx * t0, a[1] + dy * t0],
    [a[0] + dx * t1, a[1] + dy * t1],
  ];
}

/** Части ломаной, попавшие в прямоугольник. */
export function clipLine(points: LngLat[], rect: Bounds): LngLat[][] {
  const pieces: LngLat[][] = [];
  let current: LngLat[] | null = null;
  for (let i = 1; i < points.length; i++) {
    const clipped = clipSegment(points[i - 1], points[i], rect);
    if (!clipped) {
      current = null;
      continue;
    }
    const [from, to] = clipped;
    const last: LngLat | undefined = current?.[current.length - 1];
    if (current && last && last[0] === from[0] && last[1] === from[1]) {
      current.push(to);
    } else {
      current = [from, to];
      pieces.push(current);
    }
    // Отрезок обрезан с конца: следующая часть ломаной начнётся с новой линии.
    if (to[0] !== points[i][0] || to[1] !== points[i][1]) current = null;
  }
  // Линия, задевшая прямоугольник одной точкой, на карте не нужна.
  return pieces.filter((piece) =>
    piece.some((point) => point[0] !== piece[0][0] || point[1] !== piece[0][1]),
  );
}

function intersect(a: Bounds, b: Bounds): Bounds | null {
  const rect = {
    west: Math.max(a.west, b.west),
    east: Math.min(a.east, b.east),
    south: Math.max(a.south, b.south),
    north: Math.min(a.north, b.north),
  };
  return rect.west < rect.east && rect.south < rect.north ? rect : null;
}

function lineWeight(value: number, step: number): number {
  if (value % SQUARE === 0) return WEIGHT_SQUARE;
  if (value % (step * 10) === 0) return WEIGHT_TENTH;
  return WEIGHT_MINOR;
}

interface Cell {
  zone: number;
  band: number;
  /** Сдвиг по долготе до той копии мира, которая видна на карте. */
  shift: number;
  /** Вся ячейка и её видимая часть. */
  full: Bounds;
  visible: Bounds;
}

function visibleCells(bounds: Bounds): Cell[] {
  const cells: Cell[] = [];
  const firstBand = bandIndex(bounds.south);
  const lastBand = bandIndex(bounds.north);
  // Расширенные зоны у Норвегии и Шпицбергена выходят за свои шесть градусов,
  // поэтому соседние столбцы проверяются тоже.
  const firstColumn = Math.floor((bounds.west + 180) / 6) - 1;
  const lastColumn = Math.floor((bounds.east + 180) / 6) + 1;

  for (let column = firstColumn; column <= lastColumn; column++) {
    const zone = mod(column, 60) + 1;
    const shift = Math.floor(column / 60) * 360;
    for (let band = firstBand; band <= lastBand; band++) {
      const cell = zoneCell(zone, band);
      if (!cell) continue;
      const full = { ...cell, west: cell.west + shift, east: cell.east + shift };
      const visible = intersect(full, bounds);
      if (visible) cells.push({ zone, band, shift, full, visible });
    }
  }
  return cells;
}

function zoneBorders({ full, visible, zone, band }: Cell, bounds: Bounds): GridLine[] {
  const line = (points: LngLat[]): GridLine => ({
    kind: 'zone',
    weight: WEIGHT_ZONE,
    zone,
    south: isSouthBand(band),
    value: 0,
    points,
  });
  const borders: GridLine[] = [];
  if (full.west >= bounds.west && full.west <= bounds.east) {
    borders.push(line([[full.west, visible.south], [full.west, visible.north]]));
  }
  if (full.south >= bounds.south && full.south <= bounds.north) {
    borders.push(line([[visible.west, full.south], [visible.east, full.south]]));
  }
  if (band === bandCount() - 1 && full.north <= bounds.north) {
    borders.push(line([[visible.west, full.north], [visible.east, full.north]]));
  }
  return borders;
}

/** Размах видимой части ячейки в координатах UTM её зоны. */
function utmExtent({ zone, band, shift, visible }: Cell) {
  const south = isSouthBand(band);
  const samples: LngLat[] = [
    [visible.west, visible.south],
    [visible.east, visible.south],
    [visible.west, visible.north],
    [visible.east, visible.north],
  ];
  // Вдоль параллели северная координата меняется сильнее всего у осевого меридиана.
  const axis = centralMeridian(zone) + shift;
  if (axis > visible.west && axis < visible.east) {
    samples.push([axis, visible.south], [axis, visible.north]);
  }

  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const [lng, lat] of samples) {
    const { easting, northing } = toUtm(lng - shift, lat, zone, south);
    minE = Math.min(minE, easting);
    maxE = Math.max(maxE, easting);
    minN = Math.min(minN, northing);
    maxN = Math.max(maxN, northing);
  }
  return { minE, maxE, minN, maxN, south };
}

function cellLines(cell: Cell, step: number): GridLine[] {
  const { zone, shift, visible } = cell;
  const { minE, maxE, minN, maxN, south } = utmExtent(cell);
  const sample = step >= SMOOTH_FROM_STEP ? step / 4 : step;
  const lines: GridLine[] = [];

  const add = (kind: 'easting' | 'northing', value: number, from: number, to: number) => {
    const points: LngLat[] = [];
    for (let along = from; along <= to; along += sample) {
      const [lng, lat] = fromUtm(
        kind === 'easting'
          ? { zone, south, easting: value, northing: along }
          : { zone, south, easting: along, northing: value },
      );
      points.push([lng + shift, lat]);
    }
    for (const piece of clipLine(points, visible)) {
      lines.push({ kind, weight: lineWeight(value, step), zone, south, value, points: piece });
    }
  };

  const floor = (value: number) => Math.floor(value / step) * step;
  const ceil = (value: number) => Math.ceil(value / step) * step;
  for (let easting = ceil(minE); easting <= floor(maxE); easting += step) {
    add('easting', easting, floor(minN), ceil(maxN));
  }
  for (let northing = ceil(minN); northing <= floor(maxN); northing += step) {
    add('northing', northing, floor(minE), ceil(maxE));
  }
  return lines;
}

function inside(point: LngLat, rect: Bounds): boolean {
  return (
    point[0] >= rect.west && point[0] <= rect.east && point[1] >= rect.south && point[1] <= rect.north
  );
}

/** Подписи квадратов 100 км — в центрах их видимых частей. */
function cellSquares(cell: Cell): GridLabel[] {
  const { zone, shift, visible } = cell;
  const { minE, maxE, minN, maxN, south } = utmExtent(cell);
  const labels: GridLabel[] = [];

  for (let east = Math.floor(minE / SQUARE) * SQUARE; east < maxE; east += SQUARE) {
    for (let north = Math.floor(minN / SQUARE) * SQUARE; north < maxN; north += SQUARE) {
      const easting = (Math.max(east, minE) + Math.min(east + SQUARE, maxE)) / 2;
      const northing = (Math.max(north, minN) + Math.min(north + SQUARE, maxN)) / 2;
      const [lng, lat] = fromUtm({ zone, south, easting, northing });
      const position: LngLat = [lng + shift, lat];
      if (!inside(position, visible)) continue;
      const square = columnLetter(zone, east) + rowLetter(zone, north);
      labels.push({ text: `${zone}${bandLetter(lat)} ${square}`, position });
    }
  }
  return labels;
}

/** Сетка для видимой области. Шаг 0 — только границы и подписи зон. */
export function buildGrid(view: Bounds, step: number): Grid {
  const bounds: Bounds = {
    west: view.west,
    east: Math.min(view.east, view.west + 360),
    south: Math.max(view.south, UTM_SOUTH),
    north: Math.min(view.north, UTM_NORTH),
  };
  const grid: Grid = { step, lines: [], zones: [], squares: [] };
  if (bounds.south >= bounds.north || bounds.west >= bounds.east) return grid;

  if (step > 0) {
    const nearest = Math.min(Math.abs(bounds.south), Math.abs(bounds.north));
    const closestToEquator = bounds.south < 0 && bounds.north > 0 ? 0 : nearest;
    const width =
      (bounds.east - bounds.west) * METERS_PER_DEGREE * Math.cos((closestToEquator * Math.PI) / 180);
    const height = (bounds.north - bounds.south) * METERS_PER_DEGREE;
    while (step > 0 && Math.max(width, height) / step > MAX_LINES) {
      step = step < SQUARE ? step * 10 : 0;
    }
    grid.step = step;
  }

  for (const cell of visibleCells(bounds)) {
    grid.lines.push(...zoneBorders(cell, bounds));
    const { visible } = cell;
    grid.zones.push({
      text: `${cell.zone}${bandLetter(visible.south)}`,
      position: [(visible.west + visible.east) / 2, (visible.south + visible.north) / 2],
    });
    if (step > 0) {
      grid.lines.push(...cellLines(cell, step));
      grid.squares.push(...cellSquares(cell));
    }
  }
  return grid;
}

/** Сколько цифр километровой сетки пишется у линии при данном шаге. */
function labelDigits(step: number): number {
  return Math.max(0, 5 - Math.round(Math.log10(step)));
}

/**
 * Подпись линии сетки в точке `at`: цифры внутри квадрата 100 км, у каждой десятой
 * линии — ещё и буквы квадрата, в котором стоит подпись.
 */
export function lineLabel(line: GridLine, step: number, at: LngLat): string {
  if (line.kind === 'zone' || step >= SQUARE) return '';
  const digits = labelDigits(step);
  const inSquare = mod(line.value, SQUARE) / (SQUARE / 10 ** digits);
  const text = String(Math.round(inSquare)).padStart(digits, '0');
  if (line.weight === WEIGHT_MINOR) return text;

  const here = toUtm(at[0], at[1], line.zone, line.south);
  const square =
    line.kind === 'easting'
      ? columnLetter(line.zone, line.value) + rowLetter(line.zone, here.northing)
      : columnLetter(line.zone, here.easting) + rowLetter(line.zone, line.value);
  return `${square} ${text}`;
}
