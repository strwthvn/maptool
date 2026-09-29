/**
 * Слой фишек на карте: отрисовка, выделение, перетаскивание, постановка новых.
 * События карты слой сам не слушает: их раздаёт MapView, чтобы слои не спорили за нажатие.
 */

import type { GeoJSONSource, Map as MlMap, MapMouseEvent, MapTouchEvent, Point } from 'maplibre-gl';
import { sidc, type Unit } from '../core/units';
import {
  addUnit,
  beginMove,
  endMove,
  moveUnit,
  scenario,
  select,
  selection,
} from '../model/scenario.svelte';
import { tools } from '../model/tools.svelte';
import type { Insets } from './insets';
import { surfaceAt } from './pointer';
import { symbolImage, type SymbolImage } from './symbols';

const SOURCE = 'units';
const LAYER = 'units';

const PIXEL_RATIO = 2;

/** Сдвиг курсора, после которого нажатие считается перетаскиванием, а не щелчком. */
const DRAG_THRESHOLD_PX = 4;

/** Ненужные картинки убираются не сразу: карта может ещё дорисовывать кадр с ними. */
const PRUNE_DELAY_MS = 2000;

type PointerEvent = MapMouseEvent | MapTouchEvent;

export class UnitLayer {
  /** Загруженные в карту картинки и место знака внутри каждой. */
  private images = new Map<string, SymbolImage['box']>();
  private used = new Set<string>();
  private pruneTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private map: MlMap) {
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: LAYER,
      type: 'symbol',
      source: SOURCE,
      layout: {
        'icon-image': ['get', 'image'],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['get', 'order'],
      },
    });

  }

  /** Приводит слой в соответствие со сценарием. */
  sync(units: Unit[], selectedId: string | null): void {
    this.used.clear();
    const features = units.map((unit) => {
      const selected = unit.id === selectedId;
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: unit.position },
        properties: { image: this.image(unit, selected), order: selected ? 1 : 0 },
      };
    });
    this.map.getSource<GeoJSONSource>(SOURCE)?.setData({ type: 'FeatureCollection', features });

    clearTimeout(this.pruneTimer);
    this.pruneTimer = setTimeout(() => this.prune(), PRUNE_DELAY_MS);
  }

  /** Перерисовывает все знаки, например когда догрузился шрифт подписей. */
  redraw(units: Unit[], selectedId: string | null): void {
    for (const image of this.images.keys()) this.map.removeImage(image);
    this.images.clear();
    this.sync(units, selectedId);
  }

  private prune(): void {
    for (const image of this.images.keys()) {
      if (this.used.has(image)) continue;
      this.map.removeImage(image);
      this.images.delete(image);
    }
  }

  private imageKey(unit: Unit, selected: boolean): string {
    return `unit:${sidc(unit)}:${selected ? 1 : 0}:${unit.callsign.trim()}`;
  }

  private image(unit: Unit, selected: boolean): string {
    const key = this.imageKey(unit, selected);
    if (!this.images.has(key)) {
      const { data, pixelRatio, box } = symbolImage(unit, unit.callsign.trim(), selected, PIXEL_RATIO);
      this.map.addImage(key, data, { pixelRatio });
      this.images.set(key, box);
    }
    this.used.add(key);
    return key;
  }

  /** Фишка под точкой экрана. Выделенная проверяется первой, дальше — в порядке отрисовки сверху вниз. */
  unitAt(point: Point): Unit | undefined {
    const hit = (unit: Unit) => {
      const box = this.images.get(this.imageKey(unit, unit.id === selection.unitId));
      if (!box) return false;
      const at = point.sub(this.map.project(unit.position));
      return at.x >= box.left && at.x <= box.right && at.y >= box.top && at.y <= box.bottom;
    };
    const units = scenario.units;
    const selected = units.find((unit) => unit.id === selection.unitId);
    if (selected && hit(selected)) return selected;
    return units.findLast(hit);
  }

  /** Курсор, который нужен фишкам в этой точке, или null, если им всё равно. */
  hover(event: MapMouseEvent): string | null {
    if (tools.placing) return 'crosshair';
    return this.unitAt(event.point) ? 'move' : null;
  }

  click(event: MapMouseEvent): boolean {
    if (tools.placing) {
      const unit = addUnit(tools.placing, [event.lngLat.lng, event.lngLat.lat]);
      const more = event.originalEvent.shiftKey;
      select(unit.id, !more);
      if (!more) tools.placing = null;
      return true;
    }
    if (this.unitAt(event.point)) return true;
    select(null);
    return false;
  }

  press(
    event: PointerEvent,
    moveEvent: 'mousemove' | 'touchmove',
    endEvent: 'mouseup' | 'touchend',
  ): boolean {
    if (tools.placing) return false;
    const unit = this.unitAt(event.point);
    if (!unit) return false;

    // Иначе карта начнёт двигаться вместе с фишкой.
    event.preventDefault();
    select(unit.id);

    const { map } = this;
    const start = event.point;
    const grip = map.project(unit.position).sub(start);
    let moving = false;

    const move = (next: PointerEvent) => {
      if (!moving) {
        if (next.point.dist(start) < DRAG_THRESHOLD_PX) return;
        moving = true;
        beginMove();
      }
      // Фишка, которую вытащили на небо, остаётся там, где была над горизонтом.
      const position = surfaceAt(map, next.point.add(grip));
      if (position) moveUnit(unit.id, position);
    };
    const end = () => {
      map.off(moveEvent, move);
      if (moving) endMove();
    };

    map.on(moveEvent, move);
    map.once(endEvent, end);
    return true;
  }
}

/** Показывает фишку по центру той части карты, которая не закрыта панелями. */
export function showUnit(map: MlMap, unit: Unit, insets: Insets): void {
  map.easeTo({
    center: unit.position,
    zoom: Math.max(map.getZoom(), 12),
    offset: [(insets.left - insets.right) / 2, 0],
    duration: 600,
  });
}
