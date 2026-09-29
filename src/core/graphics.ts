/** Тактическая графика: линии, стрелки, районы, секторы и точки с подписью. */

import {
  destination,
  distance,
  geodesicPath,
  inverse,
  normalizeAzimuth,
  type LngLat,
} from './geodesy';
import { fromMercator, heading, toMercator } from './mercator';
import { newId, type Affiliation } from './units';

export type GraphicKind = 'line' | 'arrow' | 'area' | 'sector' | 'point';

/** Цвет задаётся стороной; «без стороны» — чёрный, для границ и рубежей. */
export type GraphicColor = Affiliation | 'plain';
export type GraphicDash = 'solid' | 'dashed';
export type GraphicWidth = 'thin' | 'medium' | 'thick';

export interface GraphicStyle {
  color: GraphicColor;
  dash: GraphicDash;
  width: GraphicWidth;
  /** Заливка района или сектора. */
  fill: boolean;
}

export interface Graphic extends GraphicStyle {
  id: string;
  kind: GraphicKind;
  label: string;
  /** Вершины линии, стрелки или района; у сектора и точки — одна точка. */
  points: LngLat[];
  /** Только для сектора: направление оси, угол раствора (градусы) и дальность (м). */
  azimuth: number;
  spread: number;
  range: number;
}

export const GRAPHIC_KINDS: { id: GraphicKind; label: string; hint: string }[] = [
  { id: 'line', label: 'Линия', hint: 'Рубеж, граница, маршрут' },
  { id: 'arrow', label: 'Стрелка', hint: 'Направление действий' },
  { id: 'area', label: 'Район', hint: 'Район, позиция, зона' },
  { id: 'sector', label: 'Сектор', hint: 'Сектор огня или наблюдения' },
  { id: 'point', label: 'Точка', hint: 'Ориентир, пункт' },
];

export interface GraphicInk {
  id: GraphicColor;
  label: string;
  line: string;
  /** Окантовка, на которой линия видна поверх любой подложки. */
  casing: string;
  text: string;
  halo: string;
}

const LIGHT = 'rgba(255, 255, 255, 0.9)';
const DARK = 'rgba(30, 30, 34, 0.9)';

export const GRAPHIC_COLORS: GraphicInk[] = [
  { id: 'friend', label: 'Свои', line: '#0a6cff', casing: LIGHT, text: '#0a4fc4', halo: LIGHT },
  { id: 'hostile', label: 'Противник', line: '#e3172f', casing: LIGHT, text: '#c20f25', halo: LIGHT },
  { id: 'neutral', label: 'Нейтральные', line: '#0a9a4a', casing: LIGHT, text: '#087a3a', halo: LIGHT },
  { id: 'unknown', label: 'Неизвестные', line: '#ffd21f', casing: DARK, text: '#ffdf5c', halo: DARK },
  { id: 'plain', label: 'Без стороны', line: '#1e1e22', casing: LIGHT, text: '#1e1e22', halo: LIGHT },
];

export const GRAPHIC_DASHES: { id: GraphicDash; label: string }[] = [
  { id: 'solid', label: 'Сплошная' },
  { id: 'dashed', label: 'Пунктир' },
];

export const GRAPHIC_WIDTHS: { id: GraphicWidth; label: string; px: number }[] = [
  { id: 'thin', label: 'Тонкая', px: 2 },
  { id: 'medium', label: 'Средняя', px: 3.5 },
  { id: 'thick', label: 'Толстая', px: 5 },
];

export const SPREAD_MIN = 1;
export const SPREAD_MAX = 360;
export const RANGE_MIN = 1;
export const RANGE_MAX = 500_000;

const DEFAULT_SPREAD = 60;
const DEFAULT_RANGE = 1000;

/** Шаг, с которым дуга сектора заменяется ломаной, градусы. */
const ARC_STEP = 3;

/** Доля дальности, на которой стоит подпись сектора. */
const SECTOR_LABEL_AT = 0.62;

export function graphicKind(id: GraphicKind) {
  return GRAPHIC_KINDS.find((kind) => kind.id === id)!;
}

export function graphicInk(id: GraphicColor): GraphicInk {
  return GRAPHIC_COLORS.find((color) => color.id === id)!;
}

export function graphicWidth(id: GraphicWidth): number {
  return GRAPHIC_WIDTHS.find((width) => width.id === id)!.px;
}

