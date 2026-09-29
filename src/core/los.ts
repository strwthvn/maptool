/** Видимость: линия между двумя точками и зона обзора вокруг точки. */

import { TILE_SIZE, lngLatToPixel, pixelToLngLat, type ElevationGrid } from './dem';
import type { LngLat } from './geodesy';
import type { Survey } from './profile';

/** Средний радиус Земли, м. */
const EARTH_RADIUS = 6371008.8;

/** Радиус шара, на котором построена проекция карты, м. */
const MERCATOR_RADIUS = 6378137;

/**
 * Доля кривизны Земли, которую снимает преломление света в воздухе: луч слегка огибает
 * поверхность, и видно дальше, чем по прямой.
 */
export const REFRACTION = 0.13;

export const HEIGHT_MAX = 10_000;
export const RADIUS_MIN = 100;
export const RADIUS_MAX = 50_000;

/** Рост стоящего человека: с такой высоты смотрят и такой высоты цель ищут, м. */
export const DEFAULT_HEIGHT = 1.7;
export const DEFAULT_RADIUS = 5000;

/** Зум данных о рельефе, на котором считается зона обзора: ячейка около 30 м. */
export const VIEW_ZOOM = 12;

/** Дальше стольких ячеек от наблюдателя зона считается по более грубой сетке. */
export const VIEW_MAX_STEPS = 1024;

/** Высоты за этими пределами на Земле не встречаются: это дефект данных. */
const LOWEST = -500;
const HIGHEST = 9000;

export function clampHeight(meters: number): number {
  return Math.max(0, Math.min(HEIGHT_MAX, meters));
}

export function clampRadius(meters: number): number {
  return Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, meters));
}

/** На сколько поверхность Земли уходит вниз от горизонтали на таком удалении, м. */
export function curvatureDrop(distance: number): number {
  return (distance * distance * (1 - REFRACTION)) / (2 * EARTH_RADIUS);
}

/** Дальность до видимого горизонта с высоты `height` над ровной поверхностью, м. */
export function horizonDistance(height: number): number {
  return Math.sqrt((2 * EARTH_RADIUS * Math.max(0, height)) / (1 - REFRACTION));
}

export interface SightPoint {
  position: LngLat;
  /** Расстояние от наблюдателя, м. */
  distance: number;
  /** Высота земли, м. */
  elevation: number;
  /** Высота луча от наблюдателя на цель над уровнем моря в этом месте, м. */
  ray: number;
  /** Видна ли отсюда цель заданной высоты, если поставить её в эту точку. */
  visible: boolean;
}

/** Отрезок линии, который виден или не виден целиком. */
export interface SightStretch {
  visible: boolean;
  from: number;
  to: number;
  path: LngLat[];
}

/** Место, которое закрывает цель сильнее всего. */
export interface Obstacle {
  position: LngLat;
  distance: number;
  elevation: number;
  /** На сколько земля здесь выше луча на цель, м. */
  excess: number;
}

export interface SightReport {
  length: number;
  observerHeight: number;
  targetHeight: number;
  /** Высота глаз наблюдателя и верха цели над уровнем моря, м. */
  eye: number;
  aim: number;
  /** Видна ли цель. */
  visible: boolean;
  /** Что закрывает цель; null — цель видна. */
  obstacle: Obstacle | null;
  /** С какой высоты над землёй цель показалась бы из-за преграды, м; null — видна и так. */
  needed: number | null;
  /** Сколько метров линии не просматривается. */
  hiddenLength: number;
  lowest: number;
  highest: number;
  points: SightPoint[];
  stretches: SightStretch[];
  /** Сколько высот восстановлено по соседним из-за выбросов в данных. */
  patched: number;
}

