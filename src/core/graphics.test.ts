import { describe, expect, it } from 'vitest';
import { distance, inverse, type LngLat } from './geodesy';
import {
  aimSector,
  arrowHeading,
  createGraphic,
  defaultStyle,
  graphicTitle,
  labelAnchor,
  outline,
  readGraphic,
  sectorArc,
  sectorHandles,
  spreadSector,
  type Graphic,
} from './graphics';
import { fromMercator, heading, toMercator, translate } from './mercator';
import { emptyScenario, parseScenario, readScenario, serializeScenario } from './scenario';

const A: LngLat = [70.4, 34.4];
const B: LngLat = [70.5, 34.4];
const C: LngLat = [70.5, 34.5];
const D: LngLat = [70.4, 34.5];

function make(kind: Graphic['kind'], points: LngLat[], patch: Partial<Graphic> = {}): Graphic {
  return { ...createGraphic(kind, defaultStyle(), points)!, ...patch };
}

describe('проекция', () => {
  it('переводит туда и обратно', () => {
    const [lng, lat] = fromMercator(toMercator([70.45, 34.43]));
    expect(lng).toBeCloseTo(70.45, 10);
    expect(lat).toBeCloseTo(34.43, 10);
    expect(toMercator([0, 0])).toEqual([0.5, 0.5]);
  });

  it('даёт направление отрезка на карте', () => {
    expect(heading(A, D)).toBeCloseTo(0, 6);
    expect(heading(A, B)).toBeCloseTo(90, 6);
    expect(heading(C, B)).toBeCloseTo(180, 6);
    expect(heading(B, A)).toBeCloseTo(270, 6);
  });

  it('переносит фигуру, сохраняя её форму на карте', () => {
    const moved = translate([A, B, C], A, [71, 36]);
    expect(moved[0][0]).toBeCloseTo(71, 10);
    expect(moved[0][1]).toBeCloseTo(36, 10);
    // По долготе сдвиг одинаков для всех точек, по широте — одинаков в проекции.
    expect(moved[1][0] - moved[0][0]).toBeCloseTo(0.1, 10);
    expect(heading(moved[0], moved[2])).toBeCloseTo(heading(A, C), 6);
  });
});

describe('создание знака', () => {
  it('требует столько точек, сколько нужно знаку', () => {
    expect(createGraphic('line', defaultStyle(), [A])).toBeNull();
    expect(createGraphic('area', defaultStyle(), [A, B])).toBeNull();
    expect(createGraphic('sector', defaultStyle(), [A])).toBeNull();
    expect(createGraphic('point', defaultStyle(), [])).toBeNull();
    expect(createGraphic('line', defaultStyle(), [A, B])?.points).toEqual([A, B]);
    expect(createGraphic('point', defaultStyle(), [A])?.points).toEqual([A]);
  });

  it('берёт стиль и не делит точки с исходным массивом', () => {
    const points = [A, B];
    const style = { ...defaultStyle(), color: 'hostile' as const, dash: 'dashed' as const };
    const graphic = createGraphic('arrow', style, points)!;
    expect(graphic.color).toBe('hostile');
    expect(graphic.dash).toBe('dashed');
    expect(graphic.points[0]).not.toBe(points[0]);
  });

  it('строит сектор по вершине и точке на оси', () => {
    const sector = createGraphic('sector', defaultStyle(), [A, D])!;
    expect(sector.points).toEqual([A]);
    expect(sector.azimuth).toBeCloseTo(0, 6);
    expect(sector.range).toBeCloseTo(distance(A, D), 6);
    expect(sector.spread).toBe(60);
  });

  it('не строит сектор нулевой дальности', () => {
    expect(createGraphic('sector', defaultStyle(), [A, A])).toBeNull();
  });

  it('называет знак подписью, а без неё — видом', () => {
    expect(graphicTitle(make('line', [A, B]))).toBe('Линия');
    expect(graphicTitle(make('line', [A, B], { label: ' Рубеж 1 ' }))).toBe('Рубеж 1');
  });
});

describe('сектор', () => {
  const sector = make('sector', [A, D], { azimuth: 90, spread: 60, range: 2000 });

  it('дуга лежит на заданной дальности в пределах раствора', () => {
    const arc = sectorArc(sector);
    expect(arc).toHaveLength(21);
    for (const point of arc) {
      const aim = inverse(A, point);
      expect(aim.distance).toBeCloseTo(2000, 3);
      expect(aim.azimuth).toBeGreaterThan(59.999);
      expect(aim.azimuth).toBeLessThan(120.001);
    }
    expect(inverse(A, arc[0]).azimuth).toBeCloseTo(60, 6);
    expect(inverse(A, arc.at(-1)!).azimuth).toBeCloseTo(120, 6);
  });

  it('контур идёт из вершины по дуге обратно в вершину', () => {
    const { path, closed } = outline(sector)!;
    expect(closed).toBe(true);
    expect(path[0]).toEqual(A);
    expect(path.at(-1)).toEqual(A);
    expect(path).toHaveLength(23);
  });

  it('полный круг рисуется без радиусов', () => {
    const { path } = outline({ ...sector, spread: 360 })!;
    expect(path[0]).not.toEqual(A);
    expect(distance(path[0], path.at(-1)!)).toBeLessThan(0.001);
  });

  it('ручки стоят на оси и на краях дуги', () => {
    const { reach, left, right } = sectorHandles(sector);
    expect(inverse(A, reach).azimuth).toBeCloseTo(90, 6);
    expect(inverse(A, left).azimuth).toBeCloseTo(60, 6);
    expect(inverse(A, right).azimuth).toBeCloseTo(120, 6);
  });

  it('ручка на оси задаёт направление и дальность', () => {
    const aimed = aimSector(sector, D);
    expect(aimed.azimuth).toBeCloseTo(0, 6);
    expect(aimed.range).toBeCloseTo(distance(A, D), 6);
    expect(aimSector(sector, A)).toEqual({ azimuth: 90, range: 2000 });
  });

  it('ручка на краю задаёт раствор, с какой бы стороны от оси она ни была', () => {
    expect(spreadSector(sector, [70.41, 34.4])).toBe(1);
    expect(spreadSector({ ...sector, azimuth: 0 }, [70.5, 34.4])).toBe(180);
    expect(spreadSector({ ...sector, azimuth: 0 }, [70.3, 34.4])).toBe(180);
    expect(spreadSector({ ...sector, azimuth: 350 }, [70.4 + 0.01, 34.5])).toBeGreaterThan(20);
    expect(spreadSector({ ...sector, azimuth: 0 }, [70.4, 34.3])).toBe(360);
  });

  it('подпись стоит на оси внутри сектора', () => {
    const aim = inverse(A, labelAnchor(sector));
    expect(aim.azimuth).toBeCloseTo(90, 6);
    expect(aim.distance).toBeGreaterThan(1000);
    expect(aim.distance).toBeLessThan(2000);
  });
});

