import { describe, expect, it } from 'vitest';
import { fileStem, snapshotName, snapshotTitle, visibleFrame } from './snapshot';

describe('visibleFrame', () => {
  const size = { width: 1316, height: 864 };

  it('без панелей в снимок идёт вся карта', () => {
    expect(visibleFrame(size, { left: 0, right: 0 }, 1)).toEqual({
      x: 0,
      y: 0,
      width: 1316,
      height: 864,
    });
  });

  it('закрытое панелями в снимок не идёт', () => {
    expect(visibleFrame(size, { left: 320, right: 320, bottom: 210 }, 1)).toEqual({
      x: 320,
      y: 0,
      width: 676,
      height: 654,
    });
  });

  it('на плотном экране считает в пикселях холста', () => {
    expect(visibleFrame(size, { left: 320, right: 0 }, 2)).toEqual({
      x: 640,
      y: 0,
      width: 1992,
      height: 1728,
    });
  });

  it('панели шире карты не оставляют снимок пустым', () => {
    const frame = visibleFrame({ width: 390, height: 700 }, { left: 320, right: 320, bottom: 900 }, 1);
    expect(frame.width).toBeGreaterThanOrEqual(1);
    expect(frame.height).toBeGreaterThanOrEqual(64);
    expect(frame.x + frame.width).toBeLessThanOrEqual(390);
  });
});

describe('имя и подпись снимка', () => {
  it('имя файла — название сценария и ход', () => {
    expect(snapshotName('Операция «Горный лев»', 12)).toBe('Операция «Горный лев» — ход 12.png');
  });

  it('из названия убирается то, что не годится для имени файла', () => {
    expect(fileStem('Хост / Гардез: 2003?', 'Карта')).toBe('Хост Гардез 2003');
    expect(snapshotName('  ', 0)).toBe('Карта — ход 0.png');
    expect(fileStem('***', 'Сценарий')).toBe('Сценарий');
  });

  it('подпись называет сценарий, ход и время', () => {
    expect(snapshotTitle('Джелалабад', 3, '14.06.2003 06:00')).toBe(
      'Джелалабад · Ход 3 · 14.06.2003 06:00',
    );
    expect(snapshotTitle('', 0, '+0:00')).toBe('Ход 0 · +0:00');
  });
});