function between(a: LngLat, b: LngLat): LngLat {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * Линия видимости по снятому профилю: наблюдатель в начале линии, цель в конце.
 * Точка видна, если цель заданной высоты, поставленная в неё, поднимается над всем,
 * что лежит между ней и наблюдателем. Кривизна Земли и преломление учтены.
 */
export function sightLine(
  { samples, elevations, patched }: Survey,
  observerHeight: number,
  targetHeight: number,
): SightReport {
  const last = samples.length - 1;
  const length = samples[last]?.distance ?? 0;
  const eye = (elevations[0] ?? 0) + observerHeight;
  const aim = (elevations[last] ?? 0) + targetHeight;

  // Высоты приводятся к плоскости наблюдателя: дальняя земля опускается на величину кривизны.
  const level = (index: number) => elevations[index] - curvatureDrop(samples[index].distance);

  const visible: boolean[] = [];
  let horizon = -Infinity;
  let ridge = -1;
  /** Что закрывало обзор в тот момент, когда проверялась цель. */
  let blocker = -1;
  let blockerSlope = -Infinity;
  for (let i = 0; i <= last; i++) {
    const { distance } = samples[i];
    if (!(distance > 0)) {
      visible.push(true);
      continue;
    }
    if (i === last) {
      blocker = ridge;
      blockerSlope = horizon;
    }
    const ground = (level(i) - eye) / distance;
    visible.push((level(i) + targetHeight - eye) / distance >= horizon);
    if (ground > horizon) {
      horizon = ground;
      ridge = i;
    }
  }

  const slope = length > 0 ? (level(last) + targetHeight - eye) / length : 0;
  const ray = (distance: number) => eye + slope * distance + curvatureDrop(distance);

  const points = samples.map(
    ({ position, distance }, index): SightPoint => ({
      position,
      distance,
      elevation: elevations[index],
      ray: ray(distance),
      visible: visible[index],
    }),
  );

  // Каждая точка отвечает за отрезок до середины расстояния к соседним.
  const boundary = (index: number) => ({
    distance: (samples[index].distance + samples[index + 1].distance) / 2,
    position: between(samples[index].position, samples[index + 1].position),
  });
  const stretches: SightStretch[] = [];
  for (let i = 0; i <= last; i++) {
    const start = i === 0 ? samples[0] : boundary(i - 1);
    const end = i === last ? samples[last] : boundary(i);

    const open = stretches[stretches.length - 1];
    if (open && open.visible === visible[i]) {
      open.to = end.distance;
      open.path.push(samples[i].position, end.position);
    } else {
      stretches.push({
        visible: visible[i],
        from: start.distance,
        to: end.distance,
        path: [start.position, samples[i].position, end.position],
      });
    }
  }

  const seen = last < 1 || visible[last];
  return {
    length,
    observerHeight,
    targetHeight,
    eye,
    aim,
    visible: seen,
    obstacle:
      seen || blocker < 0
        ? null
        : {
            position: samples[blocker].position,
            distance: samples[blocker].distance,
            elevation: elevations[blocker],
            excess: elevations[blocker] - ray(samples[blocker].distance),
          },
    needed: seen ? null : eye + blockerSlope * length + curvatureDrop(length) - elevations[last],
    hiddenLength: stretches.reduce(
      (sum, stretch) => (stretch.visible ? sum : sum + stretch.to - stretch.from),
      0,
    ),
    lowest: elevations.length ? Math.min(...elevations) : 0,
    highest: elevations.length ? Math.max(...elevations) : 0,
    points,
    stretches,
    patched,
  };
}

/** Состояние линии видимости на расстоянии `distance` от наблюдателя. */
export function sightPointAt(report: SightReport, distance: number): SightPoint | null {
  const { points } = report;
  if (points.length === 0) return null;
  const at = Math.max(0, Math.min(report.length, distance));

  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (points[middle].distance <= at) low = middle;
    else high = middle;
  }
  const from = points[low];
  const to = points[high];
  const run = to.distance - from.distance;
  const share = run > 0 ? (at - from.distance) / run : 0;
  return {
    position: [
      from.position[0] + (to.position[0] - from.position[0]) * share,
      from.position[1] + (to.position[1] - from.position[1]) * share,
    ],
    distance: at,
    elevation: from.elevation + (to.elevation - from.elevation) * share,
    ray: from.ray + (to.ray - from.ray) * share,
    visible: (share < 0.5 ? from : to).visible,
  };
}

export interface ViewshedSpec {
  observer: LngLat;
  /** Радиус зоны, м. */
  radius: number;
  observerHeight: number;
  targetHeight: number;
}