describe('линии и районы', () => {
  it('линия не замкнута, район замкнут', () => {
    expect(outline(make('line', [A, B, C]))).toEqual({ path: [A, B, C], closed: false });
    expect(outline(make('area', [A, B, C]))).toEqual({ path: [A, B, C, A], closed: true });
  });

  it('у точки контура нет', () => {
    expect(outline(make('point', [A]))).toBeNull();
  });

  it('длинный отрезок идёт по геодезической линии', () => {
    const { path } = outline(make('line', [A, [75, 40]]))!;
    expect(path.length).toBeGreaterThan(10);
    expect(path[0]).toEqual(A);
    expect(path.at(-1)).toEqual([75, 40]);
  });

  it('подпись линии — на половине её длины', () => {
    const anchor = labelAnchor(make('line', [A, B, C]));
    const total = distance(A, B) + distance(B, C);
    expect(distance(A, B) + distance(B, anchor)).toBeCloseTo(total / 2, 2);
    expect(anchor[0]).toBeCloseTo(70.5, 6);
  });

  it('подпись района — в центре тяжести', () => {
    const [lng, lat] = labelAnchor(make('area', [A, B, C, D]));
    expect(lng).toBeCloseTo(70.45, 6);
    expect(lat).toBeCloseTo(34.45, 3);
  });

  it('подпись точки — в самой точке', () => {
    expect(labelAnchor(make('point', [A]))).toEqual(A);
  });

  it('наконечник стрелки смотрит вдоль последнего отрезка', () => {
    expect(arrowHeading(make('arrow', [A, B]))).toBeCloseTo(90, 6);
    expect(arrowHeading(make('arrow', [A, B, C]))).toBeCloseTo(0, 6);
    expect(arrowHeading(make('arrow', [C, B, A]))).toBeCloseTo(270, 6);
  });
});

describe('чтение знака', () => {
  const valid = { kind: 'area', points: [A, B, C], color: 'hostile', label: 'Район 1' };

  it('дополняет недостающие поля', () => {
    const graphic = readGraphic(valid)!;
    expect(graphic).toMatchObject({
      kind: 'area',
      label: 'Район 1',
      color: 'hostile',
      dash: 'solid',
      width: 'medium',
      fill: true,
      spread: 60,
    });
    expect(graphic.id).toMatch(/.+/);
  });

  it('отбрасывает знак неизвестного вида или без точек', () => {
    expect(readGraphic({ ...valid, kind: 'круг' })).toBeNull();
    expect(readGraphic({ ...valid, points: [A, B] })).toBeNull();
    expect(readGraphic({ ...valid, points: [A, B, [70, 95]] })).toBeNull();
    expect(readGraphic({ kind: 'sector', points: [] })).toBeNull();
    expect(readGraphic('линия')).toBeNull();
  });

  it('чинит значения сектора', () => {
    const graphic = readGraphic({
      kind: 'sector',
      points: [A, B],
      azimuth: 450,
      spread: 900,
      range: -5,
    })!;
    expect(graphic.points).toEqual([A]);
    expect(graphic.azimuth).toBe(90);
    expect(graphic.spread).toBe(360);
    expect(graphic.range).toBe(1);
  });

  it('заменяет неизвестный стиль стилем по умолчанию', () => {
    const graphic = readGraphic({ ...valid, color: 'розовый', width: 9, fill: 'да' })!;
    expect(graphic).toMatchObject({ color: 'friend', width: 'medium', fill: true });
  });
});

describe('графика в сценарии', () => {
  const graphic = make('sector', [A, D], { label: 'Сектор 1', color: 'hostile' });

  it('сохраняется в файл и читается обратно', () => {
    const scenario = { ...emptyScenario(), name: 'Тест', graphics: [graphic] };
    expect(parseScenario(serializeScenario(scenario))).toEqual(scenario);
  });

  it('файл прежней версии читается без графики', () => {
    const file = '{"format": "maptool-scenario", "version": 1, "name": "Старый", "units": []}';
    expect(parseScenario(file)).toEqual({ ...emptyScenario(), name: 'Старый' });
  });

  it('знак с занятым идентификатором получает новый', () => {
    const { graphics } = readScenario({ graphics: [graphic, graphic] });
    expect(graphics).toHaveLength(2);
    expect(graphics[0].id).toBe(graphic.id);
    expect(graphics[1].id).not.toBe(graphic.id);
  });
});
