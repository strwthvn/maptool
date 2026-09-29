import { describe, expect, it, vi } from 'vitest';
import {
  DemSampler,
  TILE_SIZE,
  decodeTerrarium,
  lngLatToPixel,
  pixelToLngLat,
  type TileLoader,
} from './dem';

/** Высота равна мировой координате пикселя: h = ax·X + ay·Y. */
function planeLoader(ax: number, ay: number): TileLoader {
  return async (_z, x, y) => {
    const data = new Float32Array(TILE_SIZE * TILE_SIZE);
    for (let row = 0; row < TILE_SIZE; row++) {
      for (let col = 0; col < TILE_SIZE; col++) {
        data[row * TILE_SIZE + col] = ax * (x * TILE_SIZE + col) + ay * (y * TILE_SIZE + row);
      }
    }
    return data;
  };
}

describe('decodeTerrarium', () => {
  it('декодирует уровень моря, положительные и отрицательные высоты', () => {
    const rgba = new Uint8Array([128, 0, 0, 255, 130, 62, 128, 255, 127, 0, 0, 255]);
    expect(Array.from(decodeTerrarium(rgba))).toEqual([0, 574.5, -256]);
  });
});

describe('lngLatToPixel', () => {
  it('ставит нулевую точку в центр мира', () => {
    expect(lngLatToPixel(0, 0, 0)).toEqual([128, 128]);
  });

  it('попадает в известный тайл над Джелалабадом', () => {
    const [x, y] = lngLatToPixel(70.45, 34.43, 12);
    expect(Math.floor(x / TILE_SIZE)).toBe(2849);
    expect(Math.floor(y / TILE_SIZE)).toBe(1630);
  });

  it('ограничивает широту пределами проекции', () => {
    expect(lngLatToPixel(0, 90, 0)[1]).toBeCloseTo(0, 6);
    expect(lngLatToPixel(0, -90, 0)[1]).toBeCloseTo(256, 6);
  });
});

describe('pixelToLngLat', () => {
  it('обратна lngLatToPixel', () => {
    for (const [lng, lat] of [
      [70.45, 34.43],
      [-122.4, 37.8],
      [0, -60],
    ]) {
      const [x, y] = lngLatToPixel(lng, lat, 12);
      const [backLng, backLat] = pixelToLngLat(x, y, 12);
      expect(backLng).toBeCloseTo(lng, 9);
      expect(backLat).toBeCloseTo(lat, 9);
    }
  });
});