/** Какой прямоугольник высот нужен для расчёта зоны. */
export interface GridPlan {
  zoom: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Метров в пикселе мировой сетки на этой широте. */
export function groundResolution(lat: number, zoom: number): number {
  return (
    (2 * Math.PI * MERCATOR_RADIUS * Math.cos((lat * Math.PI) / 180)) / (TILE_SIZE * 2 ** zoom)
  );
}

/** Сколько пикселей от наблюдателя до края зоны: считается по краю, где пиксели мельче всего. */
function reach({ observer, radius }: ViewshedSpec, zoom: number): number {
  const edge = Math.min(85, Math.abs(observer[1]) + (radius / EARTH_RADIUS) * (180 / Math.PI));
  return Math.ceil(radius / groundResolution(edge, zoom)) + 1;
}

/** Зум и прямоугольник высот под зону обзора. Большая зона считается по более грубой сетке. */
export function planGrid(spec: ViewshedSpec, maxZoom = VIEW_ZOOM, limit = VIEW_MAX_STEPS): GridPlan {
  let zoom = maxZoom;
  while (zoom > 0 && reach(spec, zoom) > limit) zoom -= 1;
  const steps = reach(spec, zoom);
  const [x, y] = lngLatToPixel(spec.observer[0], spec.observer[1], zoom);
  // Запас в пиксель с каждой стороны нужен интерполяции между соседними ячейками.
  const side = 2 * steps + 3;
  return {
    zoom,
    left: Math.floor(x) - steps - 1,
    top: Math.floor(y) - steps - 1,
    width: side,
    height: side,
  };
}

export const OUTSIDE = 0;
export const HIDDEN = 1;
export const VISIBLE = 2;

export interface Viewshed {
  zoom: number;
  /** Место растра в пикселях мировой сетки. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** По ячейке на пиксель, построчно: OUTSIDE — за краем зоны, HIDDEN, VISIBLE. */
  mask: Uint8Array;
  /** Площадь зоны и её видимой части, м². */
  area: number;
  visibleArea: number;
  /** Высота земли под наблюдателем, м. */
  ground: number;
  /** Размер ячейки у наблюдателя, м. */
  cell: number;
}

function plausible(value: number): boolean {
  return value >= LOWEST && value <= HIGHEST;
}

/** Выбросы в данных заменяются соседней высотой: одинокий провал не должен открывать обзор. */
function repaired(data: Float32Array): Float32Array {
  let first = 0;
  while (first < data.length && !plausible(data[first])) first += 1;
  if (first === 0 && data.every(plausible)) return data;

  const clean = new Float32Array(data);
  let previous = first < data.length ? data[first] : 0;
  for (let i = 0; i < clean.length; i++) {
    if (plausible(clean[i])) previous = clean[i];
    else clean[i] = previous;
  }
  return clean;
}

/**
 * Зона обзора: что видно с точки в заданном радиусе. От наблюдателя во все стороны идут лучи,
 * вдоль каждого запоминается самый высокий угол на уже пройденную землю; цель видна, если её
 * верх поднимается над этим углом. Лучей столько, чтобы у края зоны между ними не осталось
 * пропущенных ячеек.
 */
export function viewshed(grid: ElevationGrid, spec: ViewshedSpec): Viewshed {
  const { zoom } = grid;
  const { radius, observerHeight, targetHeight } = spec;
  const [ox, oy] = lngLatToPixel(spec.observer[0], spec.observer[1], zoom);
  const data = repaired(grid.data);

  const sample = (x: number, y: number): number => {
    const fx = Math.max(0, Math.min(grid.width - 1, x - 0.5 - grid.left));
    const fy = Math.max(0, Math.min(grid.height - 1, y - 0.5 - grid.top));
    const x0 = Math.min(grid.width - 2, Math.floor(fx));
    const y0 = Math.min(grid.height - 2, Math.floor(fy));
    const tx = fx - x0;
    const ty = fy - y0;
    const at = y0 * grid.width + x0;
    const top = data[at] + (data[at + 1] - data[at]) * tx;
    const bottom = data[at + grid.width] + (data[at + grid.width + 1] - data[at + grid.width]) * tx;
    return top + (bottom - top) * ty;
  };

  const steps = reach(spec, zoom);
  const left = Math.floor(ox) - steps;
  const top = Math.floor(oy) - steps;
  const side = 2 * steps + 1;

  // Размер пикселя в метрах зависит от широты: считается один раз на строку растра.
  const resolutions = new Float64Array(side + 1);
  for (let j = 0; j <= side; j++) {
    resolutions[j] = groundResolution(pixelToLngLat(0, top + j, zoom)[1], zoom);
  }
  const resolutionAt = (y: number): number => {
    const at = Math.max(0, Math.min(side - 1e-9, y - top));
    const row = Math.floor(at);
    return resolutions[row] + (resolutions[row + 1] - resolutions[row]) * (at - row);
  };
  const cell = resolutionAt(oy);

  const ground = sample(ox, oy);
  const eye = ground + observerHeight;

  const rays = Math.max(8, Math.ceil(2 * Math.PI * steps));
  const polar = new Uint8Array(rays * (steps + 1));
  for (let ray = 0; ray < rays; ray++) {
    const angle = (2 * Math.PI * ray) / rays;
    const dx = Math.sin(angle);
    const dy = -Math.cos(angle);
    let horizon = -Infinity;
    for (let step = 1; step <= steps; step++) {
      const x = ox + dx * step;
      const y = oy + dy * step;
      const distance = (step * (cell + resolutionAt(y))) / 2;
      if (distance > radius) break;
      const level = sample(x, y) - curvatureDrop(distance);
      const seen = (level + targetHeight - eye) / distance >= horizon;
      const slope = (level - eye) / distance;
      if (slope > horizon) horizon = slope;
      polar[ray * (steps + 1) + step] = seen ? VISIBLE : HIDDEN;
    }
  }

  const mask = new Uint8Array(side * side);
  let area = 0;
  let visibleArea = 0;
  for (let j = 0; j < side; j++) {
    const dy = top + j + 0.5 - oy;
    const resolution = (resolutions[j] + resolutions[j + 1]) / 2;
    const square = resolution * resolution;
    for (let i = 0; i < side; i++) {
      const dx = left + i + 0.5 - ox;
      const step = Math.round(Math.hypot(dx, dy));
      if (step > steps) continue;
      let value: number = VISIBLE;
      if (step >= 1) {
        const angle = Math.atan2(dx, -dy);
        const ray = Math.round(((angle < 0 ? angle + 2 * Math.PI : angle) / (2 * Math.PI)) * rays);
        value = polar[(ray % rays) * (steps + 1) + step];
      } else if (radius < cell / 2) {
        value = OUTSIDE;
      }
      if (value === OUTSIDE) continue;
      mask[j * side + i] = value;
      area += square;
      if (value === VISIBLE) visibleArea += square;
    }
  }

  return { zoom, left, top, width: side, height: side, mask, area, visibleArea, ground, cell };
}

/** Углы растра зоны на карте: левый верхний, правый верхний, правый нижний, левый нижний. */
export function viewshedCorners(zone: Pick<Viewshed, 'zoom' | 'left' | 'top' | 'width' | 'height'>): LngLat[] {
  const [west, north] = pixelToLngLat(zone.left, zone.top, zone.zoom);
  const [east, south] = pixelToLngLat(zone.left + zone.width, zone.top + zone.height, zone.zoom);
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
}

/** Видно ли место из зоны обзора; null — место за её краем. */
export function viewshedAt(zone: Viewshed, position: LngLat): boolean | null {
  const [x, y] = lngLatToPixel(position[0], position[1], zone.zoom);
  const column = Math.floor(x) - zone.left;
  const row = Math.floor(y) - zone.top;
  if (column < 0 || row < 0 || column >= zone.width || row >= zone.height) return null;
  const value = zone.mask[row * zone.width + column];
  return value === OUTSIDE ? null : value === VISIBLE;
}

/** Высота над землёй: «1,7 м», «12 м», «1 250 м». */
export function formatHeight(meters: number): string {
  const digits = Math.abs(meters) < 10 && !Number.isInteger(meters) ? 1 : 0;
  return `${meters.toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} м`;
}
