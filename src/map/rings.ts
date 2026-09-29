/** Слой колец вокруг фишек: дальности оружия и досягаемость за ход. Кольца мышью не трогаются. */

import type { FilterSpecification, GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import type { Feature } from 'geojson';
import type { LngLat } from '../core/geodesy';
import { graphicInk, type GraphicColor } from '../core/graphics';
import {
  ringLabelAt,
  ringLabelAzimuth,
  ringPath,
  type Ring,
  type RingKind,
} from '../core/rings';

const SOURCE = 'rings';

const WIDTH_PX = 1.75;
const CASING_EXTRA_PX = 2;

/** Досягаемость рисуется штрихами: её не спутать с дальностью оружия. */
const REACH_DASH = [4, 3];

export interface RingSet {
  center: LngLat;
  color: GraphicColor;
  rings: Ring[];
}

function lines(kind: RingKind): FilterSpecification {
  return ['all', ['==', ['get', 'part'], 'ring'], ['==', ['get', 'kind'], kind]];
}

/** Какой стороной подпись примыкает к кольцу в точке с данным азимутом от центра. */
function anchorAt(azimuth: number): string {
  const vertical = azimuth > 90 && azimuth < 270 ? 'top' : 'bottom';
  if (azimuth % 180 === 0) return vertical;
  return `${vertical}-${azimuth < 180 ? 'left' : 'right'}`;
}

export class RingLayer {
  constructor(private map: MlMap) {
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'rings-casing',
      type: 'line',
      source: SOURCE,
      filter: ['==', ['get', 'part'], 'ring'],
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'casing'],
        'line-width': WIDTH_PX + CASING_EXTRA_PX,
        'line-opacity': 0.7,
      },
    });
    map.addLayer({
      id: 'rings-weapon',
      type: 'line',
      source: SOURCE,
      filter: lines('weapon'),
      layout: { 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': WIDTH_PX },
    });
    map.addLayer({
      id: 'rings-reach',
      type: 'line',
      source: SOURCE,
      filter: lines('reach'),
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': WIDTH_PX,
        'line-dasharray': REACH_DASH,
      },
    });
    map.addLayer({
      id: 'rings-labels',
      type: 'symbol',
      source: SOURCE,
      filter: ['==', ['get', 'part'], 'label'],
      layout: {
        'text-field': ['get', 'text'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 11.5,
        'text-max-width': 40,
        // Подпись стоит снаружи кольца: примыкает к нему той стороной, что смотрит на центр.
        'text-anchor': ['get', 'anchor'],
        'text-offset': [
          'match',
          ['get', 'anchor'],
          'bottom',
          ['literal', [0, -0.35]],
          'top',
          ['literal', [0, 0.35]],
          'bottom-left',
          ['literal', [0.3, -0.3]],
          'bottom-right',
          ['literal', [-0.3, -0.3]],
          'top-left',
          ['literal', [0.3, 0.3]],
          ['literal', [-0.3, 0.3]],
        ],
        // На мелком масштабе подписи близких колец не помещаются: остаются подписи дальних.
        'symbol-sort-key': ['get', 'order'],
      },
      paint: {
        'text-color': ['get', 'ink'],
        'text-halo-color': ['get', 'halo'],
        'text-halo-width': 2,
      },
    });
  }

  /** Приводит слой в соответствие с фишками и их кольцами. */
  sync(sets: RingSet[]): void {
    const features: Feature[] = [];
    for (const { center, color, rings } of sets) {
      const ink = graphicInk(color);
      const seen: Record<RingKind, number> = { weapon: 0, reach: 0 };
      const total = (kind: RingKind) => rings.filter((ring) => ring.kind === kind).length;
      for (const ring of rings) {
        const index = seen[ring.kind]++;
        const azimuth = ringLabelAzimuth(ring.kind, index, total(ring.kind));
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: ringPath(center, ring.radius) },
          properties: { part: 'ring', kind: ring.kind, color: ink.line, casing: ink.casing },
        });
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: ringLabelAt(center, ring, index, total(ring.kind)),
          },
          properties: {
            part: 'label',
            kind: ring.kind,
            anchor: anchorAt(azimuth),
            order: -ring.radius,
            text: ring.label,
            ink: ink.text,
            halo: ink.halo,
          },
        });
      }
    }
    this.map.getSource<GeoJSONSource>(SOURCE)?.setData({ type: 'FeatureCollection', features });
  }
}
