/** Расчёт зоны обзора вне основного потока: страница не замирает, пока он идёт. */

import type { ElevationGrid } from '../core/dem';
import { VISIBLE, viewshed, type Viewshed, type ViewshedSpec } from '../core/los';

export interface ViewshedRequest {
  id: number;
  grid: ElevationGrid;
  spec: ViewshedSpec;
  /** Цвет заливки видимой части. */
  tint: [red: number, green: number, blue: number];
}

export type ViewshedResponse =
  | { id: number; zone: Viewshed; image: Blob }
  | { id: number; error: string };

/** Картинка зоны для карты: видимое залито цветом, остальное прозрачно. */
function paint(zone: Viewshed, [red, green, blue]: ViewshedRequest['tint']): Promise<Blob> {
  const pixels = new Uint8ClampedArray(zone.width * zone.height * 4);
  for (let i = 0, j = 0; i < zone.mask.length; i++, j += 4) {
    if (zone.mask[i] !== VISIBLE) continue;
    pixels[j] = red;
    pixels[j + 1] = green;
    pixels[j + 2] = blue;
    pixels[j + 3] = 255;
  }
  const canvas = new OffscreenCanvas(zone.width, zone.height);
  canvas.getContext('2d')!.putImageData(new ImageData(pixels, zone.width, zone.height), 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

addEventListener('message', async (event: MessageEvent<ViewshedRequest>) => {
  const { id, grid, spec, tint } = event.data;
  try {
    const zone = viewshed(grid, spec);
    const image = await paint(zone, tint);
    postMessage({ id, zone, image } satisfies ViewshedResponse, { transfer: [zone.mask.buffer] });
  } catch (error) {
    postMessage({ id, error: String(error) } satisfies ViewshedResponse);
  }
});
