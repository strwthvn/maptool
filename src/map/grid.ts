/** Слой координатной сетки MGRS. Сетка строится заново под каждое положение карты. */

import type { GeoJSONSource, Map as MlMap, Point } from 'maplibre-gl';
import type { Feature } from 'geojson';
import type { LngLat } from '../core/geodesy';
import { buildGrid, gridStep, lineLabel, type Bounds, type Grid, type GridLine } from '../core/grid';
import { SQUARE } from '../core/mgrs';
import { metersPerPixel } from '../core/scale';
import type { Insets } from './insets';

const SOURCE = 'grid';
const LINES = 'grid-lines';
const LABELS = 'grid-labels';
const NAMES = 'grid-names';

/** Клетка сетки на экране не мельче этого размера, иначе шаг укрупняется. */
const MIN_CELL_PX = 40;

/**
 * Сетка строится не дальше стольких клеток от центра карты. В плане это больше экрана,
 * а при наклоне камеры не даёт тянуть линии до горизонта, где они сливаются.
 */
const MAX_CELLS_FROM_CENTER = 50;

/** Квадраты 100 км подписываются, пока их клетки крупные; мельче — буквы стоят у линий. */
const NAMES_FROM_STEP = 10_000;

/** Отступ подписей от краёв карты. */
const LABEL_MARGIN = { side: 24, top: 18, bottom: 16 };

const METERS_PER_DEGREE = 111_320;

const INK = {
  light: { line: '#1e1e22', text: '#1e1e22', halo: 'rgba(255, 255, 255, 0.85)' },
  dark: { line: '#edebe8', text: '#edebe8', halo: 'rgba(30, 30, 34, 0.85)' },
};

type Edge = 'left' | 'right' | 'top' | 'bottom';

/** Линии «на восток» подписываются снизу, линии «на север» — слева; остальные края — запасные. */
const EDGES: Record<'easting' | 'northing', Edge[]> = {
  easting: ['bottom', 'top', 'left', 'right'],
  northing: ['left', 'right', 'bottom', 'top'],
};

interface Frame {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function visibility(on: boolean): 'visible' | 'none' {
  return on ? 'visible' : 'none';
}

export class GridLayer {
  private on = false;
  private insets: Insets = { left: 0, right: 0 };
  private frame = 0;