export function defaultStyle(): GraphicStyle {
  return { color: 'friend', dash: 'solid', width: 'medium', fill: true };
}

/** Сколько точек нужно указать на карте, чтобы знак можно было построить. */
export function pointsNeeded(kind: GraphicKind): number {
  if (kind === 'point') return 1;
  return kind === 'area' ? 3 : 2;
}

/** Знаки, которые строятся ровно по стольким точкам и дальше не продолжаются. */
export function pointsLimit(kind: GraphicKind): number {
  if (kind === 'point') return 1;
  return kind === 'sector' ? 2 : Infinity;
}

/** У района и сектора есть внутренняя область, которую можно залить. */
export function canFill(kind: GraphicKind): boolean {
  return kind === 'area' || kind === 'sector';
}

export function clampSpread(degrees: number): number {
  return Math.max(SPREAD_MIN, Math.min(SPREAD_MAX, degrees));
}

export function clampRange(meters: number): number {
  return Math.max(RANGE_MIN, Math.min(RANGE_MAX, meters));
}

/**
 * Знак по точкам, указанным на карте. Сектор задаётся вершиной и точкой на оси:
 * из них получаются направление и дальность. null, если точек не хватает.
 */
export function createGraphic(
  kind: GraphicKind,
  style: GraphicStyle,
  points: LngLat[],
): Graphic | null {
  if (points.length < pointsNeeded(kind)) return null;
  const graphic: Graphic = {
    id: newId(),
    kind,
    label: '',
    ...style,
    points: points.map(([lng, lat]) => [lng, lat]),
    azimuth: 0,
    spread: DEFAULT_SPREAD,
    range: DEFAULT_RANGE,
  };
  if (kind === 'point') graphic.points = graphic.points.slice(0, 1);
  if (kind === 'sector') {
    const aim = inverse(points[0], points[1]);
    if (aim.distance < RANGE_MIN) return null;
    graphic.points = graphic.points.slice(0, 1);
    graphic.azimuth = aim.azimuth;
    graphic.range = clampRange(aim.distance);
  }
  return graphic;
}

export function graphicTitle(graphic: Graphic): string {
  return graphic.label.trim() || graphicKind(graphic.kind).label;
}

/** Дуга сектора от левого края к правому. */
export function sectorArc(graphic: Graphic): LngLat[] {
  const apex = graphic.points[0];
  const steps = Math.max(1, Math.ceil(graphic.spread / ARC_STEP));
  const start = graphic.azimuth - graphic.spread / 2;
  const arc: LngLat[] = [];
  for (let i = 0; i <= steps; i++) {
    arc.push(destination(apex, start + (graphic.spread * i) / steps, graphic.range));
  }
  return arc;
}

export interface Outline {
  path: LngLat[];
  /** Контур замкнут: первая точка пути повторена в конце. */
  closed: boolean;
}

function through(points: LngLat[]): LngLat[] {
  const path: LngLat[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    path.push(...geodesicPath(points[i - 1], points[i]).slice(1));
  }
  return path;
}

/** Линия знака на карте. У точки линии нет. */
export function outline(graphic: Graphic): Outline | null {
  const { kind, points } = graphic;
  if (kind === 'point' || points.length === 0) return null;
  if (kind === 'sector') {
    const arc = sectorArc(graphic);
    // Полный круг рисуется без радиусов.
    if (graphic.spread >= SPREAD_MAX) return { path: arc, closed: true };
    return { path: [points[0], ...arc, points[0]], closed: true };
  }
  if (points.length < 2) return null;
  if (kind === 'area' && points.length >= 3) {
    return { path: through([...points, points[0]]), closed: true };
  }
  return { path: through(points), closed: false };
}

/** Точка на половине длины ломаной. */
function halfway(path: LngLat[]): LngLat {
  const lengths = path.slice(1).map((point, i) => distance(path[i], point));
  let left = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] && lengths[i] > 0) {
      const { azimuth } = inverse(path[i], path[i + 1]);
      return destination(path[i], azimuth, left);
    }
    left -= lengths[i];
  }
  return path[path.length - 1];
}

