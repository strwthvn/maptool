/** Масштаб карты в проекции Web Mercator. */

const EARTH_CIRCUMFERENCE = 40075016.686;

/** Размер тайла, от которого MapLibre отсчитывает зум. */
const ZOOM_TILE_SIZE = 512;

export function metersPerPixel(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / (ZOOM_TILE_SIZE * 2 ** zoom);
}

export interface ScaleBar {
  meters: number;
  px: number;
}

/** Наибольший отрезок вида 1, 2 или 5 × 10ⁿ метров, который помещается в maxPx. */
export function scaleBar(metersPerPx: number, maxPx: number): ScaleBar {
  const maxMeters = metersPerPx * maxPx;
  const magnitude = 10 ** Math.floor(Math.log10(maxMeters));
  const ratio = maxMeters / magnitude;
  const meters = (ratio >= 5 ? 5 : ratio >= 2 ? 2 : 1) * magnitude;
  return { meters, px: meters / metersPerPx };
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${trim(meters / 1000)} км`;
  return `${trim(meters)} м`;
}

function trim(value: number): string {
  return String(Number(value.toPrecision(3))).replace('.', ',');
}