  constructor(private map: MlMap) {
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: LINES,
      type: 'line',
      source: SOURCE,
      filter: ['==', ['get', 'part'], 'line'],
      layout: { visibility: 'none', 'line-join': 'round' },
      paint: {
        'line-color': INK.light.line,
        'line-width': ['match', ['get', 'weight'], 3, 2.4, 2, 1.8, 1, 1.4, 0.9],
        'line-opacity': ['match', ['get', 'weight'], 0, 0.7, 1, 0.8, 0.9],
      },
    });
    map.addLayer({
      id: NAMES,
      type: 'symbol',
      source: SOURCE,
      filter: ['==', ['get', 'part'], 'name'],
      layout: {
        visibility: 'none',
        'text-field': ['get', 'text'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 15,
        'text-letter-spacing': 0.08,
        'text-padding': 12,
      },
      paint: {
        'text-color': INK.light.text,
        'text-halo-color': INK.light.halo,
        'text-halo-width': 1.6,
        'text-opacity': 0.85,
      },
    });
    map.addLayer({
      id: LABELS,
      type: 'symbol',
      source: SOURCE,
      filter: ['==', ['get', 'part'], 'label'],
      layout: {
        visibility: 'none',
        'text-field': ['get', 'text'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 12,
        'text-padding': 3,
        // Подписи каждой десятой линии несут буквы квадрата и важнее остальных.
        'symbol-sort-key': ['-', 0, ['get', 'weight']],
      },
      paint: {
        'text-color': INK.light.text,
        'text-halo-color': INK.light.halo,
        'text-halo-width': 1.6,
      },
    });

    map.on('move', () => this.schedule());
    map.on('resize', () => this.schedule());
  }

  /** Включает и выключает сетку, подбирает цвет под подложку, запоминает места под панелями. */
  apply(on: boolean, dark: boolean, insets: Insets): void {
    const { map } = this;
    const ink = dark ? INK.dark : INK.light;
    this.on = on;
    this.insets = insets;

    for (const layer of [LINES, NAMES, LABELS]) {
      map.setLayoutProperty(layer, 'visibility', visibility(on));
    }
    map.setPaintProperty(LINES, 'line-color', ink.line);
    for (const layer of [NAMES, LABELS]) {
      map.setPaintProperty(layer, 'text-color', ink.text);
      map.setPaintProperty(layer, 'text-halo-color', ink.halo);
    }
    this.schedule();
  }

  private schedule(): void {
    if (!this.on || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.on) this.update();
    });
  }

  private update(): void {
    const { map } = this;
    const center = map.getCenter();
    const step = gridStep(metersPerPixel(center.lat, map.getZoom()), MIN_CELL_PX);
    const grid = buildGrid(this.bounds(step), step);

    const features: Feature[] = grid.lines.map((line) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: line.points },
      properties: { part: 'line', weight: line.weight },
    }));
    const point = (part: string, text: string, position: LngLat, weight = 0): Feature => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: position },
      properties: { part, text, weight },
    });

    const names = grid.step === 0 ? grid.zones : grid.step >= NAMES_FROM_STEP ? grid.squares : [];
    for (const name of names) features.push(point('name', name.text, name.position));
    features.push(...this.labels(grid).map(({ text, position, weight }) => point('label', text, position, weight)));

    map.getSource<GeoJSONSource>(SOURCE)?.setData({ type: 'FeatureCollection', features });
  }

  private bounds(step: number): Bounds {
    const { map } = this;
    const visible = map.getBounds();
    const bounds = {
      west: visible.getWest(),
      east: visible.getEast(),
      south: visible.getSouth(),
      north: visible.getNorth(),
    };
    if (step === 0) return bounds;

    const center = map.getCenter();
    const reach = step * MAX_CELLS_FROM_CENTER;
    const latReach = reach / METERS_PER_DEGREE;
    const lngReach = latReach / Math.max(0.05, Math.cos((center.lat * Math.PI) / 180));
    return {
      west: Math.max(bounds.west, center.lng - lngReach),
      east: Math.min(bounds.east, center.lng + lngReach),
      south: Math.max(bounds.south, center.lat - latReach),
      north: Math.min(bounds.north, center.lat + latReach),
    };
  }

  /** Подписи линий — там, где линии пересекают края видимой части карты. */
  private labels(grid: Grid): { text: string; position: LngLat; weight: number }[] {
    if (grid.step === 0 || grid.step >= SQUARE) return [];
    const container = this.map.getContainer();
    const frame: Frame = {
      left: this.insets.left + LABEL_MARGIN.side,
      right: container.clientWidth - this.insets.right - LABEL_MARGIN.side,
      top: LABEL_MARGIN.top,
      bottom: container.clientHeight - (this.insets.bottom ?? 0) - LABEL_MARGIN.bottom,
    };

    const labels = [];
    for (const line of grid.lines) {
      if (line.kind === 'zone') continue;
      const position = this.anchor(line, frame);
      if (!position) continue;
      labels.push({ text: lineLabel(line, grid.step, position), position, weight: line.weight });
    }
    return labels;
  }

  private anchor(line: GridLine, frame: Frame): LngLat | null {
    const screen = line.points.map((point) => this.map.project(point));
    for (const edge of EDGES[line.kind as 'easting' | 'northing']) {
      const at = crossing(screen, line.points, edge, frame);
      if (at) return at;
    }
    return null;
  }
}

/** Точка линии, в которой она пересекает край рамки. */
function crossing(screen: Point[], points: LngLat[], edge: Edge, frame: Frame): LngLat | null {
  const vertical = edge === 'left' || edge === 'right';
  const level = frame[edge];
  const [from, to] = vertical ? [frame.top, frame.bottom] : [frame.left, frame.right];

  for (let i = 1; i < screen.length; i++) {
    const a = screen[i - 1];
    const b = screen[i];
    const [a1, b1] = vertical ? [a.x, b.x] : [a.y, b.y];
    if (a1 === b1 || (a1 - level) * (b1 - level) > 0) continue;

    const t = (level - a1) / (b1 - a1);
    const along = vertical ? a.y + t * (b.y - a.y) : a.x + t * (b.x - a.x);
    if (along < from || along > to) continue;

    const [p, q] = [points[i - 1], points[i]];
    return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
  }
  return null;
}
