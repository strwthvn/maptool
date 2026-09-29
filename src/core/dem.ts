/** Высоты из DEM-тайлов в кодировке terrarium. */

export const TILE_SIZE = 256;

const MAX_MERCATOR_LAT = 85.05112878;

/** Возвращает высоты тайла построчно, TILE_SIZE × TILE_SIZE значений в метрах. */
export type TileLoader = (z: number, x: number, y: number) => Promise<Float32Array>;

export function decodeTerrarium(rgba: Uint8ClampedArray | Uint8Array): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    out[i] = rgba[j] * 256 + rgba[j + 1] + rgba[j + 2] / 256 - 32768;
  }
  return out;
}

/** Положение точки в пикселях мировой сетки Web Mercator на зуме z. */
export function lngLatToPixel(lng: number, lat: number, z: number): [number, number] {
  const size = TILE_SIZE * 2 ** z;
  const clamped = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  const x = ((lng + 180) / 360) * size;
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size;
  return [x, y];
}

/** Широта и долгота точки по её месту в пикселях мировой сетки на зуме z. */
export function pixelToLngLat(x: number, y: number, z: number): [lng: number, lat: number] {
  const size = TILE_SIZE * 2 ** z;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI;
  return [(x / size) * 360 - 180, lat];
}

/**
 * Прямоугольник высот в пикселях мировой сетки. Высота ячейки (i, j) относится к центру
 * пикселя: к точке (left + i + 0,5; top + j + 0,5).
 */
export interface ElevationGrid {
  zoom: number;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Высоты построчно, width × height значений в метрах. */
  data: Float32Array;
}

interface Spot {
  /** Тайлы четырёх пикселей: левый верхний, правый верхний, левый нижний, правый нижний. */
  tiles: [x: number, y: number][];
  /** Место каждого пикселя внутри своего тайла. */
  offsets: number[];
  tx: number;
  ty: number;
}

function blend({ offsets, tx, ty }: Spot, tiles: Float32Array[]): number {
  const [h00, h10, h01, h11] = tiles.map((tile, index) => tile[offsets[index]]);
  const top = h00 + (h10 - h00) * tx;
  const bottom = h01 + (h11 - h01) * tx;
  return top + (bottom - top) * ty;
}

export class DemSampler {
  private tiles = new Map<string, Promise<Float32Array>>();

  constructor(
    private load: TileLoader,
    readonly zoom = 12,
    private maxTiles = 256,
  ) {}

  /** Высота в точке, м. Билинейная интерполяция между центрами пикселей. */
  async elevation(lng: number, lat: number): Promise<number> {
    const spot = this.spot(lng, lat);
    const tiles = await Promise.all(spot.tiles.map(([x, y]) => this.tile(x, y)));
    return blend(spot, tiles);
  }

  /**
   * Высоты многих точек разом, м. Сначала загружаются все нужные тайлы, потом точки считаются
   * без ожидания — так профиль длинной линии не зависит от того, что кэш вытеснит по дороге.
   */
  async elevations(points: [lng: number, lat: number][]): Promise<number[]> {
    const spots = points.map(([lng, lat]) => this.spot(lng, lat));
    const loading = new Map<string, Promise<Float32Array>>();
    for (const spot of spots) {
      for (const [x, y] of spot.tiles) {
        const key = `${x}/${y}`;
        if (!loading.has(key)) loading.set(key, this.tile(x, y));
      }
    }
    const loaded = new Map<string, Float32Array>();
    await Promise.all(
      Array.from(loading, async ([key, tile]) => {
        loaded.set(key, await tile);
      }),
    );
    return spots.map((spot) =>
      blend(
        spot,
        spot.tiles.map(([x, y]) => loaded.get(`${x}/${y}`)!),
      ),
    );
  }

  /**
   * Высоты прямоугольника пикселей одним массивом — для расчётов, которым нужна вся местность
   * вокруг точки. За 180-м меридианом сетка продолжается с другой стороны мира, за краем
   * проекции у полюсов повторяется крайняя строка.
   */
  async grid(left: number, top: number, width: number, height: number): Promise<ElevationGrid> {
    const count = 2 ** this.zoom;
    const size = TILE_SIZE * count;
    const row = (y: number) => Math.max(0, Math.min(size - 1, y));
    const firstColumn = Math.floor(left / TILE_SIZE);
    const lastColumn = Math.floor((left + width - 1) / TILE_SIZE);
    const firstRow = Math.floor(row(top) / TILE_SIZE);
    const lastRow = Math.floor(row(top + height - 1) / TILE_SIZE);
    const wrap = (column: number) => ((column % count) + count) % count;

    const loading: Promise<[string, Float32Array]>[] = [];
    for (let y = firstRow; y <= lastRow; y++) {
      for (let x = firstColumn; x <= lastColumn; x++) {
        const key = `${wrap(x)}/${y}`;
        loading.push(this.tile(wrap(x), y).then((tile) => [key, tile]));
      }
    }
    const tiles = new Map(await Promise.all(loading));

    const data = new Float32Array(width * height);
    for (let j = 0; j < height; j++) {
      const y = row(top + j);
      const tileRow = Math.floor(y / TILE_SIZE);
      for (let column = firstColumn; column <= lastColumn; column++) {
        const from = Math.max(left, column * TILE_SIZE);
        const to = Math.min(left + width, (column + 1) * TILE_SIZE);
        const tile = tiles.get(`${wrap(column)}/${tileRow}`)!;
        const start = (y % TILE_SIZE) * TILE_SIZE + (from - column * TILE_SIZE);
        data.set(tile.subarray(start, start + to - from), j * width + (from - left));
      }
    }
    return { zoom: this.zoom, left, top, width, height, data };
  }

  /** Четыре соседних пикселя вокруг точки и её положение между ними. */
  private spot(lng: number, lat: number): Spot {
    const size = TILE_SIZE * 2 ** this.zoom;
    const [px, py] = lngLatToPixel(lng, lat, this.zoom);
    const fx = px - 0.5;
    const fy = py - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);

    const tiles: Spot['tiles'] = [];
    const offsets: number[] = [];
    for (const [x, y] of [
      [x0, y0],
      [x0 + 1, y0],
      [x0, y0 + 1],
      [x0 + 1, y0 + 1],
    ]) {
      const wx = ((x % size) + size) % size;
      const wy = Math.max(0, Math.min(size - 1, y));
      tiles.push([Math.floor(wx / TILE_SIZE), Math.floor(wy / TILE_SIZE)]);
      offsets.push((wy % TILE_SIZE) * TILE_SIZE + (wx % TILE_SIZE));
    }
    return { tiles, offsets, tx: fx - x0, ty: fy - y0 };
  }

  private tile(x: number, y: number): Promise<Float32Array> {
    const key = `${x}/${y}`;
    let tile = this.tiles.get(key);
    if (tile) {
      // Переставляем в конец: Map хранит порядок вставки, первым вытесняется давно не нужный тайл.
      this.tiles.delete(key);
    } else {
      tile = this.load(this.zoom, x, y);
      tile.catch(() => this.tiles.delete(key));
    }
    this.tiles.set(key, tile);
    if (this.tiles.size > this.maxTiles) {
      this.tiles.delete(this.tiles.keys().next().value!);
    }
    return tile;
  }
}