/** Центр тяжести многоугольника на карте. Вырожденная фигура даёт среднее вершин. */
function centroid(ring: LngLat[]): LngLat {
  const flat = ring.map(toMercator);
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < flat.length; i++) {
    const [ax, ay] = flat[i];
    const [bx, by] = flat[(i + 1) % flat.length];
    const cross = ax * by - bx * ay;
    area += cross;
    x += (ax + bx) * cross;
    y += (ay + by) * cross;
  }
  if (Math.abs(area) < 1e-18) {
    const sum = flat.reduce(([sx, sy], [px, py]) => [sx + px, sy + py], [0, 0]);
    return fromMercator([sum[0] / flat.length, sum[1] / flat.length]);
  }
  return fromMercator([x / (3 * area), y / (3 * area)]);
}

/** Место подписи знака. */
export function labelAnchor(graphic: Graphic): LngLat {
  const { kind, points } = graphic;
  if (kind === 'sector') {
    return destination(points[0], graphic.azimuth, graphic.range * SECTOR_LABEL_AT);
  }
  if (kind === 'area' && points.length >= 3) return centroid(points);
  if (kind === 'point' || points.length < 2) return points[0];
  return halfway(through(points));
}

/** Куда смотрит наконечник стрелки: направление её последнего отрезка на карте. */
export function arrowHeading(graphic: Graphic): number {
  const path = outline(graphic)?.path ?? [];
  if (path.length < 2) return 0;
  return heading(path[path.length - 2], path[path.length - 1]);
}

/** Ручки сектора: на оси у дуги и на концах дуги. */
export function sectorHandles(graphic: Graphic): { reach: LngLat; left: LngLat; right: LngLat } {
  const apex = graphic.points[0];
  const half = graphic.spread / 2;
  return {
    reach: destination(apex, graphic.azimuth, graphic.range),
    left: destination(apex, graphic.azimuth - half, graphic.range),
    right: destination(apex, graphic.azimuth + half, graphic.range),
  };
}

/** Ось и дальность сектора, если ручку на оси перенесли в точку `to`. */
export function aimSector(graphic: Graphic, to: LngLat): Pick<Graphic, 'azimuth' | 'range'> {
  const aim = inverse(graphic.points[0], to);
  if (aim.distance < RANGE_MIN) return { azimuth: graphic.azimuth, range: graphic.range };
  return { azimuth: aim.azimuth, range: clampRange(aim.distance) };
}

/** Раствор сектора, если ручку на краю дуги перенесли в точку `to`. Ось остаётся на месте. */
export function spreadSector(graphic: Graphic, to: LngLat): number {
  const aim = inverse(graphic.points[0], to);
  if (aim.distance === 0) return graphic.spread;
  const off = Math.abs(((aim.azimuth - graphic.azimuth + 540) % 360) - 180);
  return clampSpread(Math.round(off * 2));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<Id extends string>(list: { id: Id }[], value: unknown): Id | null {
  return list.find((item) => item.id === value)?.id ?? null;
}

function readPoint(data: unknown): LngLat | null {
  if (!Array.isArray(data) || data.length !== 2) return null;
  const [lng, lat] = data;
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90) return null;
  return [lng, lat];
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Приводит произвольные данные к знаку; null, если знак не восстановить. */
export function readGraphic(data: unknown): Graphic | null {
  if (!isRecord(data)) return null;
  const kind = oneOf(GRAPHIC_KINDS, data.kind);
  if (!kind) return null;

  let points = (Array.isArray(data.points) ? data.points : []).flatMap((point) => {
    const read = readPoint(point);
    return read ? [read] : [];
  });
  if (kind === 'point' || kind === 'sector') points = points.slice(0, 1);
  const stored = kind === 'sector' ? 1 : pointsNeeded(kind);
  if (points.length < stored) return null;

  const style = defaultStyle();
  return {
    id: typeof data.id === 'string' && data.id ? data.id : newId(),
    kind,
    label: typeof data.label === 'string' ? data.label : '',
    color: oneOf(GRAPHIC_COLORS, data.color) ?? style.color,
    dash: oneOf(GRAPHIC_DASHES, data.dash) ?? style.dash,
    width: oneOf(GRAPHIC_WIDTHS, data.width) ?? style.width,
    fill: typeof data.fill === 'boolean' ? data.fill : style.fill,
    points,
    azimuth: normalizeAzimuth(finite(data.azimuth, 0)),
    spread: clampSpread(finite(data.spread, DEFAULT_SPREAD)),
    range: clampRange(finite(data.range, DEFAULT_RANGE)),
  };
}
