import { describe, expect, it } from 'vitest';
import { History } from './history';
import {
  emptyScenario,
  parseScenario,
  readScenario,
  serializeScenario,
  type Scenario,
} from './scenario';
import { createUnit } from './units';

function sample(): Scenario {
  const unit = createUnit({ affiliation: 'friend', type: 'infantry', echelon: 'platoon' }, [70.45, 34.43]);
  unit.callsign = 'Альфа-1';
  unit.ranges = [{ name: 'M240', meters: 800 }];
  unit.notes = 'Держит мост';
  return { ...emptyScenario(), name: 'Джелалабад', units: [unit] };
}

describe('файл сценария', () => {
  it('переживает сохранение и загрузку без потерь', () => {
    const scenario = sample();
    expect(parseScenario(serializeScenario(scenario))).toEqual(scenario);
  });

  it('объясняет, почему файл не подошёл', () => {
    expect(() => parseScenario('не json')).toThrow('это не JSON');
    expect(() => parseScenario('{"units": []}')).toThrow('не файл сценария');
    expect(() => parseScenario('[1, 2]')).toThrow('не файл сценария');
    expect(() =>
      parseScenario('{"format": "maptool-scenario", "version": 99, "units": []}'),
    ).toThrow('более новой версией');
  });
});

describe('readScenario', () => {
  const valid = { id: 'a', affiliation: 'friend', type: 'infantry', position: [70, 34] };

  it('из мусора делает пустой сценарий', () => {
    expect(readScenario(null)).toEqual(emptyScenario());
    expect(
      readScenario({ name: 5, units: 'нет', graphics: 7, routes: {}, clock: 3, profiles: [] }),
    ).toEqual(emptyScenario());
  });

  it('дополняет недостающие поля значениями по умолчанию', () => {
    expect(readScenario({ units: [valid] }).units[0]).toEqual({
      id: 'a',
      affiliation: 'friend',
      type: 'infantry',
      echelon: 'none',
      status: 'present',
      callsign: '',
      position: [70, 34],
      movement: 'foot',
      ranges: [],
      showRanges: false,
      showReach: false,
      notes: '',
    });
  });

  it('отбрасывает юниты без типа, стороны или координат', () => {
    const units = [
      { ...valid, type: 'дракон' },
      { ...valid, affiliation: undefined },
      { ...valid, position: [70] },
      { ...valid, position: [70, 'север'] },
      { ...valid, position: [70, 120] },
      'строка',
      valid,
    ];
    expect(readScenario({ units }).units.map((unit) => unit.id)).toEqual(['a']);
  });

  it('отбрасывает негодные дальности, остальные сохраняет', () => {
    const ranges = [{ name: 'РПГ', meters: 300 }, { name: 'x', meters: -1 }, { meters: 'много' }, 7];
    expect(readScenario({ units: [{ ...valid, ranges }] }).units[0].ranges).toEqual([
      { name: 'РПГ', meters: 300 },
    ]);
  });

  it('разводит одинаковые идентификаторы', () => {
    const [first, second] = readScenario({ units: [valid, valid] }).units;
    expect(first.id).toBe('a');
    expect(second.id).not.toBe('a');
  });
});

describe('History', () => {
  it('отменяет и повторяет по шагам', () => {
    const history = new History<number>();
    history.record(0);
    history.record(1);

    expect(history.undo(2)).toBe(1);
    expect(history.undo(1)).toBe(0);
    expect(history.undo(0)).toBeUndefined();
    expect(history.redo(0)).toBe(1);
    expect(history.redo(1)).toBe(2);
    expect(history.redo(2)).toBeUndefined();
  });

  it('новая правка после отмены стирает ветку повтора', () => {
    const history = new History<number>();
    history.record(0);
    history.undo(1);
    expect(history.canRedo).toBe(true);
    history.record(0);
    expect(history.canRedo).toBe(false);
  });

  it('склеивает быстрые правки с одним ключом в один шаг', () => {
    const history = new History<string>(100, 1000);
    history.record('', 'callsign', 0);
    history.record('А', 'callsign', 300);
    history.record('Ал', 'callsign', 600);

    expect(history.undo('Аль')).toBe('');
    expect(history.canUndo).toBe(false);
  });

  it('не склеивает правки с разными ключами и после паузы', () => {
    const history = new History<string>(100, 1000);
    history.record('a', 'callsign', 0);
    history.record('b', 'notes', 100);
    history.record('c', 'notes', 5000);

    expect(history.undo('d')).toBe('c');
    expect(history.undo('c')).toBe('b');
    expect(history.undo('b')).toBe('a');
  });

  it('не склеивает правку с той, что была до отмены', () => {
    const history = new History<string>(100, 1000);
    history.record('a', 'callsign', 0);
    history.record('b', 'callsign', 100);
    history.undo('c');
    history.record('a', 'callsign', 200);
    expect(history.canUndo).toBe(true);
  });

  it('забывает самые старые шаги сверх лимита', () => {
    const history = new History<number>(2);
    history.record(0);
    history.record(1);
    history.record(2);

    expect(history.undo(3)).toBe(2);
    expect(history.undo(2)).toBe(1);
    expect(history.undo(1)).toBeUndefined();
  });
});