describe('DemSampler', () => {
  it('на наклонной плоскости даёт точное значение, в том числе на стыке тайлов', async () => {
    const sampler = new DemSampler(planeLoader(2, 3), 12);
    // Стык четырёх тайлов: пиксели по обе стороны границы берутся из разных тайлов.
    const size = TILE_SIZE * 2 ** 12;
    const px = 2849 * TILE_SIZE + 0.2;
    const py = 1630 * TILE_SIZE - 0.1;
    const lng = (px / size) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / size))) * 180) / Math.PI;

    const h = await sampler.elevation(lng, lat);
    expect(h).toBeCloseTo(2 * (px - 0.5) + 3 * (py - 0.5), 3);
  });

  it('не запрашивает один и тот же тайл дважды', async () => {
    const load = vi.fn(planeLoader(1, 0));
    const sampler = new DemSampler(load, 12);
    await sampler.elevation(70.45, 34.43);
    await sampler.elevation(70.4501, 34.4301);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('после ошибки загрузки пробует тайл заново', async () => {
    const good = planeLoader(0, 0);
    const load = vi
      .fn<TileLoader>()
      .mockRejectedValueOnce(new Error('сеть'))
      .mockImplementation(good);
    const sampler = new DemSampler(load, 12);
    await expect(sampler.elevation(70.45, 34.43)).rejects.toThrow('сеть');
    await expect(sampler.elevation(70.45, 34.43)).resolves.toBe(0);
  });

  it('вытесняет давно не использованные тайлы', async () => {
    const load = vi.fn(planeLoader(0, 0));
    const sampler = new DemSampler(load, 12, 2);
    await sampler.elevation(70.45, 34.43);
    await sampler.elevation(71.45, 34.43);
    await sampler.elevation(72.45, 34.43);
    await sampler.elevation(70.45, 34.43);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('считает высоты многих точек так же, как по одной', async () => {
    const sampler = new DemSampler(planeLoader(2, -1), 12);
    const points: [number, number][] = [
      [70.45, 34.43],
      [70.52, 34.47],
      [70.61, 34.39],
    ];
    const together = await sampler.elevations(points);
    const apart = await Promise.all(points.map(([lng, lat]) => sampler.elevation(lng, lat)));
    expect(together).toEqual(apart);
  });

  it('считает линию через много тайлов, даже когда кэш меньше линии', async () => {
    const load = vi.fn(planeLoader(1, 0));
    const sampler = new DemSampler(load, 12, 2);
    const points = Array.from({ length: 40 }, (_, i): [number, number] => [70 + i * 0.05, 34.43]);
    const heights = await sampler.elevations(points);
    expect(heights).toHaveLength(40);
    for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeGreaterThan(heights[i - 1]);
    // Каждый тайл запрошен один раз, хотя в кэше помещаются только два.
    const asked = load.mock.calls.map(([, x, y]) => `${x}/${y}`);
    expect(new Set(asked).size).toBe(asked.length);
  });

  it('сообщает об ошибке, если хотя бы один тайл линии не загрузился', async () => {
    const load = vi.fn<TileLoader>().mockRejectedValue(new Error('сеть'));
    const sampler = new DemSampler(load, 12);
    await expect(sampler.elevations([[70.45, 34.43]])).rejects.toThrow('сеть');
  });

  it('собирает прямоугольник высот из нескольких тайлов', async () => {
    const load = vi.fn(planeLoader(2, 3));
    const sampler = new DemSampler(load, 12);
    const left = 2849 * TILE_SIZE - 3;
    const top = 1630 * TILE_SIZE - 2;
    const grid = await sampler.grid(left, top, 8, 5);
    expect(grid).toMatchObject({ zoom: 12, left, top, width: 8, height: 5 });
    expect(grid.data).toHaveLength(40);
    for (let j = 0; j < 5; j++) {
      for (let i = 0; i < 8; i++) {
        expect(grid.data[j * 8 + i]).toBe(2 * (left + i) + 3 * (top + j));
      }
    }
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('высота из прямоугольника та же, что в точке', async () => {
    const sampler = new DemSampler(planeLoader(2, -1), 12);
    const [x, y] = lngLatToPixel(70.45, 34.43, 12);
    const grid = await sampler.grid(Math.floor(x), Math.floor(y), 1, 1);
    const [lng, lat] = pixelToLngLat(Math.floor(x) + 0.5, Math.floor(y) + 0.5, 12);
    expect(grid.data[0]).toBeCloseTo(await sampler.elevation(lng, lat), 3);
  });

  it('за 180-м меридианом прямоугольник продолжается с другой стороны мира', async () => {
    const load = vi.fn(planeLoader(1, 0));
    const sampler = new DemSampler(load, 3);
    const size = TILE_SIZE * 8;
    const grid = await sampler.grid(size - 2, 100, 4, 1);
    expect(Array.from(grid.data)).toEqual([size - 2, size - 1, 0, 1]);
    const left = await sampler.grid(-2, 100, 4, 1);
    expect(Array.from(left.data)).toEqual([size - 2, size - 1, 0, 1]);
  });

  it('за краем проекции повторяет крайнюю строку', async () => {
    const sampler = new DemSampler(planeLoader(0, 1), 3);
    const grid = await sampler.grid(10, -2, 1, 4);
    expect(Array.from(grid.data)).toEqual([0, 0, 0, 1]);
  });
});
