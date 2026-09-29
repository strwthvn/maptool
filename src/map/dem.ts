/** Загрузка DEM-тайлов в браузере и общий на всё приложение источник высот. */

import { DemSampler, TILE_SIZE, decodeTerrarium, type TileLoader } from '../core/dem';
import { DEM_TILES } from './sources';

const loadTile: TileLoader = async (z, x, y) => {
  const url = DEM_TILES.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`DEM-тайл ${z}/${x}/${y}: HTTP ${response.status}`);

  // Любое преобразование цвета исказило бы высоты, зашитые в каналы.
  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0, TILE_SIZE, TILE_SIZE);
  bitmap.close();
  return decodeTerrarium(context.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data);
};

export const dem = new DemSampler(loadTile);

const others = new Map<number, DemSampler>();

/** Источник высот на другом зуме: большая зона обзора считается по более грубой сетке. */
export function demAt(zoom: number): DemSampler {
  if (zoom === dem.zoom) return dem;
  let sampler = others.get(zoom);
  if (!sampler) {
    sampler = new DemSampler(loadTile, zoom);
    others.set(zoom, sampler);
  }
  return sampler;
}