describe('маршруты в сценарии', () => {
  const unit = { id: 'u1', affiliation: 'friend', type: 'infantry', position: [70, 34] };
  const route = {
    id: 'r1',
    name: 'На мост',
    unitId: 'u1',
    color: 'friend',
    movement: 'foot',
    points: [
      [70, 34],
      [70.1, 34.05],
    ],
    surfaces: ['track'],
    startTurn: 2,
  };

  it('сохраняются в файл и читаются обратно вместе с ходом и скоростями', () => {
    const scenario: Scenario = {
      ...readScenario({ units: [unit], routes: [route] }),
      clock: { start: '2003-06-14T05:30', turnMinutes: 15, turn: 7, follow: true },
      profiles: { foot: { road: 5, track: 4, offroad: 2.5, maxSlope: 30 } },
    };
    expect(scenario.routes).toHaveLength(1);
    expect(parseScenario(serializeScenario(scenario))).toEqual(scenario);
  });

  it('файл версии 2 читается без маршрутов, с ходом в десять минут', () => {
    const file = '{"format": "maptool-scenario", "version": 2, "name": "Старый", "units": [], "graphics": []}';
    expect(parseScenario(file)).toEqual({ ...emptyScenario(), name: 'Старый' });
    expect(emptyScenario().clock.turnMinutes).toBe(10);
  });

  it('маршрут пропавшей фишки становится ничьим', () => {
    const { routes } = readScenario({ units: [], routes: [route] });
    expect(routes[0].unitId).toBeNull();
    expect(readScenario({ units: [unit], routes: [route] }).routes[0].unitId).toBe('u1');
  });

  it('маршрут с занятым идентификатором получает новый', () => {
    const { routes } = readScenario({ units: [unit], routes: [route, { ...route, id: 'u1' }] });
    expect(routes.map(({ id }) => id)).toEqual(['r1', expect.not.stringMatching(/^(u1|r1)$/)]);
  });

  it('длина хода чинится при чтении', () => {
    expect(readScenario({ clock: { turnMinutes: 0 } }).clock.turnMinutes).toBe(1);
    expect(readScenario({ clock: { turnMinutes: 'долго' } }).clock.turnMinutes).toBe(10);
  });

  it('файл версии 3 читается с часами на нулевом ходу и выходом на нулевом', () => {
    const file = JSON.stringify({
      format: 'maptool-scenario',
      version: 3,
      name: 'Прежний',
      units: [unit],
      routes: [{ ...route, startTurn: undefined }],
      clock: { turnMinutes: 5 },
    });
    const scenario = parseScenario(file);
    expect(scenario.clock).toEqual({ start: null, turnMinutes: 5, turn: 0, follow: false });
    expect(scenario.routes[0].startTurn).toBe(0);
    expect(scenario.units[0]).toMatchObject({ showRanges: false, showReach: false });
  });

  it('кольца вокруг фишки переживают сохранение', () => {
    const scenario = readScenario({ units: [{ ...unit, showRanges: true, showReach: 'да' }] });
    expect(scenario.units[0]).toMatchObject({ showRanges: true, showReach: false });
    expect(parseScenario(serializeScenario(scenario))).toEqual(scenario);
  });
});
