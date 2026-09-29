/** Движения камеры с поправкой на панели, которые закрывают часть карты. */

import type { Map as MlMap } from 'maplibre-gl';
import type { LngLat } from '../core/geodesy';
import type { Insets } from './insets';

/** С этого зума местность вокруг точки видна в подробностях. */
const POINT_ZOOM = 13;

/** Показывает точку по центру той части карты, которая не закрыта панелями. */
export function showPoint(map: MlMap, position: LngLat, insets: Insets): void {
  map.easeTo({
    center: position,
    zoom: Math.max(map.getZoom(), POINT_ZOOM),
    offset: [(insets.left - insets.right) / 2, -(insets.bottom ?? 0) / 2],
    duration: 800,
  });
}

/** Отступ от краёв видимой части карты до того, что на ней показывают. */
const MARGIN_PX = 100;

/** Показывает все точки разом; одну точку — как showPoint. */
export function showPoints(map: MlMap, points: LngLat[], insets: Insets): void {
  if (points.length === 0) return;
  let [west, south] = points[0];
  let [east, north] = points[0];
  for (const [lng, lat] of points) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  if (west === east && south === north) {
    showPoint(map, points[0], insets);
    return;
  }
  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    {
      padding: {
        top: MARGIN_PX,
        bottom: (insets.bottom ?? 0) + MARGIN_PX,
        left: insets.left + MARGIN_PX,
        right: insets.right + MARGIN_PX,
      },
      maxZoom: 15,
      // Без этого карта, повёрнутая пользователем, разворачивается на север.
      bearing: map.getBearing(),
      duration: 600,
    },
  );
}

/** Центр той части карты, которая не закрыта панелями. */
export function visibleCenter(map: MlMap, insets: Insets): LngLat {
  const { clientWidth, clientHeight } = map.getContainer();
  const x = insets.left + (clientWidth - insets.left - insets.right) / 2;
  const { lng, lat } = map.unproject([x, clientHeight / 2]);
  return [lng, lat];
}
